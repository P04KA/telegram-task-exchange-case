import { IsNumber, Min } from 'class-validator';

export class TopUpWalletDto {
  @IsNumber()
  @Min(1)
  amount!: number;
}
