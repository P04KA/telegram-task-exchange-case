import { Column, Entity } from 'typeorm';
import { AppBaseEntity } from '../common/entities/base.entity';
import { numericTransformer } from '../common/utils/numeric-transformer';

@Entity('subscription_plans')
export class SubscriptionPlan extends AppBaseEntity {
  @Column({ unique: true })
  code!: string;

  @Column()
  name!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  price!: number;

  @Column()
  durationDays!: number;

  @Column({ default: true })
  isActive!: boolean;
}
