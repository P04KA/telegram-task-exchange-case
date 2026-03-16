import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VerificationAttempt } from './verification-attempt.entity';
import { VerificationService } from './verification.service';

@Module({
  imports: [TypeOrmModule.forFeature([VerificationAttempt])],
  providers: [VerificationService],
  exports: [VerificationService, TypeOrmModule],
})
export class VerificationModule {}
