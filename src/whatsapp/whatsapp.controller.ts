import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { WhatsAppService } from './whatsapp.service.js';
import type { MetaWebhookPayload } from './whatsapp.service.js';
import {
  BulkTemplateMessageDto,
  SendBillMessageRequest,
  SendTemplateMessageRequest,
  SendTextMessageRequest,
} from './whatsapp.dto.js';

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
  @Post('send-text')
  sendText(@Body() dto: SendTextMessageRequest) {
    return this.whatsappService.sendTextMessage(dto);
  }

  /**
   * POST /whatsapp/send-bill
   * Send an auto-generated milk delivery bill to a customer.
   */
  @UseGuards(JwtAuthGuard)
  @Post('send-bill')
  sendBill(@Body() dto: SendBillMessageRequest) {
    return this.whatsappService.sendBillMessage(dto);
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
