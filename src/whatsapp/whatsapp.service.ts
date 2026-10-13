import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface SendTextMessageDto {
  to: string; // Customer phone: "919876543210" (country code + number, no +)
  message: string;
}

export interface SendTemplateMessageDto {
  to: string;
  templateName: string;
  languageCode?: string; // Default: "en_US"
  bodyParameters?: string[];
}

export interface BulkMessageResult {
  total: number;
  success: number;
  failed: number;
  details: Array<{
    phone: string;
    status: 'sent' | 'failed';
    messageId?: string;
    error?: string;
  }>;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly httpClient: AxiosInstance;
  private readonly phoneNumberId: string;
  private readonly wabaId: string;

  constructor(private configService: ConfigService) {
    const apiUrl = this.configService.getOrThrow<string>('WHATSAPP_API_URL');
    const accessToken =
      this.configService.getOrThrow<string>('WHATSAPP_ACCESS_TOKEN');
    this.phoneNumberId = this.configService.getOrThrow<string>(
      'WHATSAPP_PHONE_NUMBER_ID',
    );
    this.wabaId = this.configService.getOrThrow<string>(
      'WHATSAPP_BUSINESS_ACCOUNT_ID',
    );

    this.httpClient = axios.create({
      baseURL: apiUrl,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Send a plain text message to a customer.
   * ⚠️ Only works within the 24-hour customer service window.
   */
  async sendTextMessage(
    dto: SendTextMessageDto,
  ): Promise<{ messageId: string }> {
    const { data } = await this.httpClient.post(
      `/${this.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: dto.to,
        type: 'text',
        text: {
          preview_url: false,
          body: dto.message,
        },
      },
    );

    const messageId = data.messages[0].id;
    this.logger.log(`Text message sent to ${dto.to} | ID: ${messageId}`);
    return { messageId };
  }

  /**
   * Send a template message to a customer.
   * ✅ Works anytime — no 24-hour window restriction.
   */
  async sendTemplateMessage(
    dto: SendTemplateMessageDto,
  ): Promise<{ messageId: string }> {
    const components: any[] = [];

    if (dto.bodyParameters && dto.bodyParameters.length > 0) {
      components.push({
        type: 'body',
        parameters: dto.bodyParameters.map((text) => ({
          type: 'text',
          text,
        })),
      });
    }

    const { data } = await this.httpClient.post(
      `/${this.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: dto.to,
        type: 'template',
        template: {
          name: dto.templateName,
          language: { code: dto.languageCode || 'en_US' },
          ...(components.length > 0 && { components }),
        },
      },
    );

    const messageId = data.messages[0].id;
    this.logger.log(
      `Template "${dto.templateName}" sent to ${dto.to} | ID: ${messageId}`,
    );
    return { messageId };
  }

  /**
   * Send a template message to multiple customers (bulk).
   * Adds a 100ms delay between messages to respect rate limits.
   */
  async sendBulkTemplateMessages(
    customers: Array<{ phone: string; name: string }>,
    templateName: string,
    languageCode?: string,
  ): Promise<BulkMessageResult> {
    const result: BulkMessageResult = {
      total: customers.length,
      success: 0,
      failed: 0,
      details: [],
    };

    for (const customer of customers) {
      try {
        const { messageId } = await this.sendTemplateMessage({
          to: customer.phone,
          templateName,
          languageCode,
          bodyParameters: [customer.name],
        });

        result.success++;
        result.details.push({
          phone: customer.phone,
          status: 'sent',
          messageId,
        });
      } catch (error: any) {
        const errMsg =
          error.response?.data?.error?.message || error.message;
        result.failed++;
        result.details.push({
          phone: customer.phone,
          status: 'failed',
          error: errMsg,
        });
        this.logger.error(
          `Failed to send to ${customer.phone}: ${errMsg}`,
        );
      }

      // Rate limit: wait 100ms between messages
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.logger.log(
      `Bulk send complete: ${result.success}/${result.total} sent, ${result.failed} failed`,
    );
    return result;
  }

  /**
   * Send an image message to a customer.
   */
  async sendImageMessage(
    to: string,
    imageUrl: string,
    caption?: string,
  ): Promise<{ messageId: string }> {
    const { data } = await this.httpClient.post(
      `/${this.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'image',
        image: {
          link: imageUrl,
          ...(caption && { caption }),
        },
      },
    );

    const messageId = data.messages[0].id;
    this.logger.log(`Image sent to ${to} | ID: ${messageId}`);
    return { messageId };
  }

  /**
   * Send a document (PDF, etc.) to a customer.
   */
  async sendDocumentMessage(
    to: string,
    documentUrl: string,
    filename: string,
    caption?: string,
  ): Promise<{ messageId: string }> {
    const { data } = await this.httpClient.post(
      `/${this.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'document',
        document: {
          link: documentUrl,
          filename,
          ...(caption && { caption }),
        },
      },
    );

    const messageId = data.messages[0].id;
    this.logger.log(
      `Document "${filename}" sent to ${to} | ID: ${messageId}`,
    );
    return { messageId };
  }

  /**
   * List all message templates on the account.
   */
  async listTemplates(): Promise<any[]> {
    const { data } = await this.httpClient.get(
      `/${this.wabaId}/message_templates`,
    );
    return data.data;
  }

  /**
   * Mark an incoming message as read (shows blue ticks ✓✓).
   */
  async markMessageAsRead(messageId: string): Promise<void> {
    await this.httpClient.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
    this.logger.log(`Message ${messageId} marked as read`);
  }

  /**
   * Verify the webhook token during initial Meta verification handshake.
   * Meta sends a GET request with hub.mode, hub.verify_token, hub.challenge.
   */
  verifyWebhook(
    mode: string,
    token: string,
    challenge: string,
  ): string | null {
    const verifyToken = this.configService.getOrThrow<string>(
      'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
    );

    if (mode === 'subscribe' && token === verifyToken) {
      this.logger.log('Webhook verified successfully ✅');
      return challenge;
    }

    this.logger.warn('Webhook verification failed ❌');
    return null;
  }

  /**
   * Process incoming webhook payload from Meta.
   */
  processWebhookPayload(payload: any): void {
    if (payload.object !== 'whatsapp_business_account') {
      return;
    }

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;

        // Handle incoming messages
        if (value.messages) {
          for (const message of value.messages) {
            this.handleIncomingMessage(message, value.contacts?.[0]);
          }
        }

        // Handle message status updates (sent, delivered, read)
        if (value.statuses) {
          for (const status of value.statuses) {
            this.handleStatusUpdate(status);
          }
        }
      }
    }
  }

  private handleIncomingMessage(message: any, contact: any): void {
    const from = message.from;
    const name = contact?.profile?.name || 'Unknown';
    const type = message.type;

    this.logger.log(
      `📩 Incoming ${type} message from ${name} (${from})`,
    );

    if (type === 'text') {
      this.logger.log(`   Text: "${message.text.body}"`);
      // TODO: Process the message — save to DB, auto-reply, etc.
    }

    // Auto-mark as read
    this.markMessageAsRead(message.id).catch(() => {});
  }

  private handleStatusUpdate(status: any): void {
    this.logger.log(
      `📊 Message ${status.id} → ${status.status} (to: ${status.recipient_id})`,
    );
    // TODO: Update message status in your DB
  }
}
