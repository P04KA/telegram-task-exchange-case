import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { AppBaseEntity } from '../common/entities/base.entity';
import { Dispute } from '../moderation/dispute.entity';
import { Task } from '../tasks/task.entity';
import { User } from '../users/user.entity';
import { VerificationAttempt } from '../verification/verification-attempt.entity';

export type ExecutionStatus =
  | 'in_progress'
  | 'submitted'
  | 'needs_review'
  | 'confirmed'
  | 'rejected'
  | 'expired'
  | 'disputed';

@Entity('executions')
export class Execution extends AppBaseEntity {
  @ManyToOne(() => Task, (task) => task.executions, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  task!: Task;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  executor!: User;

  @Column({ type: 'varchar', default: 'in_progress' })
  status!: ExecutionStatus;

  @Column({ type: 'timestamp' })
  reservedUntil!: Date;

  @Column({ type: 'text', nullable: true })
  proof?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  submittedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  rewardAvailableAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  rewardReleasedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  rejectedReason?: string | null;

  @OneToMany(() => VerificationAttempt, (attempt) => attempt.execution)
  verificationAttempts?: VerificationAttempt[];

  @OneToMany(() => Dispute, (dispute) => dispute.execution)
  disputes?: Dispute[];
}
