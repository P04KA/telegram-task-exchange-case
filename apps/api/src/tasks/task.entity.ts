import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { AppBaseEntity } from '../common/entities/base.entity';
import { numericTransformer } from '../common/utils/numeric-transformer';
import { Execution } from '../executions/execution.entity';
import { User } from '../users/user.entity';

export type TaskType =
  | 'join_channel'
  | 'join_chat'
  | 'start_bot'
  | 'react_post'
  | 'open_post_or_link';

export type TaskStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'stopped'
  | 'hidden'
  | 'completed';

@Entity('tasks')
export class Task extends AppBaseEntity {
  @ManyToOne(() => User, (user) => user.tasks, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  customer!: User;

  @Column()
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'varchar' })
  type!: TaskType;

  @Column({ type: 'varchar', nullable: true })
  targetChatId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  targetMessageId?: string | null;

  @Column({ type: 'text', nullable: true })
  targetLink?: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  pricePerExecution!: number;

  @Column()
  executionLimit!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  budgetTotal!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  budgetSpent!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  budgetHeld!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  pendingBudget!: number;

  @Column({ default: 600 })
  reserveTtlSeconds!: number;

  @Column({ type: 'varchar', default: 'manual' })
  confirmationMode!: 'auto' | 'manual';

  @Column({ type: 'varchar', default: 'draft' })
  status!: TaskStatus;

  @Column({ default: 0 })
  confirmedExecutionsCount!: number;

  @Column({ default: 0 })
  activeExecutionsCount!: number;

  @Column({ default: 0 })
  pendingReviewExecutionsCount!: number;

  @Column({ type: 'text', nullable: true })
  hiddenReason?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  publishedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  stoppedAt?: Date | null;

  @OneToMany(() => Execution, (execution) => execution.task)
  executions?: Execution[];
}
