import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { WhatsAppService } from './whatsapp.service.js';
import type { MetaWebhookPayload } from './whatsapp.service.js';
import {
  BulkTemplateMessageDto,
  SendTemplateMessageRequest,
  SendTextMessageRequest,
  UpdateDailyMessageStatusDto,
} from './whatsapp.dto.js';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const result = this.whatsappService.verifyWebhook(mode, token, challenge);
    if (!result) throw new ForbiddenException('Forbidden');
    return result;
  }

  @Post('webhook')
  @HttpCode(200)
  handleWebhook(@Body() body: MetaWebhookPayload) {
    this.whatsappService.processWebhookPayload(body);
    return 'EVENT_RECEIVED';
  }

  @UseGuards(JwtAuthGuard)
  @Get('daily-summary')
  getDailySummary(
    @Req() request: AuthenticatedRequest,
    @Query('date') date?: string,
  ) {
    return this.whatsappService.getDailySummary(request.user.sub, date);
  }

  @UseGuards(JwtAuthGuard)
  @Post('daily-message-status')
  updateDailyMessageStatus(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateDailyMessageStatusDto,
  ) {
    return this.whatsappService.updateMessageStatus(request.user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('customers/:customerId/history')
  getCustomerHistory(
    @Req() request: AuthenticatedRequest,
    @Param('customerId') customerId: string,
  ) {
    return this.whatsappService.getCustomerMessageHistory(
      request.user.sub,
      customerId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('send-text')
  sendText(@Body() dto: SendTextMessageRequest) {
    return this.whatsappService.sendTextMessage(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('send-template')
  sendTemplate(@Body() dto: SendTemplateMessageRequest) {
    return this.whatsappService.sendTemplateMessage(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('send-bulk')
  sendBulk(@Body() dto: BulkTemplateMessageDto) {
    return this.whatsappService.sendBulkTemplateMessages(
      dto.customers,
      dto.templateName,
      dto.languageCode,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('templates')
  listTemplates() {
    return this.whatsappService.listTemplates();
  }
}
