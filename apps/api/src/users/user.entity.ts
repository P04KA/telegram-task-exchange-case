import { Column, Entity, OneToMany, OneToOne } from 'typeorm';
import { AppBaseEntity } from '../common/entities/base.entity';
import { AppRole } from '../common/types/auth';
import { PayoutRequest } from '../payouts/payout-request.entity';
import { Task } from '../tasks/task.entity';
import { Wallet } from '../wallets/wallet.entity';
import { TelegramAccount } from './telegram-account.entity';

@Entity('users')
export class User extends AppBaseEntity {
  @Column({ unique: true })
  telegramId!: string;

  @Column({ unique: true })
  username!: string;

  @Column({ type: 'varchar', default: 'user' })
  role!: AppRole;

  @Column({ default: true })
  isCustomer!: boolean;

  @Column({ default: true })
  isExecutor!: boolean;

  @Column({ default: false })
  isBlocked!: boolean;

  @Column({ type: 'text', nullable: true })
  blockedReason?: string | null;

  @OneToOne(() => TelegramAccount, (account) => account.user)
  telegramAccount?: TelegramAccount;

  @OneToOne(() => Wallet, (wallet) => wallet.user)
  wallet?: Wallet;

  @OneToMany(() => Task, (task) => task.customer)
  tasks?: Task[];

  @OneToMany(() => PayoutRequest, (request) => request.user)
  payoutRequests?: PayoutRequest[];
}
