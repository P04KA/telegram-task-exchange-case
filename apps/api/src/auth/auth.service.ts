import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { AppRole } from '../common/types/auth';
import { WalletsService } from '../wallets/wallets.service';

interface ParsedInitData {
  telegramId: string;
  username: string;
  role: AppRole;
  firstName?: string;
  lastName?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly walletsService: WalletsService,
  ) {}

  async initTelegramSession(initData: string) {
    const parsed = this.parseTelegramInitData(initData);
    const user = await this.usersService.findOrCreateByTelegram(parsed);
    return this.createSession(user.id);
  }

  async initAdminPasswordSession(password: string) {
    const expectedPassword = this.configService.get<string>('ADMIN_PASSWORD');
    if (!expectedPassword) {
      throw new UnauthorizedException('Admin password login is not configured');
    }

    const providedBuffer = Buffer.from(password);
    const expectedBuffer = Buffer.from(expectedPassword);
    const passwordMatches =
      providedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(providedBuffer, expectedBuffer);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid admin password');
    }

    const adminLogin = this.configService.get<string>('ADMIN_LOGIN') ?? 'admin';
    const user = await this.usersService.findOrCreateLocalAdmin(adminLogin);
    return this.createSession(user.id);
  }

  private parseTelegramInitData(initData: string): ParsedInitData {
    const isDevMode = this.configService.get<string>('DEV_MODE') === 'true';

    if (isDevMode && initData.startsWith('dev:')) {
      const [, telegramId, username, rawRole] = initData.split(':');
      return {
        telegramId,
        username: username ?? `user_${telegramId}`,
        role: rawRole === 'admin' ? 'admin' : 'user',
      };
    }

    const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!botToken) {
      throw new UnauthorizedException('Telegram bot token is not configured');
    }

    const params = new URLSearchParams(initData);
    const hash = params.get('hash');

    if (!hash) {
      throw new UnauthorizedException('Invalid Telegram init data');
    }

    const dataCheckString = [...params.entries()]
      .filter(([key]) => key !== 'hash')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = createHmac('sha256', secret)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) {
      throw new UnauthorizedException('Telegram init data signature mismatch');
    }

    const userRaw = params.get('user');
    if (!userRaw) {
      throw new UnauthorizedException('User payload is missing');
    }

    const userData = JSON.parse(userRaw) as {
      id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
    };

    return {
      telegramId: String(userData.id),
      username: userData.username ?? `telegram_${userData.id}`,
      firstName: userData.first_name,
      lastName: userData.last_name,
      role: 'user',
    };
  }

  private async createSession(userId: string) {
    const user = await this.usersService.getById(userId);
    await this.walletsService.ensureWallet(user.id);

    const token = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
      telegramId: user.telegramId,
    });

    return {
      accessToken: token,
      user,
    };
  }
}
