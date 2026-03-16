import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Execution } from '../executions/execution.entity';
import { Task } from '../tasks/task.entity';
import { User } from '../users/user.entity';
import { VerificationAttempt } from './verification-attempt.entity';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    @InjectRepository(VerificationAttempt)
    private readonly attemptsRepository: Repository<VerificationAttempt>,
    private readonly configService: ConfigService,
  ) {}

  async verify(task: Task, proof: string, executor: User) {
    if (task.type === 'open_post_or_link' && task.confirmationMode === 'auto' && proof.length > 3) {
      return {
        result: 'confirmed' as const,
        detail: 'Link open task auto-confirmed by proof presence',
      };
    }

    if (task.type === 'join_channel' || task.type === 'join_chat') {
      const membershipCheck = await this.verifyTelegramMembership(task, executor);
      if (membershipCheck) {
        return membershipCheck;
      }
    }

    return {
      result: 'needs_review' as const,
      detail: 'Task requires manual review',
    };
  }

  async recordAttempt(
    execution: Execution,
    result: 'confirmed' | 'needs_review' | 'failed',
    payload: string,
  ) {
    const attempt = this.attemptsRepository.create({
      execution,
      result,
      payload,
    });
    return this.attemptsRepository.save(attempt);
  }

  private async verifyTelegramMembership(task: Task, executor: User) {
    const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!botToken) {
      return {
        result: 'failed' as const,
        detail: 'Telegram bot token is missing, membership check cannot be completed',
      };
    }

    const chatId = task.targetChatId ?? this.extractTelegramTarget(task.targetLink);
    if (!chatId) {
      return {
        result: 'failed' as const,
        detail: 'Task target is not resolvable to Telegram chat ID or username',
      };
    }

    try {
      const member = await this.callTelegram<{
        status: 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked';
        is_member?: boolean;
      }>(botToken, 'getChatMember', {
        chat_id: chatId,
        user_id: Number(executor.telegramId),
      });

      const isMember =
        member.status === 'creator' ||
        member.status === 'administrator' ||
        member.status === 'member' ||
        (member.status === 'restricted' && member.is_member === true);

      return {
        result: isMember ? ('confirmed' as const) : ('failed' as const),
        detail: isMember
          ? `Telegram membership confirmed for ${chatId}`
          : 'Подписка или вступление пока не подтверждены Telegram',
      };
    } catch (error) {
      this.logger.warn(
        `Membership check failed for task ${task.id}: ${(error as Error).message}`,
      );
      return {
        result: 'failed' as const,
        detail: this.formatMembershipCheckError(error),
      };
    }
  }

  private extractTelegramTarget(targetLink?: string | null) {
    if (!targetLink) {
      return null;
    }

    try {
      const url = new URL(targetLink);
      const path = url.pathname.replace(/^\/+/, '').split('/')[0];
      if (!path) {
        return null;
      }

      if (path.startsWith('+') || path === 'joinchat') {
        return null;
      }

      return path.startsWith('@') ? path : `@${path}`;
    } catch {
      return null;
    }
  }

  private async callTelegram<T>(
    botToken: string,
    method: string,
    payload: Record<string, unknown>,
  ) {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = (await response.json()) as {
      ok: boolean;
      result?: T;
      description?: string;
    };

    if (!response.ok) {
      throw new Error(result.description ?? `Telegram API HTTP ${response.status}`);
    }

    if (!result.ok) {
      throw new Error(result.description ?? 'Telegram API request failed');
    }

    return result.result as T;
  }

  private formatMembershipCheckError(error: unknown) {
    const message = (error as Error).message ?? 'Telegram API request failed';

    if (message.includes('member list is inaccessible')) {
      return 'Telegram не дает этому боту читать список участников. Добавьте бота администратором в канал или чат, иначе автопроверка не сможет работать.';
    }

    if (message.includes('chat not found')) {
      return 'Telegram не нашел канал или чат для автопроверки. Проверьте ссылку и убедитесь, что бот добавлен в нужный канал или чат.';
    }

    if (message.includes('user not found')) {
      return 'Telegram не смог найти пользователя для проверки подписки. Попробуйте открыть приложение из Telegram и повторить попытку.';
    }

    return `Membership check failed: ${message}`;
  }
}
