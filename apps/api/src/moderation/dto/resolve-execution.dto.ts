import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ResolveExecutionDto {
  @IsEnum(['confirm', 'reject'])
  action!: 'confirm' | 'reject';

  @IsOptional()
  @IsString()
  comment?: string;
}
