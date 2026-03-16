import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExecutionsModule } from '../executions/executions.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { TasksModule } from '../tasks/tasks.module';
import { UsersModule } from '../users/users.module';
import { WalletsModule } from '../wallets/wallets.module';
import { AdminActionLog } from './admin-action-log.entity';
import { AdminController } from './admin.controller';
import { ModerationService } from './moderation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdminActionLog]),
    forwardRef(() => ExecutionsModule),
    forwardRef(() => TasksModule),
    forwardRef(() => UsersModule),
    forwardRef(() => PayoutsModule),
    forwardRef(() => WalletsModule),
  ],
  controllers: [AdminController],
  providers: [ModerationService],
  exports: [ModerationService, TypeOrmModule],
})
export class ModerationModule {}
