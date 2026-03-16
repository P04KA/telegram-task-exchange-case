import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TelegramMessage {
  message_id: number;
  text?: string;
  chat: {
    id: number;
  };
  from?: TelegramUser;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotService.name);
  private pollingActive = false;
  private pollingTimeout?: NodeJS.Timeout;
  private updateOffset = 0;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const token = this.botToken;
    const mode = this.botMode;

    if (!token || mode === 'disabled') {
      this.logger.log('Telegram bot is disabled');
      return;
    }

    await this.setMyCommands();
    await this.setMenuButton();

    if (mode === 'webhook') {
      await this.registerWebhook();
      return;
    }

    if (mode === 'polling') {
      this.pollingActive = true;
      void this.pollLoop();
      this.logger.log('Telegram bot polling started');
    }
  }

  onModuleDestroy() {
    this.pollingActive = false;
    if (this.pollingTimeout) {
      clearTimeout(this.pollingTimeout);
    }
  }

  buildMiniAppLink(startParam = 'app') {
    const username =
      this.configService.get<string>('TELEGRAM_BOT_USERNAME') ?? 'task_exchange_bot';
    return `https://t.me/${username}?start=${encodeURIComponent(startParam)}`;
  }

  buildWebAppUrl(startParam = 'app') {
    const webAppUrl =
      this.configService.get<string>('WEB_APP_PUBLIC_URL') ??
      this.configService.get<string>('WEB_APP_URL') ??
      'http://localhost:5173';

    const url = new URL(webAppUrl);
    url.searchParams.set('tgWebAppStartParam', startParam);
    return url.toString();
  }

  async handleStart(startParam?: string) {
    const resolvedStartParam = startParam ?? 'app';

    return {
      message: 'Open the Telegram Mini App with the provided launch URL',
      startParam: resolvedStartParam,
      launchUrl: this.buildMiniAppLink(resolvedStartParam),
      webAppUrl: this.buildWebAppUrl(resolvedStartParam),
    };
  }

  async handleWebhookUpdate(update: TelegramUpdate, secretToken?: string) {
    const expectedSecret = this.configService.get<string>('TELEGRAM_WEBHOOK_SECRET');
    if (expectedSecret && expectedSecret !== secretToken) {
      this.logger.warn('Webhook request rejected: invalid secret token');
      return { ok: false };
    }

    await this.processUpdate(update);
    return { ok: true };
  }

  async sendLaunchMessage(chatId: number, startParam = 'app') {
    const text = [
      'Биржа заданий готова к запуску.',
      'Откройте Mini App кнопкой ниже.',
    ].join('\n');

    return this.callTelegram('sendMessage', {
      chat_id: chatId,
      text,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Открыть Mini App',
              web_app: {
                url: this.buildWebAppUrl(startParam),
              },
            },
          ],
        ],
      },
    });
  }

  async sendMessage(chatId: string | number, text: string) {
    return this.callTelegram('sendMessage', {
      chat_id: chatId,
      text,
    });
  }

  private get botToken() {
    return this.configService.get<string>('TELEGRAM_BOT_TOKEN');
  }

  private get botMode() {
    return this.configService.get<string>('TELEGRAM_BOT_MODE') ?? 'disabled';
  }

  private async setMyCommands() {
    await this.callTelegram('setMyCommands', {
      commands: [
        {
          command: 'start',
          description: 'Open task exchange Mini App',
        },
      ],
    }).catch((error: unknown) => {
      this.logger.warn(`Failed to set bot commands: ${(error as Error).message}`);
    });
  }

  private async setMenuButton() {
    const webAppUrl = this.configService.get<string>('WEB_APP_PUBLIC_URL');
    if (!webAppUrl) {
      return;
    }

    await this.callTelegram('setChatMenuButton', {
      menu_button: {
        type: 'web_app',
        text: 'Open App',
        web_app: {
          url: this.buildWebAppUrl(),
        },
      },
    }).catch((error: unknown) => {
      this.logger.warn(`Failed to set menu button: ${(error as Error).message}`);
    });
  }

  private async registerWebhook() {
    const webhookUrl = this.configService.get<string>('TELEGRAM_WEBHOOK_URL');
    if (!webhookUrl) {
      this.logger.warn('TELEGRAM_WEBHOOK_URL is not configured, webhook mode skipped');
      return;
    }

    await this.callTelegram('setWebhook', {
      url: webhookUrl,
      secret_token: this.configService.get<string>('TELEGRAM_WEBHOOK_SECRET') || undefined,
      allowed_updates: ['message'],
    });
    this.logger.log(`Telegram webhook registered: ${webhookUrl}`);
  }

  private async pollLoop() {
    while (this.pollingActive) {
      try {
        const response = await this.callTelegram<TelegramUpdate[]>('getUpdates', {
          timeout: 25,
          offset: this.updateOffset,
          allowed_updates: ['message'],
        });

        for (const update of response) {
          this.updateOffset = update.update_id + 1;
          await this.processUpdate(update);
        }
      } catch (error) {
        this.logger.error(`Polling failed: ${(error as Error).message}`);
      }

      await new Promise<void>((resolve) => {
        this.pollingTimeout = setTimeout(() => resolve(), 1000);
      });
    }
  }

  private async processUpdate(update: TelegramUpdate) {
    const message = update.message;
    if (!message?.text) {
      return;
    }

    if (message.text.startsWith('/start')) {
      const startParam = message.text.split(' ')[1] ?? 'app';
      await this.sendLaunchMessage(message.chat.id, startParam);
    }
  }

  private async callTelegram<T = unknown>(
    method: string,
    payload: Record<string, unknown>,
  ): Promise<T> {
    if (!this.botToken) {
      throw new Error('TELEGRAM_BOT_TOKEN is not configured');
    }

    const response = await fetch(
      `https://api.telegram.org/bot${this.botToken}/${method}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      throw new Error(`Telegram API HTTP error ${response.status}`);
    }

    const result = (await response.json()) as {
      ok: boolean;
      result?: T;
      description?: string;
    };

    if (!result.ok) {
      throw new Error(result.description ?? 'Telegram API request failed');
    }

    return result.result as T;
  }
}
