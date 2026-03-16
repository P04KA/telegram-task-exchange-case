import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Execution } from '../executions/execution.entity';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { User } from '../users/user.entity';
import { WalletsService } from '../wallets/wallets.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { TopUpTaskBudgetDto } from './dto/top-up-task-budget.dto';
import { Task } from './task.entity';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
    @InjectRepository(Execution)
    private readonly executionsRepository: Repository<Execution>,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly walletsService: WalletsService,
  ) {}

  async createTask(customer: User, dto: CreateTaskDto) {
    this.validateAutoCheckTarget(dto);

    const budgetTotal = this.calculateBudgetTotal(dto.pricePerExecution, dto.executionLimit);

    const task = this.tasksRepository.create({
      customer,
      ...dto,
      budgetTotal,
      reserveTtlSeconds: 600,
      confirmationMode: this.resolveConfirmationMode(dto),
    });

    return this.tasksRepository.save(task);
  }

  async createAdminTask(customer: User, dto: CreateTaskDto) {
    return this.createTask(customer, dto);
  }

  async getTaskById(taskId: string) {
    const task = await this.tasksRepository.findOne({
      where: { id: taskId },
      relations: { customer: true },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return task;
  }

  async listFeed(userId: string) {
    const tasks = await this.tasksRepository.find({
      where: {
        status: 'active',
      },
      order: {
        createdAt: 'DESC',
      },
      take: 100,
    });

    const blockedTargetKeys = await this.getBlockedRewardTargetKeys(userId);

    return tasks
      .filter((task) => task.customer.id !== userId)
      .filter((task) => {
        const rewardTargetKey = this.getRewardTargetKey(task);
        return rewardTargetKey ? !blockedTargetKeys.has(rewardTargetKey) : true;
      })
      .filter((task) => this.hasAvailability(task))
      .map((task) => ({
        ...task,
        availableExecutions:
          task.executionLimit -
          task.confirmedExecutionsCount -
          task.activeExecutionsCount -
          task.pendingReviewExecutionsCount,
        remainingBudget: task.budgetHeld,
      }));
  }

  async ensureRewardTargetAvailable(userId: string, task: Task) {
    const rewardTargetKey = this.getRewardTargetKey(task);
    if (!rewardTargetKey) {
      return;
    }

    const blockedTargetKeys = await this.getBlockedRewardTargetKeys(userId);
    if (blockedTargetKeys.has(rewardTargetKey)) {
      throw new BadRequestException(
        'Reward for this Telegram subscription is already claimed or being checked',
      );
    }
  }

  async listOwnTasks(userId: string) {
    return this.tasksRepository.find({
      where: { customer: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  async listAllTasks() {
    return this.tasksRepository.find({
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async publishTask(taskId: string, userId: string, options?: { skipSubscriptionCheck?: boolean }) {
    const task = await this.getTaskById(taskId);
    if (task.customer.id !== userId) {
      throw new BadRequestException('Only task owner can publish task');
    }

    if (!options?.skipSubscriptionCheck) {
      await this.subscriptionsService.ensureActiveSubscription(userId);
    }

    if (task.status !== 'draft' && task.status !== 'paused') {
      throw new BadRequestException('Only draft or paused tasks can be published');
    }

    if (task.budgetHeld <= 0) {
      await this.walletsService.holdFunds(
        userId,
        task.budgetTotal,
        `Reserve budget for task ${task.title}`,
        task.id,
      );
      task.budgetHeld = task.budgetTotal;
    }

    task.status = 'active';
    task.publishedAt = task.publishedAt ?? new Date();
    return this.tasksRepository.save(task);
  }

  async pauseTask(taskId: string, userId: string) {
    const task = await this.getTaskById(taskId);
    if (task.customer.id !== userId) {
      throw new BadRequestException('Only task owner can pause task');
    }

    return this.setTaskPaused(task);
  }

  async stopTask(taskId: string, userId: string) {
    const task = await this.getTaskById(taskId);
    if (task.customer.id !== userId) {
      throw new BadRequestException('Only task owner can stop task');
    }

    return this.setTaskStopped(task);
  }

  async topUpTask(taskId: string, userId: string, dto: TopUpTaskBudgetDto) {
    const task = await this.getTaskById(taskId);
    if (task.customer.id !== userId) {
      throw new BadRequestException('Only task owner can top up task');
    }

    task.budgetTotal += dto.amount;
    if (task.status === 'active') {
      await this.walletsService.holdFunds(
        userId,
        dto.amount,
        `Top up task ${task.title}`,
        task.id,
      );
      task.budgetHeld += dto.amount;
    }

    return this.tasksRepository.save(task);
  }

  async hideTask(taskId: string, reason: string) {
    const task = await this.getTaskById(taskId);
    task.status = 'hidden';
    task.hiddenReason = reason;
    return this.tasksRepository.save(task);
  }

  async deleteDraftTask(taskId: string, userId: string) {
    const task = await this.getTaskById(taskId);
    if (task.customer.id !== userId) {
      throw new BadRequestException('Only task owner can delete task');
    }

    if (task.status !== 'draft') {
      throw new BadRequestException('Only draft tasks can be deleted by owner');
    }

    await this.tasksRepository.remove(task);
    return { success: true };
  }

  async adminPauseTask(taskId: string) {
    const task = await this.getTaskById(taskId);
    return this.setTaskPaused(task);
  }

  async adminStopTask(taskId: string) {
    const task = await this.getTaskById(taskId);
    return this.setTaskStopped(task);
  }

  async adminDeleteTask(taskId: string) {
    const task = await this.getTaskById(taskId);

    if (task.activeExecutionsCount > 0 || task.pendingReviewExecutionsCount > 0 || task.pendingBudget > 0) {
      throw new BadRequestException('Cannot delete task with active or pending executions');
    }

    if (task.budgetHeld > 0) {
      await this.walletsService.releaseHeldFunds(
        task.customer.id,
        task.budgetHeld,
        `Release deleted task budget for ${task.title}`,
        task.id,
      );
      task.budgetHeld = 0;
      await this.tasksRepository.save(task);
    }

    await this.tasksRepository.remove(task);
    return { success: true };
  }

  async markExecutionReserved(taskId: string, amount: number) {
    const task = await this.getTaskById(taskId);
    if (!this.hasAvailability(task)) {
      throw new BadRequestException('No available execution slots');
    }

    if (task.budgetHeld - task.pendingBudget < amount) {
      throw new BadRequestException('Task has insufficient reserved budget');
    }

    task.activeExecutionsCount += 1;
    task.pendingBudget += amount;
    return this.tasksRepository.save(task);
  }

  async markExecutionSubmitted(taskId: string) {
    const task = await this.getTaskById(taskId);
    if (task.activeExecutionsCount > 0) {
      task.activeExecutionsCount -= 1;
    }
    task.pendingReviewExecutionsCount += 1;
    return this.tasksRepository.save(task);
  }

  async markExecutionExpired(taskId: string, amount: number) {
    const task = await this.getTaskById(taskId);
    if (task.activeExecutionsCount > 0) {
      task.activeExecutionsCount -= 1;
    }
    task.pendingBudget = Math.max(task.pendingBudget - amount, 0);
    return this.tasksRepository.save(task);
  }

  async markExecutionRejected(taskId: string, amount: number, fromReview = true) {
    const task = await this.getTaskById(taskId);
    if (fromReview && task.pendingReviewExecutionsCount > 0) {
      task.pendingReviewExecutionsCount -= 1;
    } else if (!fromReview && task.activeExecutionsCount > 0) {
      task.activeExecutionsCount -= 1;
    }

    task.pendingBudget = Math.max(task.pendingBudget - amount, 0);
    await this.finalizeStoppedTaskBudget(task);
    return this.tasksRepository.save(task);
  }

  async markExecutionConfirmed(taskId: string, amount: number, fromReview = true) {
    const task = await this.getTaskById(taskId);
    if (fromReview && task.pendingReviewExecutionsCount > 0) {
      task.pendingReviewExecutionsCount -= 1;
    } else if (!fromReview && task.activeExecutionsCount > 0) {
      task.activeExecutionsCount -= 1;
    }

    task.pendingBudget = Math.max(task.pendingBudget - amount, 0);
    task.budgetSpent += amount;
    task.budgetHeld = Math.max(task.budgetHeld - amount, 0);
    task.confirmedExecutionsCount += 1;

    if (!this.hasAvailability(task) && task.confirmedExecutionsCount >= task.executionLimit) {
      task.status = 'completed';
    }

    await this.finalizeStoppedTaskBudget(task);
    return this.tasksRepository.save(task);
  }

  private async finalizeStoppedTaskBudget(task: Task) {
    if (task.status !== 'stopped' || task.pendingBudget > 0 || task.budgetHeld <= 0) {
      return;
    }

    await this.walletsService.releaseHeldFunds(
      task.customer.id,
      task.budgetHeld,
      `Release final stopped budget for ${task.title}`,
      task.id,
    );
    task.budgetHeld = 0;
  }

  private hasAvailability(task: Task) {
    const availableExecutions =
      task.executionLimit -
      task.confirmedExecutionsCount -
      task.activeExecutionsCount -
      task.pendingReviewExecutionsCount;

    return availableExecutions > 0 && task.status === 'active' && task.budgetHeld > task.pendingBudget;
  }

  private async setTaskPaused(task: Task) {
    task.status = 'paused';
    return this.tasksRepository.save(task);
  }

  private async setTaskStopped(task: Task) {
    task.status = 'stopped';
    task.stoppedAt = new Date();

    const releasableBudget = Math.max(task.budgetHeld - task.pendingBudget, 0);
    if (releasableBudget > 0) {
      await this.walletsService.releaseHeldFunds(
        task.customer.id,
        releasableBudget,
        `Release unused task budget for ${task.title}`,
        task.id,
      );
      task.budgetHeld -= releasableBudget;
    }

    return this.tasksRepository.save(task);
  }

  private getDefaultConfirmationMode(type: Task['type']) {
    if (type === 'join_channel' || type === 'join_chat' || type === 'open_post_or_link') {
      return 'auto';
    }

    return 'manual';
  }

  private async getBlockedRewardTargetKeys(userId: string) {
    const executions = await this.executionsRepository.find({
      where: {
        executor: { id: userId },
      },
      order: { createdAt: 'DESC' },
    });

    return new Set(
      executions
        .filter((execution) =>
          ['in_progress', 'submitted', 'needs_review', 'confirmed', 'disputed'].includes(
            execution.status,
          ),
        )
        .map((execution) => this.getRewardTargetKey(execution.task))
        .filter((targetKey): targetKey is string => Boolean(targetKey)),
    );
  }

  private getRewardTargetKey(task: Pick<Task, 'type' | 'targetChatId' | 'targetLink'>) {
    if (task.type !== 'join_channel' && task.type !== 'join_chat') {
      return null;
    }

    const chatId = task.targetChatId?.trim().toLowerCase();
    if (chatId) {
      return `${task.type}:${chatId}`;
    }

    const targetFromLink = this.extractTelegramTarget(task.targetLink);
    if (!targetFromLink) {
      return null;
    }

    return `${task.type}:${targetFromLink.toLowerCase()}`;
  }

  private extractTelegramTarget(targetLink?: string | null) {
    if (!targetLink) {
      return null;
    }

    try {
      const url = new URL(targetLink);
      const path = url.pathname.replace(/^\/+/, '').split('/')[0];
      if (!path || path.startsWith('+') || path === 'joinchat') {
        return null;
      }

      return path.startsWith('@') ? path : `@${path}`;
    } catch {
      return null;
    }
  }

  private resolveConfirmationMode(dto: CreateTaskDto) {
    if (dto.type === 'join_channel' || dto.type === 'join_chat') {
      return 'auto';
    }

    if (dto.type === 'start_bot') {
      return 'manual';
    }

    return dto.confirmationMode ?? this.getDefaultConfirmationMode(dto.type);
  }

  private validateAutoCheckTarget(dto: CreateTaskDto) {
    if (dto.type !== 'join_channel' && dto.type !== 'join_chat') {
      return;
    }

    if (dto.targetChatId?.trim()) {
      return;
    }

    const targetFromLink = this.extractTelegramTarget(dto.targetLink);
    if (!targetFromLink) {
      throw new BadRequestException(
        'Для автопроверки подписки или вступления укажите публичную ссылку Telegram или targetChatId',
      );
    }
  }

  private calculateBudgetTotal(pricePerExecution: number, executionLimit: number) {
    const total = pricePerExecution * executionLimit;
    if (total < pricePerExecution) {
      throw new BadRequestException('Task budget must cover at least one execution');
    }

    return Number(total.toFixed(2));
  }
}
