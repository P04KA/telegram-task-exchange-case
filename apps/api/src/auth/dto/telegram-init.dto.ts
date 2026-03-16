import { IsString } from 'class-validator';

export class TelegramInitDto {
  @IsString()
  initData!: string;
}
