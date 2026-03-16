import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatePayoutRequestDto } from '../wallets/dto/create-payout-request.dto';
import { WalletsService } from '../wallets/wallets.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PayoutRequest } from './payout-request.entity';

@Injectable()
export class PayoutsService {
  constructor(
    @InjectRepository(PayoutRequest)
    private readonly payoutsRepository: Repository<PayoutRequest>,
    private readonly walletsService: WalletsService,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(userId: string, dto: CreatePayoutRequestDto) {
    const user = await this.usersService.getById(userId);
    await this.walletsService.freezeForPayout(
      userId,
      dto.amount,
      'Freeze funds for payout request',
    );

    const payout = this.payoutsRepository.create({
      user,
      amount: dto.amount,
      phoneNumber: dto.phoneNumber,
      bankName: dto.bankName,
      payoutDetails: dto.payoutDetails,
      status: 'pending',
    });

    const savedPayout = await this.payoutsRepository.save(payout);

    await this.notificationsService.sendAdminNotification(
      [
        'Новая заявка на вывод средств',
        `Пользователь: @${user.username}`,
        `Сумма: ${dto.amount} RUB`,
        `Телефон: ${dto.phoneNumber}`,
        `Банк: ${dto.bankName}`,
        dto.payoutDetails ? `Комментарий: ${dto.payoutDetails}` : null,
        `ID заявки: ${savedPayout.id}`,
      ]
        .filter(Boolean)
        .join('\n'),
    );

    await this.notificationsService.sendUserNotification(
      userId,
      [
        'Заявка на вывод принята.',
        'Администрация свяжется с вами в течение 24 часов и выполнит вывод средств.',
        `Сумма: ${dto.amount} RUB`,
        `Банк: ${dto.bankName}`,
        `Телефон: ${dto.phoneNumber}`,
      ].join('\n'),
    );

    return savedPayout;
  }

  async listMyRequests(userId: string) {
    return this.payoutsRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  async listRequests() {
    return this.payoutsRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async approve(_adminId: string, payoutId: string) {
    const payout = await this.getById(payoutId);
    if (payout.status !== 'pending') {
      throw new BadRequestException('Only pending payout can be approved');
    }

    payout.status = 'paid';
    payout.processedAt = new Date();
    await this.walletsService.completePayout(
      payout.user.id,
      payout.amount,
      'Payout approved and paid',
      payout.id,
    );
    await this.notificationsService.sendUserNotification(
      payout.user.id,
      `Заявка на вывод ${payout.id} отмечена как выплаченная.`,
    );
    return this.payoutsRepository.save(payout);
  }

  async reject(_adminId: string, payoutId: string, reason: string) {
    const payout = await this.getById(payoutId);
    if (payout.status !== 'pending') {
      throw new BadRequestException('Only pending payout can be rejected');
    }

    payout.status = 'rejected';
    payout.adminComment = reason;
    payout.processedAt = new Date();
    await this.walletsService.rejectPayout(
      payout.user.id,
      payout.amount,
      'Payout rejected',
      payout.id,
    );
    await this.notificationsService.sendUserNotification(
      payout.user.id,
      `Заявка на вывод ${payout.id} отклонена: ${reason}`,
    );
    return this.payoutsRepository.save(payout);
  }

  async getById(payoutId: string) {
    const payout = await this.payoutsRepository.findOne({ where: { id: payoutId } });
    if (!payout) {
      throw new NotFoundException('Payout request not found');
    }
    return payout;
  }
}
