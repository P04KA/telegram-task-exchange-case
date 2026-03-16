import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ExecutionsService, EXECUTION_RESERVATIONS_QUEUE } from './executions.service';

@Processor(EXECUTION_RESERVATIONS_QUEUE)
export class ExecutionReservationsProcessor extends WorkerHost {
  constructor(private readonly executionsService: ExecutionsService) {
    super();
  }

  async process(job: Job<{ executionId: string }>) {
    if (job.name === 'expire') {
      await this.executionsService.expireExecution(job.data.executionId);
    }

    if (job.name === 'release-reward') {
      await this.executionsService.releaseExecutionReward(job.data.executionId);
    }
  }
}
