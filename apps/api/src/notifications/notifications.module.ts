import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BotModule } from '../bot/bot.module';
import { UsersModule } from '../users/users.module';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [ConfigModule, UsersModule, BotModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
