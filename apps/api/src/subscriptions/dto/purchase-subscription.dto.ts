import { IsUUID } from 'class-validator';

export class PurchaseSubscriptionDto {
  @IsUUID()
  planId!: string;
}
