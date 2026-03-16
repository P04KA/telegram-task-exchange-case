import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../common/entities/base.entity';
import { User } from '../users/user.entity';
import { SubscriptionPlan } from './subscription-plan.entity';

@Entity('user_subscriptions')
export class UserSubscription extends AppBaseEntity {
  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  user!: User;

  @ManyToOne(() => SubscriptionPlan, { eager: true })
  @JoinColumn()
  plan!: SubscriptionPlan;

  @Column({ type: 'timestamp' })
  startsAt!: Date;

  @Column({ type: 'timestamp' })
  endsAt!: Date;

  @Column({ type: 'varchar', default: 'active' })
  status!: 'active' | 'expired';
}
