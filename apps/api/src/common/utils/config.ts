import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export function validateEnv(config: Record<string, unknown>) {
  const withDefaults: Record<string, unknown> = {
    PORT: 3000,
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
    DEV_MODE: 'true',
    ...config,
  };

  if (!withDefaults['DATABASE_URL']) {
    throw new Error('DATABASE_URL is required');
  }

  if (!withDefaults['JWT_SECRET']) {
    throw new Error('JWT_SECRET is required');
  }

  return withDefaults;
}

export function buildTypeOrmOptions(
  configService: ConfigService,
): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    url: configService.getOrThrow<string>('DATABASE_URL'),
    autoLoadEntities: true,
    synchronize: true,
  };
}
