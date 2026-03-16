import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../common/entities/base.entity';
import { Execution } from '../executions/execution.entity';

@Entity('verification_attempts')
export class VerificationAttempt extends AppBaseEntity {
  @ManyToOne(() => Execution, (execution) => execution.verificationAttempts, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  execution!: Execution;

  @Column({ type: 'varchar' })
  result!: 'confirmed' | 'needs_review' | 'failed';

  @Column({ type: 'text' })
  payload!: string;
}
