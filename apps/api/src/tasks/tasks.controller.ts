import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AppJwtPayload } from '../common/types/auth';
import { UsersService } from '../users/users.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { TopUpTaskBudgetDto } from './dto/top-up-task-budget.dto';
import { TasksService } from './tasks.service';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly usersService: UsersService,
  ) {}

  @Get('feed')
  feed(@CurrentUser() user: AppJwtPayload) {
    return this.tasksService.listFeed(user.sub);
  }

  @Get('my')
  myTasks(@CurrentUser() user: AppJwtPayload) {
    return this.tasksService.listOwnTasks(user.sub);
  }

  @Post()
  async createTask(@CurrentUser() user: AppJwtPayload, @Body() dto: CreateTaskDto) {
    const customer = await this.usersService.getById(user.sub);
    return this.tasksService.createTask(customer, dto);
  }

  @Post(':id/publish')
  publish(@CurrentUser() user: AppJwtPayload, @Param('id') taskId: string) {
    return this.tasksService.publishTask(taskId, user.sub);
  }

  @Post(':id/pause')
  pause(@CurrentUser() user: AppJwtPayload, @Param('id') taskId: string) {
    return this.tasksService.pauseTask(taskId, user.sub);
  }

  @Post(':id/stop')
  stop(@CurrentUser() user: AppJwtPayload, @Param('id') taskId: string) {
    return this.tasksService.stopTask(taskId, user.sub);
  }

  @Post(':id/top-up')
  topUp(
    @CurrentUser() user: AppJwtPayload,
    @Param('id') taskId: string,
    @Body() dto: TopUpTaskBudgetDto,
  ) {
    return this.tasksService.topUpTask(taskId, user.sub, dto);
  }

  @Post(':id/delete')
  deleteDraft(@CurrentUser() user: AppJwtPayload, @Param('id') taskId: string) {
    return this.tasksService.deleteDraftTask(taskId, user.sub);
  }
}
