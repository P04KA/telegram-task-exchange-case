import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { AppBaseEntity } from '../common/entities/base.entity';
import { User } from './user.entity';

@Entity('telegram_accounts')
export class TelegramAccount extends AppBaseEntity {
  @Column({ unique: true })
  telegramId!: string;

  @Column()
  username!: string;

  @Column({ type: 'varchar', nullable: true })
  firstName?: string | null;

  @Column({ type: 'varchar', nullable: true })
  lastName?: string | null;

  @OneToOne(() => User, (user) => user.telegramAccount, { onDelete: 'CASCADE' })
  @JoinColumn()
  user!: User;
}
