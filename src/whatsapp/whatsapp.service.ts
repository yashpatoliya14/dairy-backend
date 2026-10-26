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

import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import { randomUUID } from 'node:crypto';
import { DailyMessageLog } from '../entities/daily-message-log.entity.js';
import { Customer } from '../entities/customer.entity.js';
import { MilkEntry } from '../entities/milk-entry.entity.js';
import { Distributor } from '../entities/distributor.entity.js';
import { User } from '../entities/user.entity.js';
import { UpdateDailyMessageStatusDto } from './whatsapp.dto.js';
import { NotFoundException } from '@nestjs/common';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly httpClient: AxiosInstance;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(DailyMessageLog)
    private readonly messageLogs: EntityRepository<DailyMessageLog>,
    @InjectRepository(Customer)
    private readonly customers: EntityRepository<Customer>,
    @InjectRepository(MilkEntry)
    private readonly milkEntries: EntityRepository<MilkEntry>,
    @InjectRepository(Distributor)
    private readonly distributors: EntityRepository<Distributor>,
    @InjectRepository(User)
    private readonly users: EntityRepository<User>,
  ) {
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
        const response = await this.sendTemplateMessage({
          to: customer.phone,
          templateName,
          languageCode,
          bodyParameters: [customer.name],
        });
        result.success++;
        result.details.push({
          phone: customer.phone,
          status: 'sent',
          messageId: response.messageId,
        });
      } catch (error) {
        result.failed++;
        const message = this.errorMessage(error);
        result.details.push({
          phone: customer.phone,
          status: 'failed',
          error: message,
        });
        this.logger.error(`WhatsApp bulk send failed: ${message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return result;
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

  async getDailySummary(userId: string, dateStr?: string) {
    const user = await this.users.findOne({ uid: userId });
    if (!user) throw new NotFoundException('User not found');
    const distributor = await this.distributors.findOne({ user });
    if (!distributor) throw new NotFoundException('Distributor not found');

    const effectiveDateStr =
      dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
        ? dateStr
        : new Date().toISOString().slice(0, 10);

    const entryDate = new Date(`${effectiveDateStr}T00:00:00.000Z`);

    const allCustomers = await this.customers.find(
      { distributor },
      { orderBy: { uniqueNumber: 'ASC' } },
    );

    const entries = await this.milkEntries.find({
      distributor,
      entryDate,
    });
    const entryByCid = new Map(entries.map((e) => [e.customer.cid, e]));

    const logs = await this.messageLogs.find({
      distributor,
      entryDate,
    });
    const logByCid = new Map(logs.map((l) => [l.customer.cid, l]));

    let totalLiters = 0;
    let totalAmount = 0;
    let completedEntriesCount = 0;
    let sentCount = 0;
    let openedCount = 0;
    let pendingCount = 0;
    let failedCount = 0;
    let notSentCount = 0;

    const customerItems = allCustomers.map((customer) => {
      const entry = entryByCid.get(customer.cid);
      const log = logByCid.get(customer.cid);
      const hasEntry = Boolean(entry);

      const liters = entry
        ? Number(entry.liters)
        : Number(customer.liters ?? 0);
      const price = entry ? Number(entry.price) : Number(customer.price ?? 0);
      const total = entry
        ? Number(entry.total)
        : hasEntry
        ? liters * price
        : 0;

      if (hasEntry) {
        totalLiters += liters;
        totalAmount += total;
        completedEntriesCount++;
      }

      const status = log ? log.status : 'not_sent';
      if (status === 'sent') sentCount++;
      else if (status === 'opened_in_whatsapp') openedCount++;
      else if (status === 'pending') pendingCount++;
      else if (status === 'failed') failedCount++;
      else notSentCount++;

      return {
        customer: {
          id: customer.cid,
          name: customer.name,
          uniqueNumber: customer.uniqueNumber,
          phoneNumber: customer.phoneNumber ?? null,
          defaultLiters: Number(customer.liters),
          defaultPrice: Number(customer.price),
        },
        entry: entry
          ? {
              id: entry.eid,
              entryDate: effectiveDateStr,
              liters,
              price,
              total,
            }
          : null,
        hasEntry,
        messageLog: log
          ? {
              id: log.id,
              status: log.status,
              attemptCount: log.attemptCount,
              lastAttemptedAt: log.lastAttemptedAt,
              messageContent: log.messageContent,
              providerMessageId: log.providerMessageId,
              errorMessage: log.errorMessage,
            }
          : {
              status: 'not_sent',
              attemptCount: 0,
              lastAttemptedAt: null,
              messageContent: null,
              providerMessageId: null,
              errorMessage: null,
            },
      };
    });

    const missingEntriesCount = Math.max(
      0,
      allCustomers.length - completedEntriesCount,
    );

    return {
      date: effectiveDateStr,
      dairyName: distributor.dairyName,
      summary: {
        totalLiters: Number(totalLiters.toFixed(2)),
        totalAmount: Number(totalAmount.toFixed(2)),
        totalCustomers: allCustomers.length,
        completedEntriesCount,
        missingEntriesCount,
        sentCount,
        openedCount,
        pendingCount,
        failedCount,
        notSentCount,
      },
      customers: customerItems,
    };
  }

  async updateMessageStatus(userId: string, dto: UpdateDailyMessageStatusDto) {
    const user = await this.users.findOne({ uid: userId });
    if (!user) throw new NotFoundException('User not found');
    const distributor = await this.distributors.findOne({ user });
    if (!distributor) throw new NotFoundException('Distributor not found');
    const customer = await this.customers.findOne({
      cid: dto.customerId,
      distributor,
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const entryDate = new Date(`${dto.date}T00:00:00.000Z`);
    let log = await this.messageLogs.findOne({
      distributor,
      customer,
      entryDate,
    });

    if (!log) {
      log = this.messageLogs.create({
        id: randomUUID(),
        customer,
        distributor,
        user,
        entryDate,
        status: dto.status,
        attemptCount: 1,
        lastAttemptedAt: new Date(),
        messageContent: dto.messageContent,
        providerMessageId: dto.providerMessageId,
        errorMessage: dto.errorMessage,
      });
      this.messageLogs.getEntityManager().persist(log);
    } else {
      log.status = dto.status;
      log.attemptCount += 1;
      log.lastAttemptedAt = new Date();
      if (dto.messageContent) log.messageContent = dto.messageContent;
      if (dto.providerMessageId) log.providerMessageId = dto.providerMessageId;
      if (dto.errorMessage) {
        log.errorMessage = dto.errorMessage;
      } else if (
        dto.status === 'sent' ||
        dto.status === 'opened_in_whatsapp'
      ) {
        log.errorMessage = undefined;
      }
    }

    await this.messageLogs.getEntityManager().flush();

    return {
      id: log.id,
      customerId: customer.cid,
      date: dto.date,
      status: log.status,
      attemptCount: log.attemptCount,
      lastAttemptedAt: log.lastAttemptedAt,
      errorMessage: log.errorMessage,
      messageContent: log.messageContent,
    };
  }

  async getCustomerMessageHistory(userId: string, customerId: string) {
    const user = await this.users.findOne({ uid: userId });
    if (!user) throw new NotFoundException('User not found');
    const distributor = await this.distributors.findOne({ user });
    if (!distributor) throw new NotFoundException('Distributor not found');
    const customer = await this.customers.findOne({
      cid: customerId,
      distributor,
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const logs = await this.messageLogs.find(
      { distributor, customer },
      { orderBy: { entryDate: 'DESC' }, limit: 30 },
    );

    return logs.map((log) => ({
      id: log.id,
      date:
        log.entryDate instanceof Date
          ? log.entryDate.toISOString().slice(0, 10)
          : String(log.entryDate).slice(0, 10),
      status: log.status,
      attemptCount: log.attemptCount,
      lastAttemptedAt: log.lastAttemptedAt,
      messageContent: log.messageContent,
      errorMessage: log.errorMessage,
    }));
  }
}
