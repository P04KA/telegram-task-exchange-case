import {
  Injectable,
  NotFoundException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { WalletsService } from '../wallets/wallets.service';
import { PurchaseSubscriptionDto } from './dto/purchase-subscription.dto';
import { SubscriptionPlan } from './subscription-plan.entity';
import { UserSubscription } from './user-subscription.entity';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(SubscriptionPlan)
    private readonly plansRepository: Repository<SubscriptionPlan>,
    @InjectRepository(UserSubscription)
    private readonly subscriptionsRepository: Repository<UserSubscription>,
    @Inject(forwardRef(() => WalletsService))
    private readonly walletsService: WalletsService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}

  async listPlans() {
    return this.plansRepository.find({
      where: { isActive: true },
      order: { price: 'ASC' },
    });
  }

  async getPlanById(planId: string) {
    const plan = await this.plansRepository.findOne({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }
    return plan;
  }

  async getActiveSubscription(userId: string) {
    const now = new Date();
    return this.subscriptionsRepository.findOne({
      where: {
        user: { id: userId },
        status: 'active',
      },
      order: { endsAt: 'DESC' },
    }).then((subscription) => {
      if (!subscription) {
        return null;
      }

      if (subscription.endsAt < now) {
        subscription.status = 'expired';
        return this.subscriptionsRepository.save(subscription).then(() => null);
      }

      return subscription;
    });
  }

  async ensureActiveSubscription(userId: string) {
    const subscription = await this.getActiveSubscription(userId);
    if (!subscription) {
      throw new NotFoundException('Active subscription is required');
    }
    return subscription;
  }

  async purchase(userId: string, dto: PurchaseSubscriptionDto) {
    const [plan, user] = await Promise.all([
      this.getPlanById(dto.planId),
      this.usersService.getById(userId),
    ]);

    await this.walletsService.debitAvailable(
      userId,
      plan.price,
      'subscription_purchase',
      `Subscription ${plan.name}`,
    );

    const current = await this.getActiveSubscription(userId);
    const start = current?.endsAt && current.endsAt > new Date() ? current.endsAt : new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + plan.durationDays);

    const subscription = this.subscriptionsRepository.create({
      user,
      plan,
      startsAt: start,
      endsAt: end,
      status: 'active',
    });

    return this.subscriptionsRepository.save(subscription);
  }

  async seedDefaultPlans() {
    await this.plansRepository
      .createQueryBuilder()
      .update(SubscriptionPlan)
      .set({ isActive: false })
      .where('1 = 1')
      .execute();

    const existing = await this.plansRepository.findOne({
      where: { code: 'publish_access' },
    });

    const plan = this.plansRepository.create({
      ...(existing ?? {}),
      code: 'publish_access',
      name: 'Доступ к публикации заданий',
      price: 249,
      durationDays: 30,
      isActive: true,
    });

    await this.plansRepository.save(plan);
  }
}
