import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AppJwtPayload } from '../common/types/auth';
import { CreatePayoutRequestDto } from '../wallets/dto/create-payout-request.dto';
import { PayoutsService } from './payouts.service';

@Controller('payout-requests')
@UseGuards(JwtAuthGuard)
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Get('my')
  myRequests(@CurrentUser() user: AppJwtPayload) {
    return this.payoutsService.listMyRequests(user.sub);
  }

  @Post()
  create(@CurrentUser() user: AppJwtPayload, @Body() dto: CreatePayoutRequestDto) {
    return this.payoutsService.create(user.sub, dto);
  }
}
