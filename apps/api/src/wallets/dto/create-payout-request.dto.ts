import { IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreatePayoutRequestDto {
  @IsNumber()
  @Min(100)
  amount!: number;

  @IsString()
  @MinLength(6)
  phoneNumber!: string;

  @IsString()
  @MinLength(2)
  bankName!: string;

  @IsOptional()
  @IsString()
  payoutDetails?: string;
}
