import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';
import { TaskType } from '../task.entity';

export class CreateTaskDto {
  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @IsEnum([
    'join_channel',
    'join_chat',
    'start_bot',
    'react_post',
    'open_post_or_link',
  ])
  type!: TaskType;

  @IsOptional()
  @IsString()
  targetChatId?: string;

  @IsOptional()
  @IsString()
  targetMessageId?: string;

  @IsOptional()
  @IsUrl()
  targetLink?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.1)
  @Max(100)
  pricePerExecution!: number;

  @IsNumber()
  @Min(1)
  executionLimit!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.1)
  budgetTotal?: number;

  @IsOptional()
  @IsNumber()
  @Min(60)
  reserveTtlSeconds?: number;

  @IsOptional()
  @IsEnum(['auto', 'manual'])
  confirmationMode?: 'auto' | 'manual';
}
