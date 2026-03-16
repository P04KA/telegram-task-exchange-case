import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AdminPasswordLoginDto } from './dto/admin-password-login.dto';
import { TelegramInitDto } from './dto/telegram-init.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('telegram/init')
  init(@Body() dto: TelegramInitDto) {
    return this.authService.initTelegramSession(dto.initData);
  }

  @Post('admin/password')
  adminPasswordLogin(@Body() dto: AdminPasswordLoginDto) {
    return this.authService.initAdminPasswordSession(dto.password);
  }
}
