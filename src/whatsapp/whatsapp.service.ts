import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError, AxiosInstance } from 'axios';

export interface SendTextMessageDto {
  to: string;
  message: string;
}

export interface SendTemplateMessageDto {
  to: string;
  templateName: string;
  languageCode?: string;
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

export interface SendBillMessageDto {
  to: string; // Customer phone e.g. "919104152524" (country code + number, no +)
  customerName: string; // e.g. "Ramesh Patel"
  liters: number; // e.g. 2.5
  ratePerLiter: number; // e.g. 60
  totalAmount?: number; // optional, defaults to liters * ratePerLiter
  date?: string; // optional, e.g. "21-Oct-2026"
  deliverySession?: string; // 'Morning' | 'Evening' | 'Full Day'
  previousDue?: number; // optional outstanding balance
  notes?: string;
  useTemplate?: boolean; // if true, send as approved Meta template
  templateName?: string; // template name if useTemplate is true
}

type MetaMessageResponse = {
  messages?: Array<{ id?: string }>;
};

export type MetaWebhookPayload = {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ profile?: { name?: string } }>;
        messages?: Array<{
          id?: string;
          from?: string;
          type?: string;
          text?: { body?: string };
        }>;
        statuses?: Array<{
          id?: string;
          status?: string;
          recipient_id?: string;
        }>;
      };
    }>;
  }>;
};

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly httpClient: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    const apiUrl =
      this.config.get<string>('WHATSAPP_API_URL') ??
      `https://graph.facebook.com/${
        this.config.get<string>('WHATSAPP_API_VERSION') ?? 'v21.0'
      }`;
    const accessToken = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');

    this.httpClient = axios.create({
      baseURL: apiUrl,
      headers: accessToken
        ? {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          }
        : { 'Content-Type': 'application/json' },
      timeout: 15_000,
    });
  }

  async sendMilkEntryMessage(input: {
    phoneNumber: string;
    customerName: string;
    liters: number;
    price: number;
  }) {
    return this.sendTemplateMessage({
      to: this.normalizePhoneNumber(input.phoneNumber),
      templateName:
        this.config.get<string>('WHATSAPP_MILK_ENTRY_TEMPLATE_NAME') ??
        'milk_delivery_update',
      languageCode:
        this.config.get<string>('WHATSAPP_TEMPLATE_LANGUAGE') ?? 'en_US',
      bodyParameters: [
        input.customerName,
        `${input.liters}L`,
        input.price.toFixed(2),
        (input.liters * input.price).toFixed(2),
      ],
    });
  }

  async sendTextMessage(
    dto: SendTextMessageDto,
  ): Promise<{ messageId: string }> {
    const data = await this.postMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.normalizePhoneNumber(dto.to),
      type: 'text',
      text: { preview_url: false, body: dto.message },
    });
    return this.messageResult(data);
  }

  async sendTemplateMessage(
    dto: SendTemplateMessageDto,
  ): Promise<{ messageId: string }> {
    const components =
      dto.bodyParameters && dto.bodyParameters.length > 0
        ? [
            {
              type: 'body',
              parameters: dto.bodyParameters.map((text) => ({
                type: 'text',
                text,
              })),
            },
          ]
        : undefined;
    const data = await this.postMessage({
      messaging_product: 'whatsapp',
      to: this.normalizePhoneNumber(dto.to),
      type: 'template',
      template: {
        name: dto.templateName,
        language: { code: dto.languageCode ?? 'en_US' },
        ...(components ? { components } : {}),
      },
    });
    return this.messageResult(data);
  }

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
      } catch (error) {
        result.failed++;
        result.details.push({
          phone: customer.phone,
          status: 'failed',
          error: this.errorMessage(error),
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return result;
  }

  /**
   * Auto-generate and send a milk billing message to a customer.
   * Can send either as formatted WhatsApp text message or as an approved Meta template.
   */
  async sendBillMessage(
    dto: SendBillMessageDto,
  ): Promise<{ messageId: string; formattedMessage: string }> {
    const today =
      dto.date ||
      new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    const amount =
      dto.totalAmount !== undefined
        ? Number(dto.totalAmount)
        : Number(dto.liters) * Number(dto.ratePerLiter);
    const totalPayable =
      amount + (dto.previousDue ? Number(dto.previousDue) : 0);

    const messageLines = [
      `🥛 *DAIRY MILK BILLING INVOICE* 🥛`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `👤 *Customer:* ${dto.customerName}`,
      `📅 *Date:* ${today}`,
      dto.deliverySession ? `⏰ *Session:* ${dto.deliverySession}` : null,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `📦 *Quantity:* ${dto.liters} Liters`,
      `💰 *Rate:* ₹${dto.ratePerLiter} / Liter`,
      `💵 *Today's Amount:* ₹${amount.toFixed(2)}`,
      dto.previousDue
        ? `⚠️ *Previous Due:* ₹${Number(dto.previousDue).toFixed(2)}`
        : null,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `🧾 *Total Payable:* ₹${totalPayable.toFixed(2)}`,
      dto.notes ? `\n📝 *Note:* ${dto.notes}` : null,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `🙏 *Thank you for your business!*`,
    ].filter(Boolean) as string[];

    const formattedMessage = messageLines.join('\n');

    if (dto.useTemplate && dto.templateName) {
      const { messageId } = await this.sendTemplateMessage({
        to: dto.to,
        templateName: dto.templateName,
        bodyParameters: [
          dto.customerName,
          String(dto.liters),
          String(dto.ratePerLiter),
          String(totalPayable.toFixed(2)),
        ],
      });
      return { messageId, formattedMessage };
    }

    const { messageId } = await this.sendTextMessage({
      to: dto.to,
      message: formattedMessage,
    });

    return { messageId, formattedMessage };
  }

  async sendImageMessage(
    to: string,
    imageUrl: string,
    caption?: string,
  ): Promise<{ messageId: string }> {
    const data = await this.postMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.normalizePhoneNumber(to),
      type: 'image',
      image: { link: imageUrl, ...(caption ? { caption } : {}) },
    });
    return this.messageResult(data);
  }

  async sendDocumentMessage(
    to: string,
    documentUrl: string,
    filename: string,
    caption?: string,
  ): Promise<{ messageId: string }> {
    const data = await this.postMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.normalizePhoneNumber(to),
      type: 'document',
      document: {
        link: documentUrl,
        filename,
        ...(caption ? { caption } : {}),
      },
    });
    return this.messageResult(data);
  }

  async listTemplates(): Promise<unknown[]> {
    const wabaId = this.requiredConfig('WHATSAPP_BUSINESS_ACCOUNT_ID');
    try {
      const response = await this.httpClient.get<{ data?: unknown[] }>(
        `/${wabaId}/message_templates`,
      );
      return response.data.data ?? [];
    } catch (error) {
      throw this.apiException(error, 'Could not list WhatsApp templates');
    }
  }

  async markMessageAsRead(messageId: string): Promise<void> {
    await this.postMessage({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
  }

  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    const verifyToken = this.config.get<string>(
      'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
    );
    if (verifyToken && mode === 'subscribe' && token === verifyToken) {
      return challenge;
    }
    this.logger.warn('WhatsApp webhook verification failed');
    return null;
  }

  processWebhookPayload(payload: MetaWebhookPayload): void {
    if (payload.object !== 'whatsapp_business_account') return;
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        for (const message of value?.messages ?? []) {
          const from = message.from ?? 'unknown';
          const name = value?.contacts?.[0]?.profile?.name ?? 'Unknown';
          this.logger.log(
            `Incoming ${message.type ?? 'unknown'} message from ${name} (${from})`,
          );
          if (message.text?.body)
            this.logger.log(`Text: "${message.text.body}"`);
          if (message.id) {
            this.markMessageAsRead(message.id).catch((error) =>
              this.logger.warn(
                `Could not mark message as read: ${this.errorMessage(error)}`,
              ),
            );
          }
        }
        for (const status of value?.statuses ?? []) {
          this.logger.log(
            `Message ${status.id ?? 'unknown'} -> ${status.status ?? 'unknown'} ` +
              `(to: ${status.recipient_id ?? 'unknown'})`,
          );
        }
      }
    }
  }

  private async postMessage(body: Record<string, unknown>) {
    const phoneNumberId = this.requiredConfig('WHATSAPP_PHONE_NUMBER_ID');
    this.requiredConfig('WHATSAPP_ACCESS_TOKEN');
    try {
      const response = await this.httpClient.post<MetaMessageResponse>(
        `/${phoneNumberId}/messages`,
        body,
      );
      return response.data;
    } catch (error) {
      throw this.apiException(error, 'WhatsApp rejected the message');
    }
  }

  private messageResult(data: MetaMessageResponse): { messageId: string } {
    const messageId = data.messages?.[0]?.id;
    if (!messageId) {
      throw new BadGatewayException('WhatsApp returned no message ID');
    }
    return { messageId };
  }

  private requiredConfig(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) {
      this.logger.error(`Missing WhatsApp configuration: ${key}`);
      throw new ServiceUnavailableException('WhatsApp is not configured');
    }
    return value;
  }

  private normalizePhoneNumber(value: string): string {
    const normalized = value.replace(/[^\d]/g, '');
    if (!/^[1-9]\d{7,14}$/.test(normalized)) {
      throw new BadGatewayException(
        'WhatsApp phone number must include country code with no +, spaces, or dashes',
      );
    }
    return normalized;
  }

  private apiException(error: unknown, fallback: string): BadGatewayException {
    const axiosError = error as AxiosError<{ error?: { message?: string } }>;
    return new BadGatewayException(
      axiosError.response?.data?.error?.message ??
        (error instanceof Error ? error.message : fallback),
    );
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown WhatsApp error';
  }
}
