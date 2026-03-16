import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AppJwtPayload } from '../common/types/auth';
import { CreateExecutionDto } from './dto/create-execution.dto';
import { DisputeExecutionDto } from './dto/dispute-execution.dto';
import { SubmitExecutionDto } from './dto/submit-execution.dto';
import { ExecutionsService } from './executions.service';

@Controller('executions')
@UseGuards(JwtAuthGuard)
export class ExecutionsController {
  constructor(private readonly executionsService: ExecutionsService) {}

  @Get('my')
  myExecutions(@CurrentUser() user: AppJwtPayload) {
    return this.executionsService.listMyExecutions(user.sub);
  }

  @Post()
  create(@CurrentUser() user: AppJwtPayload, @Body() dto: CreateExecutionDto) {
    return this.executionsService.createExecution(user.sub, dto);
  }

  @Post(':id/submit')
  submit(
    @CurrentUser() user: AppJwtPayload,
    @Param('id') executionId: string,
    @Body() dto: SubmitExecutionDto,
  ) {
    return this.executionsService.submitExecution(executionId, user.sub, dto);
  }

  @Post(':id/dispute')
  dispute(
    @CurrentUser() user: AppJwtPayload,
    @Param('id') executionId: string,
    @Body() dto: DisputeExecutionDto,
  ) {
    return this.executionsService.disputeExecution(executionId, user.sub, dto);
  }
}
