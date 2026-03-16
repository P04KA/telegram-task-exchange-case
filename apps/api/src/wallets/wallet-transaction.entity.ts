import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../common/entities/base.entity';
import { numericTransformer } from '../common/utils/numeric-transformer';
import { Wallet } from './wallet.entity';

@Entity('wallet_transactions')
export class WalletTransaction extends AppBaseEntity {
  @ManyToOne(() => Wallet, (wallet) => wallet.transactions, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  wallet!: Wallet;

  @Column({ type: 'varchar' })
  kind!:
    | 'top_up'
    | 'admin_adjustment'
    | 'subscription_purchase'
    | 'task_budget_hold'
    | 'task_budget_release'
    | 'task_budget_settlement'
    | 'execution_reward_hold'
    | 'execution_reward_release'
    | 'payout_hold'
    | 'payout_paid'
    | 'payout_rejected';

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  amount!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  balanceSnapshot!: number;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', nullable: true })
  referenceId?: string | null;
}
