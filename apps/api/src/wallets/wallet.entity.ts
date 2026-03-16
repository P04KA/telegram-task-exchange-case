import { Column, Entity, JoinColumn, OneToMany, OneToOne } from 'typeorm';
import { AppBaseEntity } from '../common/entities/base.entity';
import { numericTransformer } from '../common/utils/numeric-transformer';
import { User } from '../users/user.entity';
import { WalletTransaction } from './wallet-transaction.entity';

@Entity('wallets')
export class Wallet extends AppBaseEntity {
  @OneToOne(() => User, (user) => user.wallet, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  user!: User;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  availableBalance!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  heldBalance!: number;

  @OneToMany(() => WalletTransaction, (transaction) => transaction.wallet)
  transactions?: WalletTransaction[];
}
