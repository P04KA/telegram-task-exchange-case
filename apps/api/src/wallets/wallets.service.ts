import {
  BadRequestException,
  Injectable,
  NotFoundException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { WalletTransaction } from './wallet-transaction.entity';
import { Wallet } from './wallet.entity';

@Injectable()
export class WalletsService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletsRepository: Repository<Wallet>,
    @InjectRepository(WalletTransaction)
    private readonly transactionsRepository: Repository<WalletTransaction>,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}

  async ensureWallet(userId: string) {
    let wallet = await this.walletsRepository.findOne({
      where: { user: { id: userId } },
      relations: { user: true },
    });

    if (!wallet) {
      const user = await this.usersService.getById(userId);
      wallet = this.walletsRepository.create({
        user,
        availableBalance: 0,
        heldBalance: 0,
      });
      wallet = await this.walletsRepository.save(wallet);
    }

    return wallet;
  }

  async getWallet(userId: string) {
    const wallet = await this.ensureWallet(userId);
    const transactions = await this.transactionsRepository.find({
      where: { wallet: { id: wallet.id } },
      order: { createdAt: 'DESC' },
      take: 50,
    });

    return {
      ...wallet,
      transactions,
    };
  }

  async topUp(userId: string, amount: number, description = 'Manual top-up') {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    const wallet = await this.ensureWallet(userId);
    wallet.availableBalance += amount;
    const saved = await this.walletsRepository.save(wallet);
    await this.recordTransaction(saved, 'top_up', amount, description);
    return saved;
  }

  async setBalance(
    userId: string,
    availableBalance: number,
    heldBalance = 0,
    description = 'Balance adjustment',
  ) {
    if (availableBalance < 0 || heldBalance < 0) {
      throw new BadRequestException('Balances cannot be negative');
    }

    const wallet = await this.ensureWallet(userId);
    const previousTotal = wallet.availableBalance + wallet.heldBalance;
    wallet.availableBalance = availableBalance;
    wallet.heldBalance = heldBalance;
    const saved = await this.walletsRepository.save(wallet);
    const currentTotal = availableBalance + heldBalance;
    const delta = currentTotal - previousTotal;

    if (delta !== 0) {
      await this.recordTransaction(saved, 'admin_adjustment', delta, description);
    }

    return saved;
  }

  async debitAvailable(
    userId: string,
    amount: number,
    kind: WalletTransaction['kind'],
    description?: string,
    referenceId?: string,
  ) {
    const wallet = await this.ensureWallet(userId);
    if (wallet.availableBalance < amount) {
      throw new BadRequestException('Insufficient available balance');
    }

    wallet.availableBalance -= amount;
    const saved = await this.walletsRepository.save(wallet);
    await this.recordTransaction(saved, kind, -amount, description, referenceId);
    return saved;
  }

  async holdFunds(
    userId: string,
    amount: number,
    description?: string,
    referenceId?: string,
  ) {
    const wallet = await this.ensureWallet(userId);
    if (wallet.availableBalance < amount) {
      throw new BadRequestException('Not enough balance to reserve task budget');
    }

    wallet.availableBalance -= amount;
    wallet.heldBalance += amount;
    const saved = await this.walletsRepository.save(wallet);
    await this.recordTransaction(saved, 'task_budget_hold', -amount, description, referenceId);
    return saved;
  }

  async releaseHeldFunds(
    userId: string,
    amount: number,
    description?: string,
    referenceId?: string,
  ) {
    const wallet = await this.ensureWallet(userId);
    if (wallet.heldBalance < amount) {
      throw new BadRequestException('Held balance is too low');
    }

    wallet.heldBalance -= amount;
    wallet.availableBalance += amount;
    const saved = await this.walletsRepository.save(wallet);
    await this.recordTransaction(saved, 'task_budget_release', amount, description, referenceId);
    return saved;
  }

  async settleHeldFunds(
    userId: string,
    amount: number,
    description?: string,
    referenceId?: string,
  ) {
    const wallet = await this.ensureWallet(userId);
    if (wallet.heldBalance < amount) {
      throw new BadRequestException('Held balance is too low');
    }

    wallet.heldBalance -= amount;
    const saved = await this.walletsRepository.save(wallet);
    await this.recordTransaction(saved, 'task_budget_settlement', -amount, description, referenceId);
    return saved;
  }

  async holdExecutionReward(
    userId: string,
    amount: number,
    description?: string,
    referenceId?: string,
  ) {
    const wallet = await this.ensureWallet(userId);
    wallet.heldBalance += amount;
    const saved = await this.walletsRepository.save(wallet);
    await this.recordTransaction(saved, 'execution_reward_hold', amount, description, referenceId);
    return saved;
  }

  async releaseExecutionReward(
    userId: string,
    amount: number,
    description?: string,
    referenceId?: string,
  ) {
    const wallet = await this.ensureWallet(userId);
    if (wallet.heldBalance < amount) {
      throw new BadRequestException('Held balance is too low for reward release');
    }

    wallet.heldBalance -= amount;
    wallet.availableBalance += amount;
    const saved = await this.walletsRepository.save(wallet);
    await this.recordTransaction(saved, 'execution_reward_release', amount, description, referenceId);
    return saved;
  }

  async freezeForPayout(
    userId: string,
    amount: number,
    description?: string,
    referenceId?: string,
  ) {
    const wallet = await this.ensureWallet(userId);
    if (wallet.availableBalance < amount) {
      throw new BadRequestException('Insufficient available balance for payout');
    }

    wallet.availableBalance -= amount;
    wallet.heldBalance += amount;
    const saved = await this.walletsRepository.save(wallet);
    await this.recordTransaction(saved, 'payout_hold', -amount, description, referenceId);
    return saved;
  }

  async completePayout(
    userId: string,
    amount: number,
    description?: string,
    referenceId?: string,
  ) {
    const wallet = await this.ensureWallet(userId);
    if (wallet.heldBalance < amount) {
      throw new BadRequestException('Held balance is too low for payout');
    }

    wallet.heldBalance -= amount;
    const saved = await this.walletsRepository.save(wallet);
    await this.recordTransaction(saved, 'payout_paid', -amount, description, referenceId);
    return saved;
  }

  async rejectPayout(
    userId: string,
    amount: number,
    description?: string,
    referenceId?: string,
  ) {
    const wallet = await this.ensureWallet(userId);
    if (wallet.heldBalance < amount) {
      throw new BadRequestException('Held balance is too low for payout rejection');
    }

    wallet.heldBalance -= amount;
    wallet.availableBalance += amount;
    const saved = await this.walletsRepository.save(wallet);
    await this.recordTransaction(saved, 'payout_rejected', amount, description, referenceId);
    return saved;
  }

  async findWalletById(walletId: string) {
    const wallet = await this.walletsRepository.findOne({ where: { id: walletId } });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }
    return wallet;
  }

  private async recordTransaction(
    wallet: Wallet,
    kind: WalletTransaction['kind'],
    amount: number,
    description?: string,
    referenceId?: string,
  ) {
    const snapshot = wallet.availableBalance + wallet.heldBalance;
    const transaction = this.transactionsRepository.create({
      wallet,
      kind,
      amount,
      balanceSnapshot: snapshot,
      description,
      referenceId,
    });

    await this.transactionsRepository.save(transaction);
  }
}
