import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Execution } from '../executions/execution.entity';
import { PayoutRequest } from '../payouts/payout-request.entity';
import { Task } from '../tasks/task.entity';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
    @InjectRepository(Execution)
    private readonly executionsRepository: Repository<Execution>,
    @InjectRepository(PayoutRequest)
    private readonly payoutsRepository: Repository<PayoutRequest>,
  ) {}

  async getDashboard() {
    const [activeTasks, pendingDisputes, pendingPayouts, completedExecutions, tasks] =
      await Promise.all([
        this.tasksRepository.count({ where: { status: 'active' } }),
        this.executionsRepository.count({ where: { status: 'disputed' } }),
        this.payoutsRepository.count({ where: { status: 'pending' } }),
        this.executionsRepository.find({ where: { status: 'confirmed' } }),
        this.tasksRepository.find(),
      ]);

    const gmv = tasks.reduce((sum, task) => sum + task.budgetSpent, 0);
    const rewards = completedExecutions.reduce(
      (sum, execution) => sum + execution.task.pricePerExecution,
      0,
    );

    return {
      activeTasks,
      pendingDisputes,
      pendingPayouts,
      gmv,
      rewards,
    };
  }
}
