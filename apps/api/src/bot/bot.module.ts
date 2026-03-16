import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BotController } from './bot.controller';
import { BotService } from './bot.service';

@Module({
  imports: [ConfigModule],
  controllers: [BotController],
  providers: [BotService],
  exports: [BotService],
})
export class BotModule {}
