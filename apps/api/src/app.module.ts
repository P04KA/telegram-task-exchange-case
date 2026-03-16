import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { resolve } from 'path';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { BotModule } from './bot/bot.module';
import { buildTypeOrmOptions, validateEnv } from './common/utils/config';
import { ExecutionsModule } from './executions/executions.module';
import { HealthController } from './health.controller';
import { ModerationModule } from './moderation/moderation.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PayoutsModule } from './payouts/payouts.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { TasksModule } from './tasks/tasks.module';
import { UsersModule } from './users/users.module';
import { VerificationModule } from './verification/verification.module';
import { WalletsModule } from './wallets/wallets.module';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        resolve(__dirname, '../../../.env'),
        resolve(process.cwd(), '.env'),
      ],
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: buildTypeOrmOptions,
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.getOrThrow<string>('REDIS_HOST'),
          port: configService.getOrThrow<number>('REDIS_PORT'),
        },
      }),
    }),
    AuthModule,
    UsersModule,
    SubscriptionsModule,
    WalletsModule,
    TasksModule,
    ExecutionsModule,
    VerificationModule,
    ModerationModule,
    PayoutsModule,
    NotificationsModule,
    AnalyticsModule,
    BotModule,
  ],
})
export class AppModule {}
