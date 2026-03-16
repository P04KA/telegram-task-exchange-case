import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AppJwtPayload } from '../common/types/auth';
import { PayoutsService } from '../payouts/payouts.service';
import { CreateTaskDto } from '../tasks/dto/create-task.dto';
import { TasksService } from '../tasks/tasks.service';
import { UsersService } from '../users/users.service';
import { TopUpWalletDto } from '../wallets/dto/top-up-wallet.dto';
import { WalletsService } from '../wallets/wallets.service';
import { BlockUserDto } from './dto/block-user.dto';
import { HideTaskDto } from './dto/hide-task.dto';
import { ResolveExecutionDto } from './dto/resolve-execution.dto';
import { ModerationService } from './moderation.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(
    private readonly moderationService: ModerationService,
    private readonly payoutsService: PayoutsService,
    private readonly usersService: UsersService,
    private readonly walletsService: WalletsService,
    private readonly tasksService: TasksService,
  ) {}

  @Get('users')
  getUsers() {
    return this.usersService.listUsers();
  }

  @Get('moderation/executions')
  getModerationQueue() {
    return this.moderationService.getModerationQueue();
  }

  @Post('executions/:id/resolve')
  resolveExecution(
    @CurrentUser() admin: AppJwtPayload,
    @Param('id') executionId: string,
    @Body() dto: ResolveExecutionDto,
  ) {
    return this.moderationService.resolveExecution(admin.sub, executionId, dto);
  }

  @Get('payout-requests')
  getPayoutRequests() {
    return this.moderationService.getPayoutRequests();
  }

  @Post('payout-requests/:id/approve')
  approvePayout(@CurrentUser() admin: AppJwtPayload, @Param('id') payoutId: string) {
    return this.payoutsService.approve(admin.sub, payoutId);
  }

  @Post('payout-requests/:id/reject')
  rejectPayout(
    @CurrentUser() admin: AppJwtPayload,
    @Param('id') payoutId: string,
    @Body() dto: HideTaskDto,
  ) {
    return this.payoutsService.reject(admin.sub, payoutId, dto.reason);
  }

  @Get('tasks')
  getAdminTasks() {
    return this.tasksService.listAllTasks();
  }

  @Post('tasks')
  async createAdminTask(
    @CurrentUser() admin: AppJwtPayload,
    @Body() dto: CreateTaskDto,
  ) {
    const adminUser = await this.usersService.getById(admin.sub);
    return this.tasksService.createAdminTask(adminUser, dto);
  }

  @Post('tasks/:id/publish')
  publishAdminTask(
    @CurrentUser() admin: AppJwtPayload,
    @Param('id') taskId: string,
  ) {
    return this.tasksService.publishTask(taskId, admin.sub, {
      skipSubscriptionCheck: true,
    });
  }

  @Post('tasks/:id/pause')
  pauseAdminTask(@CurrentUser() admin: AppJwtPayload, @Param('id') taskId: string) {
    return this.moderationService.pauseTask(admin.sub, taskId);
  }

  @Post('tasks/:id/stop')
  stopAdminTask(@CurrentUser() admin: AppJwtPayload, @Param('id') taskId: string) {
    return this.moderationService.stopTask(admin.sub, taskId);
  }

  @Post('tasks/:id/hide')
  hideTask(
    @CurrentUser() admin: AppJwtPayload,
    @Param('id') taskId: string,
    @Body() dto: HideTaskDto,
  ) {
    return this.moderationService.hideTask(admin.sub, taskId, dto.reason);
  }

  @Post('tasks/:id/delete')
  deleteAdminTask(@CurrentUser() admin: AppJwtPayload, @Param('id') taskId: string) {
    return this.moderationService.deleteTask(admin.sub, taskId);
  }

  @Post('users/:id/wallet/top-up')
  topUpUserWallet(
    @Param('id') userId: string,
    @Body() dto: TopUpWalletDto,
  ) {
    return this.walletsService.topUp(userId, dto.amount, 'Admin balance credit');
  }

  @Post('users/:id/block')
  blockUser(
    @CurrentUser() admin: AppJwtPayload,
    @Param('id') userId: string,
    @Body() dto: BlockUserDto,
  ) {
    return this.moderationService.blockUser(admin.sub, userId, dto.reason);
  }

  @Post('users/:id/unblock')
  unblockUser(@CurrentUser() admin: AppJwtPayload, @Param('id') userId: string) {
    return this.moderationService.unblockUser(admin.sub, userId);
  }

  @Get('logs')
  getLogs() {
    return this.moderationService.listLogs();
  }
}
