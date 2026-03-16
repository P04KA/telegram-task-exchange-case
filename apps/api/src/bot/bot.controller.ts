import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { BotService } from './bot.service';

@Controller('bot')
export class BotController {
  constructor(private readonly botService: BotService) {}

  @Get('start')
  start(@Query('startParam') startParam?: string) {
    return this.botService.handleStart(startParam);
  }

  @Post('webhook')
  webhook(
    @Body() update: Record<string, unknown>,
    @Headers('x-telegram-bot-api-secret-token') secretToken?: string,
  ) {
    return this.botService.handleWebhookUpdate(update as never, secretToken);
  }
}
