import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../common/entities/base.entity';
import { User } from '../users/user.entity';

@Entity('admin_action_logs')
export class AdminActionLog extends AppBaseEntity {
  @ManyToOne(() => User, { eager: true, onDelete: 'SET NULL', nullable: true })
  @JoinColumn()
  admin?: User | null;

  @Column({ type: 'varchar' })
  action!: string;

  @Column({ type: 'varchar', nullable: true })
  targetType?: string | null;

  @Column({ type: 'varchar', nullable: true })
  targetId?: string | null;

  @Column({ type: 'text', nullable: true })
  comment?: string | null;
}
