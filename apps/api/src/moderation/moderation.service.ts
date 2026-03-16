import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExecutionsService } from '../executions/executions.service';
import { PayoutsService } from '../payouts/payouts.service';
import { TasksService } from '../tasks/tasks.service';
import { UsersService } from '../users/users.service';
import { ResolveExecutionDto } from './dto/resolve-execution.dto';
import { AdminActionLog } from './admin-action-log.entity';

@Injectable()
export class ModerationService {
  constructor(
    @InjectRepository(AdminActionLog)
    private readonly logsRepository: Repository<AdminActionLog>,
    private readonly executionsService: ExecutionsService,
    private readonly tasksService: TasksService,
    private readonly usersService: UsersService,
    private readonly payoutsService: PayoutsService,
  ) {}

  getModerationQueue() {
    return this.executionsService.getModerationQueue();
  }

  async resolveExecution(adminId: string, executionId: string, dto: ResolveExecutionDto) {
    const result =
      dto.action === 'confirm'
        ? await this.executionsService.confirmExecution(executionId, dto.comment)
        : await this.executionsService.rejectExecution(
            executionId,
            dto.comment ?? 'Rejected by admin',
          );

    await this.log(adminId, 'resolve_execution', 'execution', executionId, dto.comment);
    return result;
  }

  async hideTask(adminId: string, taskId: string, reason: string) {
    const task = await this.tasksService.hideTask(taskId, reason);
    await this.log(adminId, 'hide_task', 'task', taskId, reason);
    return task;
  }

  async pauseTask(adminId: string, taskId: string) {
    const task = await this.tasksService.adminPauseTask(taskId);
    await this.log(adminId, 'pause_task', 'task', taskId, 'Task paused by admin');
    return task;
  }

  async stopTask(adminId: string, taskId: string) {
    const task = await this.tasksService.adminStopTask(taskId);
    await this.log(adminId, 'stop_task', 'task', taskId, 'Task stopped by admin');
    return task;
  }

  async deleteTask(adminId: string, taskId: string) {
    const result = await this.tasksService.adminDeleteTask(taskId);
    await this.log(adminId, 'delete_task', 'task', taskId, 'Task deleted by admin');
    return result;
  }

  async blockUser(adminId: string, userId: string, reason: string) {
    const user = await this.usersService.blockUser(userId, reason);
    await this.log(adminId, 'block_user', 'user', userId, reason);
    return user;
  }

  async unblockUser(adminId: string, userId: string) {
    const user = await this.usersService.unblockUser(userId);
    await this.log(adminId, 'unblock_user', 'user', userId, 'User was unblocked');
    return user;
  }

  getPayoutRequests() {
    return this.payoutsService.listRequests();
  }

  async listLogs() {
    return this.logsRepository.find({
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  private async log(
    adminId: string,
    action: string,
    targetType: string,
    targetId: string,
    comment?: string,
  ) {
    const admin = await this.usersService.getById(adminId);
    const log = this.logsRepository.create({
      admin,
      action,
      targetType,
      targetId,
      comment,
    });
    await this.logsRepository.save(log);
  }
}
