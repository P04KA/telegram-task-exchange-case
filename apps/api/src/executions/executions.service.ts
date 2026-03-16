import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { Dispute } from '../moderation/dispute.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Task } from '../tasks/task.entity';
import { TasksService } from '../tasks/tasks.service';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { VerificationService } from '../verification/verification.service';
import { WalletsService } from '../wallets/wallets.service';
import { CreateExecutionDto } from './dto/create-execution.dto';
import { DisputeExecutionDto } from './dto/dispute-execution.dto';
import { SubmitExecutionDto } from './dto/submit-execution.dto';
import { Execution } from './execution.entity';

export const EXECUTION_RESERVATIONS_QUEUE = 'execution-reservations';
const REWARD_HOLD_MS = 48 * 60 * 60 * 1000;

@Injectable()
export class ExecutionsService {
  constructor(
    @InjectRepository(Execution)
    private readonly executionsRepository: Repository<Execution>,
    @InjectRepository(Dispute)
    private readonly disputesRepository: Repository<Dispute>,
    private readonly tasksService: TasksService,
    private readonly usersService: UsersService,
    private readonly verificationService: VerificationService,
    private readonly walletsService: WalletsService,
    private readonly notificationsService: NotificationsService,
    @InjectQueue(EXECUTION_RESERVATIONS_QUEUE)
    private readonly reservationsQueue: Queue,
  ) {}

  async listMyExecutions(userId: string) {
    return this.executionsRepository.find({
      where: {
        executor: { id: userId },
      },
      order: { createdAt: 'DESC' },
    });
  }

  async createExecution(userId: string, dto: CreateExecutionDto) {
    const [task, executor] = await Promise.all([
      this.tasksService.getTaskById(dto.taskId),
      this.usersService.getById(userId),
    ]);

    if (executor.isBlocked) {
      throw new BadRequestException('Blocked users cannot execute tasks');
    }

    if (!executor.isExecutor) {
      throw new BadRequestException('Executor role is disabled for this user');
    }

    if (task.customer.id === userId) {
      throw new BadRequestException('Cannot execute your own task');
    }

    await this.tasksService.ensureRewardTargetAvailable(userId, task);

    const existing = await this.executionsRepository.findOne({
      where: {
        task: { id: task.id },
        executor: { id: userId },
      },
      order: { createdAt: 'DESC' },
    });

    if (existing && existing.status !== 'expired') {
      throw new BadRequestException('Executor already interacted with this task');
    }

    await this.tasksService.markExecutionReserved(task.id, task.pricePerExecution);

    const reservedUntil = new Date(Date.now() + task.reserveTtlSeconds * 1000);
    const execution = this.executionsRepository.create({
      task,
      executor,
      status: 'in_progress',
      reservedUntil,
    });
    const saved = await this.executionsRepository.save(execution);

    await this.reservationsQueue.add(
      'expire',
      { executionId: saved.id },
      {
        delay: task.reserveTtlSeconds * 1000,
        jobId: saved.id,
      },
    );

    return saved;
  }

  async submitExecution(executionId: string, userId: string, dto: SubmitExecutionDto) {
    const execution = await this.getExecutionById(executionId);

    if (execution.executor.id !== userId) {
      throw new BadRequestException('Only execution owner can submit proof');
    }

    if (execution.status !== 'in_progress') {
      if (
        execution.status === 'confirmed' ||
        execution.status === 'needs_review' ||
        execution.status === 'submitted' ||
        execution.status === 'disputed'
      ) {
        return execution;
      }

      if (execution.status === 'expired') {
        throw new BadRequestException(
          'Резерв по этому заданию уже истек. Возьмите задание заново, если оно еще доступно.',
        );
      }

      if (execution.status === 'rejected') {
        throw new BadRequestException(
          'Это выполнение уже отклонено. При необходимости откройте спор в карточке задания.',
        );
      }

      throw new BadRequestException('Проверку можно отправить только для задания в работе');
    }

    if (execution.reservedUntil < new Date()) {
      await this.expireExecution(execution.id);
      throw new BadRequestException('Execution reserve has expired');
    }

    const proof = this.getSubmissionProof(execution.task, dto.proof);

    const verification = await this.verificationService.verify(
      execution.task,
      proof,
      execution.executor,
    );

    if (verification.result === 'confirmed') {
      execution.proof = proof;
      execution.submittedAt = new Date();
      const savedExecution = await this.finalizeConfirmedExecution(execution, false, {
        customerSettlementDescription: `Confirmed execution for task ${execution.task.title}`,
        rewardHoldDescription: `Reward hold for task ${execution.task.title}`,
        userNotification: `Задание ${execution.task.title} подтверждено. Награда будет доступна через 48 часов.`,
      });

      await this.verificationService.recordAttempt(
        savedExecution,
        'confirmed',
        JSON.stringify({
          proof,
          detail: verification.detail,
        }),
      );
      return savedExecution;
    }

    if (this.isAutoVerifiedTask(execution.task)) {
      await this.verificationService.recordAttempt(
        execution,
        'failed',
        JSON.stringify({
          proof,
          detail: verification.detail,
        }),
      );
      throw new BadRequestException(verification.detail);
    }

    execution.proof = proof;
    execution.submittedAt = new Date();
    execution.status = 'needs_review';
    await this.tasksService.markExecutionSubmitted(execution.task.id);
    await this.notificationsService.sendUserNotification(
      userId,
      `Execution ${execution.id} is pending moderation`,
    );

    await this.verificationService.recordAttempt(
      execution,
      verification.result,
      JSON.stringify({
        proof,
        detail: verification.detail,
      }),
    );
    return this.executionsRepository.save(execution);
  }

  async disputeExecution(executionId: string, userId: string, dto: DisputeExecutionDto) {
    const execution = await this.getExecutionById(executionId);

    if (execution.executor.id !== userId) {
      throw new BadRequestException('Only execution owner can open dispute');
    }

    if (execution.status !== 'rejected') {
      throw new BadRequestException('Only rejected execution can be disputed');
    }

    execution.status = 'disputed';
    await this.executionsRepository.save(execution);

    const dispute = this.disputesRepository.create({
      execution,
      user: execution.executor,
      reason: dto.reason,
      status: 'open',
    });

    await this.notificationsService.sendAdminNotification(
      `New dispute ${execution.id} requires review`,
    );

    return this.disputesRepository.save(dispute);
  }

  async expireExecution(executionId: string) {
    const execution = await this.getExecutionById(executionId);
    if (execution.status !== 'in_progress') {
      return execution;
    }

    execution.status = 'expired';
    execution.resolvedAt = new Date();
    await this.tasksService.markExecutionExpired(
      execution.task.id,
      execution.task.pricePerExecution,
    );
    return this.executionsRepository.save(execution);
  }

  async confirmExecution(executionId: string, adminComment?: string) {
    const execution = await this.getExecutionById(executionId);

    if (execution.status !== 'needs_review' && execution.status !== 'disputed') {
      throw new BadRequestException('Execution is not in review queue');
    }

    return this.finalizeConfirmedExecution(execution, true, {
      customerSettlementDescription: `Admin confirmed execution for task ${execution.task.title}`,
      rewardHoldDescription: `Reward hold for task ${execution.task.title}`,
      userNotification: `Задание ${execution.task.title} подтверждено администратором. Награда будет доступна через 48 часов.`,
    });
  }

  async rejectExecution(executionId: string, reason: string) {
    const execution = await this.getExecutionById(executionId);

    if (execution.status !== 'needs_review' && execution.status !== 'disputed') {
      throw new BadRequestException('Execution is not in review queue');
    }

    execution.status = 'rejected';
    execution.resolvedAt = new Date();
    execution.rejectedReason = reason;

    await this.tasksService.markExecutionRejected(
      execution.task.id,
      execution.task.pricePerExecution,
      true,
    );
    await this.notificationsService.sendUserNotification(
      execution.executor.id,
      `Execution ${execution.id} was rejected: ${reason}`,
    );

    return this.executionsRepository.save(execution);
  }

  async releaseExecutionReward(executionId: string) {
    const execution = await this.getExecutionById(executionId);

    if (execution.status !== 'confirmed' || execution.rewardReleasedAt || !execution.rewardAvailableAt) {
      return execution;
    }

    if (execution.rewardAvailableAt > new Date()) {
      return execution;
    }

    await this.walletsService.releaseExecutionReward(
      execution.executor.id,
      execution.task.pricePerExecution,
      `Reward unlocked for task ${execution.task.title}`,
      execution.id,
    );

    execution.rewardReleasedAt = new Date();
    await this.notificationsService.sendUserNotification(
      execution.executor.id,
      `Награда за задание ${execution.task.title} разблокирована и доступна к выплате.`,
    );

    return this.executionsRepository.save(execution);
  }

  private async finalizeConfirmedExecution(
    execution: Execution,
    fromReview: boolean,
    options: {
      customerSettlementDescription: string;
      rewardHoldDescription: string;
      userNotification: string;
    },
  ) {
    const now = new Date();
    const rewardAvailableAt = new Date(now.getTime() + REWARD_HOLD_MS);

    execution.status = 'confirmed';
    execution.resolvedAt = now;
    execution.rejectedReason = null;
    execution.rewardAvailableAt = rewardAvailableAt;
    execution.rewardReleasedAt = null;

    await this.tasksService.markExecutionConfirmed(
      execution.task.id,
      execution.task.pricePerExecution,
      fromReview,
    );
    await this.walletsService.settleHeldFunds(
      execution.task.customer.id,
      execution.task.pricePerExecution,
      options.customerSettlementDescription,
      execution.id,
    );
    await this.walletsService.holdExecutionReward(
      execution.executor.id,
      execution.task.pricePerExecution,
      options.rewardHoldDescription,
      execution.id,
    );

    const savedExecution = await this.executionsRepository.save(execution);
    await this.reservationsQueue.add(
      'release-reward',
      { executionId: savedExecution.id },
      {
        delay: REWARD_HOLD_MS,
        jobId: `reward-release:${savedExecution.id}`,
      },
    );
    await this.notificationsService.sendUserNotification(
      execution.executor.id,
      options.userNotification,
    );

    return savedExecution;
  }

  private isAutoVerifiedTask(task: Task) {
    return (
      task.confirmationMode === 'auto' &&
      (task.type === 'join_channel' || task.type === 'join_chat')
    );
  }

  private getSubmissionProof(task: Task, proof?: string) {
    const normalizedProof = proof?.trim();
    if (normalizedProof) {
      return normalizedProof;
    }

    if (this.isAutoVerifiedTask(task)) {
      return 'Telegram membership auto-check requested';
    }

    return 'Proof submitted by executor';
  }

  async getModerationQueue() {
    return this.executionsRepository.find({
      where: [{ status: 'needs_review' }, { status: 'disputed' }],
      order: { createdAt: 'ASC' },
    });
  }

  async getExecutionById(executionId: string) {
    const execution = await this.executionsRepository.findOne({
      where: { id: executionId },
      relations: {
        task: { customer: true },
        executor: true,
      },
    });

    if (!execution) {
      throw new NotFoundException('Execution not found');
    }

    return execution;
  }
}
