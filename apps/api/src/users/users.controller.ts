import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AppJwtPayload } from '../common/types/auth';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { WalletsService } from '../wallets/wallets.service';
import { UsersService } from './users.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly walletsService: WalletsService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  @Get('me')
  async getMe(@CurrentUser() user: AppJwtPayload) {
    const [profile, wallet, activeSubscription] = await Promise.all([
      this.usersService.getById(user.sub),
      this.walletsService.ensureWallet(user.sub),
      this.subscriptionsService.getActiveSubscription(user.sub),
    ]);

    return {
      ...profile,
      wallet,
      activeSubscription,
    };
  }
}
