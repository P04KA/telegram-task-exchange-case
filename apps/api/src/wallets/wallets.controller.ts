import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AppJwtPayload } from '../common/types/auth';
import { TopUpWalletDto } from './dto/top-up-wallet.dto';
import { WalletsService } from './wallets.service';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get()
  getWallet(@CurrentUser() user: AppJwtPayload) {
    return this.walletsService.getWallet(user.sub);
  }

  @Post('top-up')
  topUp(@CurrentUser() user: AppJwtPayload, @Body() dto: TopUpWalletDto) {
    return this.walletsService.topUp(user.sub, dto.amount);
  }
}
