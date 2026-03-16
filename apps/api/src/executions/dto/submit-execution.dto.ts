import { IsOptional, IsString, MinLength } from 'class-validator';

export class SubmitExecutionDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  proof?: string;
}
