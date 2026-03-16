import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppRole } from '../common/types/auth';
import { TelegramAccount } from './telegram-account.entity';
import { User } from './user.entity';

interface TelegramProfile {
  telegramId: string;
  username: string;
  role: AppRole;
  firstName?: string;
  lastName?: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(TelegramAccount)
    private readonly telegramAccountsRepository: Repository<TelegramAccount>,
  ) {}

  async findOrCreateByTelegram(profile: TelegramProfile) {
    let user = await this.usersRepository.findOne({
      where: { telegramId: profile.telegramId },
    });

    if (!user) {
      user = this.usersRepository.create({
        telegramId: profile.telegramId,
        username: profile.username,
        role: profile.role,
        isCustomer: true,
        isExecutor: profile.role !== 'admin',
      });
      user = await this.usersRepository.save(user);
    } else {
      user.username = profile.username;
      if (profile.role === 'admin') {
        user.role = 'admin';
      }
      user = await this.usersRepository.save(user);
    }

    let telegramAccount = await this.telegramAccountsRepository.findOne({
      where: { telegramId: profile.telegramId },
      relations: { user: true },
    });

    if (!telegramAccount) {
      telegramAccount = this.telegramAccountsRepository.create({
        telegramId: profile.telegramId,
        username: profile.username,
        firstName: profile.firstName,
        lastName: profile.lastName,
        user,
      });
    } else {
      telegramAccount.username = profile.username;
      telegramAccount.firstName = profile.firstName;
      telegramAccount.lastName = profile.lastName;
      telegramAccount.user = user;
    }

    await this.telegramAccountsRepository.save(telegramAccount);

    return user;
  }

  async findOrCreateLocalAdmin(login: string) {
    const telegramId = `local-admin:${login}`;
    let user = await this.usersRepository.findOne({
      where: { telegramId },
    });

    if (!user) {
      user = this.usersRepository.create({
        telegramId,
        username: `admin_${login}`,
        role: 'admin',
        isCustomer: true,
        isExecutor: false,
      });
    } else {
      user.role = 'admin';
      user.isExecutor = false;
    }

    return this.usersRepository.save(user);
  }

  async getById(userId: string) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async listUsers() {
    return this.usersRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findByUsernames(usernames: string[]) {
    const normalized = new Set(usernames.map((item) => item.trim().toLowerCase()).filter(Boolean));
    if (normalized.size === 0) {
      return [];
    }

    const users = await this.usersRepository.find();
    return users.filter((user) => normalized.has(user.username.trim().toLowerCase()));
  }

  async blockUser(userId: string, reason: string) {
    const user = await this.getById(userId);
    user.isBlocked = true;
    user.blockedReason = reason;
    return this.usersRepository.save(user);
  }

  async unblockUser(userId: string) {
    const user = await this.getById(userId);
    user.isBlocked = false;
    user.blockedReason = null;
    return this.usersRepository.save(user);
  }
}
