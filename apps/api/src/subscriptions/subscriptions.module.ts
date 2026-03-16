import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { WalletsModule } from '../wallets/wallets.module';
import { SubscriptionPlan } from './subscription-plan.entity';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { UserSubscription } from './user-subscription.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([SubscriptionPlan, UserSubscription]),
    forwardRef(() => WalletsModule),
    forwardRef(() => UsersModule),
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService, TypeOrmModule],
})
export class SubscriptionsModule {}
