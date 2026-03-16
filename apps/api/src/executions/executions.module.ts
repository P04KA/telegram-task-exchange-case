import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module';
import { Dispute } from '../moderation/dispute.entity';
import { TasksModule } from '../tasks/tasks.module';
import { UsersModule } from '../users/users.module';
import { VerificationModule } from '../verification/verification.module';
import { WalletsModule } from '../wallets/wallets.module';
import { ExecutionReservationsProcessor } from './execution-reservations.processor';
import { Execution } from './execution.entity';
import { ExecutionsController } from './executions.controller';
import { ExecutionsService, EXECUTION_RESERVATIONS_QUEUE } from './executions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Execution, Dispute]),
    BullModule.registerQueue({
      name: EXECUTION_RESERVATIONS_QUEUE,
    }),
    TasksModule,
    UsersModule,
    VerificationModule,
    WalletsModule,
    NotificationsModule,
  ],
  controllers: [ExecutionsController],
  providers: [ExecutionsService, ExecutionReservationsProcessor],
  exports: [ExecutionsService, TypeOrmModule],
})
export class ExecutionsModule {}
