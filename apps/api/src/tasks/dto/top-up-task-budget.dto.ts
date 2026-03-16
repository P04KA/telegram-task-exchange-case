import { IsNumber, Min } from 'class-validator';

export class TopUpTaskBudgetDto {
  @IsNumber()
  @Min(1)
  amount!: number;
}
