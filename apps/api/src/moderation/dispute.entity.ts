import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../common/entities/base.entity';
import { Execution } from '../executions/execution.entity';
import { User } from '../users/user.entity';

@Entity('disputes')
export class Dispute extends AppBaseEntity {
  @ManyToOne(() => Execution, (execution) => execution.disputes, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  execution!: Execution;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  user!: User;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'varchar', default: 'open' })
  status!: 'open' | 'resolved';
}
