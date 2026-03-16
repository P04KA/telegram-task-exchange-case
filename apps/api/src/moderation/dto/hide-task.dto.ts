import { IsString, MinLength } from 'class-validator';

export class HideTaskDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
