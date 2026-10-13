import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import * as WA from './whatsapp.service.js';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WA.WhatsappService) {}

  // ─────────────────────────────────────────────
  // WEBHOOK ENDPOINTS (called by Meta)
  // ─────────────────────────────────────────────

  /**
   * GET /whatsapp/webhook
   * Meta calls this ONCE during setup to verify your endpoint.
   * It sends hub.mode, hub.verify_token, hub.challenge as query params.
   * You must return the challenge value if the token matches.
   */
  @Get('/webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    const result = this.whatsappService.verifyWebhook(
      mode,
      token,
      challenge,
    );
    if (result) {
      return result;
    }
    throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
  }

  /**
   * POST /whatsapp/webhook
   * Meta delivers ALL webhook events here — incoming messages,
   * delivery status updates, template status changes, etc.
   * Must always return 200 quickly, or Meta will retry.
   */
  @Post('/webhook')
  @HttpCode(200)
  handleWebhook(@Body() body: any): string {
    this.whatsappService.processWebhookPayload(body);
    return 'EVENT_RECEIVED';
  }

  // ─────────────────────────────────────────────
  // MESSAGING ENDPOINTS (for Admin Panel)
  // ─────────────────────────────────────────────

  /**
   * POST /whatsapp/send-text
   * Send a text message to a single customer.
   *
   * Body: { "to": "919876543210", "message": "Hello!" }
   */
  @Post('/send-text')
  async sendText(@Body() dto: WA.SendTextMessageDto) {
    return this.whatsappService.sendTextMessage(dto);
  }

  /**
   * POST /whatsapp/send-template
   * Send an approved template message to a single customer.
   *
   * Body: {
   *   "to": "919876543210",
   *   "templateName": "hello_world",
   *   "languageCode": "en_US",
   *   "bodyParameters": ["Ramesh"]
   * }
   */
  @Post('/send-template')
  async sendTemplate(@Body() dto: WA.SendTemplateMessageDto) {
    return this.whatsappService.sendTemplateMessage(dto);
  }

  /**
   * POST /whatsapp/send-bulk
   * Send a template message to multiple customers at once.
   *
   * Body: {
   *   "customers": [
   *     { "phone": "919876543210", "name": "Ramesh" },
   *     { "phone": "919876543211", "name": "Suresh" }
   *   ],
   *   "templateName": "delivery_update",
   *   "languageCode": "en_US"
   * }
   */
  @Post('/send-bulk')
  async sendBulk(
    @Body()
    body: {
      customers: Array<{ phone: string; name: string }>;
      templateName: string;
      languageCode?: string;
    },
  ) {
    return this.whatsappService.sendBulkTemplateMessages(
      body.customers,
      body.templateName,
      body.languageCode,
    );
  }

  /**
   * GET /whatsapp/templates
   * List all message templates on the WhatsApp Business account.
   */
  @Get('/templates')
  async listTemplates() {
    return this.whatsappService.listTemplates();
  }
}
