import { NestFactory } from '@nestjs/core';
import { AuthService } from '../auth/auth.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { WalletsService } from '../wallets/wallets.service';

async function seed() {
  process.env.TELEGRAM_BOT_MODE = 'disabled';
  const { AppModule } = await import('../app.module');

  const app = await NestFactory.createApplicationContext(AppModule);
  const subscriptionsService = app.get(SubscriptionsService);
  const authService = app.get(AuthService);
  const walletsService = app.get(WalletsService);

  await subscriptionsService.seedDefaultPlans();

  const demoUsers = [
    'dev:1:admin:admin',
    'dev:1001:worker:user',
    'dev:2001:customer:user',
  ];

  for (const initData of demoUsers) {
    const session = await authService.initTelegramSession(initData);
    const availableBalance =
      session.user.username === 'worker'
        ? 0
        : session.user.username === 'customer'
          ? 5000
          : 10000;
    await walletsService.setBalance(session.user.id, availableBalance, 0, 'Seed balance sync');
  }

  await app.close();
  console.log('Seed complete');
}

seed();
