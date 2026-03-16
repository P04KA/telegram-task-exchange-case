import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { WalletsModule } from '../wallets/wallets.module';
import { PayoutRequest } from './payout-request.entity';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PayoutRequest]),
    forwardRef(() => WalletsModule),
    forwardRef(() => UsersModule),
    NotificationsModule,
  ],
  controllers: [PayoutsController],
  providers: [PayoutsService],
  exports: [PayoutsService, TypeOrmModule],
})
export class PayoutsModule {}
