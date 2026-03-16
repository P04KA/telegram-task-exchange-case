import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../common/entities/base.entity';
import { numericTransformer } from '../common/utils/numeric-transformer';
import { User } from '../users/user.entity';

@Entity('payout_requests')
export class PayoutRequest extends AppBaseEntity {
  @ManyToOne(() => User, (user) => user.payoutRequests, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  user!: User;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  amount!: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  phoneNumber?: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  bankName?: string | null;

  @Column({ type: 'varchar', default: 'pending' })
  status!: 'pending' | 'approved' | 'paid' | 'rejected';

  @Column({ type: 'text', nullable: true })
  payoutDetails?: string | null;

  @Column({ type: 'text', nullable: true })
  adminComment?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  processedAt?: Date | null;
}
