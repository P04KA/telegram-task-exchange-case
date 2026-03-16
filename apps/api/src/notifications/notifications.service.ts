import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BotService } from '../bot/bot.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly botService: BotService,
  ) {}

  async sendUserNotification(userId: string, message: string) {
    this.logger.log(`Notify user ${userId}: ${message}`);

    const user = await this.usersService.getById(userId).catch(() => null);
    if (!user || !/^\d+$/.test(user.telegramId)) {
      return;
    }

    await this.botService.sendMessage(user.telegramId, message).catch((error: unknown) => {
      this.logger.warn(
        `Failed to deliver Telegram notification to user ${userId}: ${(error as Error).message}`,
      );
    });
  }

  async sendAdminNotification(message: string) {
    this.logger.log(`Notify admins: ${message}`);

    const configuredUsernames =
      this.configService.get<string>('ADMIN_ALERT_USERNAMES') ?? 'P04KA,kjleum';
    const usernames = configuredUsernames
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    const users = await this.usersService.findByUsernames(usernames);
    const resolved = new Set(users.map((user) => user.username.trim().toLowerCase()));

    await Promise.all(
      users
        .filter((user) => /^\d+$/.test(user.telegramId))
        .map((user) =>
          this.botService.sendMessage(user.telegramId, message).catch((error: unknown) => {
            this.logger.warn(
              `Failed to deliver admin alert to @${user.username}: ${(error as Error).message}`,
            );
          }),
        ),
    );

    for (const username of usernames) {
      if (!resolved.has(username.toLowerCase())) {
        this.logger.warn(
          `Admin alert target @${username} was not found in local users. Open the bot once to enable direct alerts.`,
        );
      }
    }
  }
}
