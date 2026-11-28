import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { calculateEntryTotal, roundToCurrency } from '../customers/billing.utils.js';

export interface DailyMilkDeliveryParamsInput {
  customerName: string;
  dateStr: string;
  session?: string;
  liters: number;
  ratePerLiter: number;
  todayAmount?: number;
  monthToDateBill?: number;
  previousDue?: number;
  totalPayable?: number;
  distributorName: string;
  distributorPhone?: string;
}

/**
 * Single source of truth message builder for Meta-approved daily milk delivery template.
 * Produces the exact 9 parameters for 'daily_milk_delivery_update'.
 */
export function buildDailyMilkDeliveryParameters(
  input: DailyMilkDeliveryParamsInput,
): string[] {
  const sessionSuffix = input.session ? ` (${input.session})` : '';
  const dateAndSession = `${input.dateStr}${sessionSuffix}`;
  const litersStr = `${input.liters.toFixed(1)} L`;
  const rateStr = input.ratePerLiter.toFixed(2);
  const todayAmount = roundToCurrency(
    input.todayAmount ?? calculateEntryTotal(input.liters, input.ratePerLiter),
  );
  const monthToDateBill = roundToCurrency(
    input.monthToDateBill ?? todayAmount,
  );
  const previousDue = roundToCurrency(Math.max(0, input.previousDue ?? 0));
  const totalPayable = roundToCurrency(
    input.totalPayable ?? (monthToDateBill + previousDue),
  );
  const contactInfo = input.distributorPhone
    ? `${input.distributorName} (${input.distributorPhone})`
    : input.distributorName;

  return [
    input.customerName,
    dateAndSession,
    litersStr,
    rateStr,
    todayAmount.toFixed(2),
    monthToDateBill.toFixed(2),
    previousDue.toFixed(2),
    totalPayable.toFixed(2),
    contactInfo,
  ];
}

/**
 * Single source of truth message builder for plain text daily milk delivery notifications.
 */
export function buildDailyMilkDeliveryTextMessage(
  input: DailyMilkDeliveryParamsInput,
): string {
  const sessionSuffix = input.session ? ` (${input.session})` : '';
  const dateAndSession = `${input.dateStr}${sessionSuffix}`;
  const todayAmount = roundToCurrency(
    input.todayAmount ?? calculateEntryTotal(input.liters, input.ratePerLiter),
  );
  const monthToDateBill = roundToCurrency(
    input.monthToDateBill ?? todayAmount,
  );
  const previousDue = roundToCurrency(Math.max(0, input.previousDue ?? 0));
  const totalPayable = roundToCurrency(
    input.totalPayable ?? (monthToDateBill + previousDue),
  );

  return (
    `🥛 *DAILY MILK COLLECTION UPDATE*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Hello *${input.customerName}*,\n\n` +
    `Your milk delivery has been recorded successfully:\n\n` +
    `📅 *Date & Shift:* ${dateAndSession}\n` +
    `🥛 *Today's Milk:* ${input.liters.toFixed(1)} L @ ₹${input.ratePerLiter.toFixed(2)}/L\n` +
    `💵 *Today's Amount:* ₹${todayAmount.toFixed(2)}\n\n` +
    `📊 *ACCOUNT BALANCE STATUS:*\n` +
    `• Current Month (Till Date): ₹${monthToDateBill.toFixed(2)}\n` +
    `• Past Overdue: ₹${previousDue.toFixed(2)}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💳 *TOTAL AMOUNT TO PAY: ₹${totalPayable.toFixed(2)}*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📞 *Dairy Owner Contact:*\n` +
    `• Name: ${input.distributorName}\n` +
    (input.distributorPhone ? `• Contact: ${input.distributorPhone}\n\n` : `\n`) +
    `Thank you for choosing our dairy service! 🥛`
  );
}

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
  type?: 'daily' | 'monthly';
  liters?: number; // e.g. 2.5
  totalLiters?: number;
  ratePerLiter: number; // e.g. 60
  totalAmount?: number; // optional, defaults to liters * ratePerLiter
  monthlyAmount?: number;
  monthName?: string;
  totalDays?: number;
  date?: string; // optional, e.g. "21-Oct-2026"
  deliverySession?: string; // 'Morning' | 'Evening' | 'Full Day'
  previousDue?: number; // optional outstanding balance
  monthToDateBill?: number; // month-to-date running bill till today
  advanceCredit?: number; // advance credit
  paidAmount?: number; // total amount paid towards this month's bill
  netPayable?: number; // net total payable
  notes?: string;
  distributorName?: string;
  distributorPhone?: string;
  useTemplate?: boolean; // if true, send as approved Meta template
  templateName?: string; // template name if useTemplate is true
  languageCode?: string;
}

export interface SendBillResult {
  status: 'SubmittedToProvider';
  messageId: string;
  recipient: string;
  formattedMessage: string;
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
import { RequestContext } from '@mikro-orm/core';
import { randomUUID } from 'node:crypto';
import { DailyMessageLog } from '../entities/daily-message-log.entity.js';
import { Customer } from '../entities/customer.entity.js';
import { MilkEntry } from '../entities/milk-entry.entity.js';
import { Distributor } from '../entities/distributor.entity.js';
import { User } from '../entities/user.entity.js';
import {
  SendDailyEntryBulkDto,
  SendDailyEntryDto,
  UpdateDailyMessageStatusDto,
} from './whatsapp.dto.js';
import { NotFoundException } from '@nestjs/common';

export interface BulkMessageJob {
  jobId: string;
  userId: string;
  date: string;
  totalSelected: number;
  eligibleCount: number;
  ineligibleCount: number;
  sentCount: number;
  failedCount: number;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'partially_completed';
  startedAt: string;
  completedAt?: string;
  results: Array<{
    customerId: string;
    customerName: string;
    status: string;
    error?: string;
  }>;
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly httpClient: AxiosInstance;
  private readonly bulkJobs = new Map<string, BulkMessageJob>();

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
      timeout: 8_000,
    });
  }

  async sendMilkEntryMessage(input: {
    phoneNumber: string;
    customerName: string;
    liters: number;
    price: number;
  }) {
    return this.sendBillMessage({
      to: input.phoneNumber,
      customerName: input.customerName,
      type: 'daily',
      liters: input.liters,
      ratePerLiter: input.price,
      totalAmount: input.liters * input.price,
      useTemplate: true,
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
        language: {
          code:
            dto.languageCode ??
            this.config.get<string>('WHATSAPP_TEMPLATE_LANGUAGE') ??
            'en',
        },
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
   * Send a bill using the approved Meta template by default; free-form text is
   * reserved for callers that explicitly opt in during the 24-hour window.
   */
  async sendBillMessage(
    dto: SendBillMessageDto,
  ): Promise<SendBillResult> {
    const isMonthly = dto.type === 'monthly';
    const liters = isMonthly
      ? Number(dto.totalLiters ?? dto.liters ?? 0)
      : Number(dto.liters ?? 0);
    const rate = Number(dto.ratePerLiter ?? 0);
    const amount = isMonthly
      ? Number(
          dto.monthlyAmount ??
            dto.totalAmount ??
            liters * rate,
        )
      : Number(dto.totalAmount ?? liters * rate);
    const previousDue = Number(dto.previousDue ?? 0);
    const advanceCredit = Number(dto.advanceCredit ?? 0);
    const paidAmount = Number(dto.paidAmount ?? 0);
    const monthToDateBill = Number(dto.monthToDateBill ?? amount);

    // Exact financial settlement: (current month bill + past overdue) - (advance credit + payment received)
    const grossPayable = roundToCurrency(amount + previousDue);
    const totalCredits = roundToCurrency(advanceCredit + paidAmount);
    const defaultMonthlyPayable = roundToCurrency(Math.max(0, grossPayable - totalCredits));

    const totalPayable = isMonthly
      ? Number(dto.netPayable ?? defaultMonthlyPayable)
      : roundToCurrency(monthToDateBill + previousDue);

    const dateOrMonth =
      (isMonthly ? dto.monthName : dto.date) ??
      new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    const sessionSuffix = dto.deliverySession ? ` (${dto.deliverySession})` : '';
    const distributorName =
      dto.distributorName ??
      this.config.get<string>('WHATSAPP_DISTRIBUTOR_NAME') ??
      'Dairy Owner';
    const distributorPhone =
      dto.distributorPhone ??
      this.config.get<string>('WHATSAPP_DISTRIBUTOR_PHONE') ??
      '+91 9104152524';

    const formattedMessage = isMonthly
      ? `🧾 *MILK BILL STATEMENT*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Hello *${dto.customerName}*,\n\n` +
        `Your milk bill for *${dateOrMonth}* has been generated.\n\n` +
        `📋 *DELIVERY SUMMARY:*\n` +
        `• Active Delivery Days: ${dto.totalDays ?? 30} Days\n` +
        `• Total Quantity: ${liters.toFixed(1)} L\n` +
        `• Rate per Liter: ₹${rate.toFixed(2)}/L\n\n` +
        `💰 *BILL BREAKDOWN:*\n` +
        `• Monthly Milk Bill: ₹${amount.toFixed(2)}\n` +
        (previousDue > 0 ? `• Past Overdue: +₹${previousDue.toFixed(2)}\n` : '') +
        (advanceCredit > 0 ? `• Advance Credit: -₹${advanceCredit.toFixed(2)}\n` : '') +
        (paidAmount > 0 ? `• Amount Received: -₹${paidAmount.toFixed(2)}\n` : '') +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `⭐ *NET TOTAL PAYABLE: ₹${totalPayable.toFixed(2)}${totalPayable === 0 ? ' (Fully Settled)' : ''}*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📲 *Payment Options:*\n` +
        `Cash, UPI (GPay / PhonePe / Paytm), or Bank Transfer.\n\n` +
        `📞 *Dairy Owner Contact:*\n` +
        `• Name: ${distributorName}\n` +
        `• Contact: ${distributorPhone}\n\n` +
        `Thank you for your business! Please settle your bill on time. 🥛`
      : buildDailyMilkDeliveryTextMessage({
          customerName: dto.customerName,
          dateStr: dateOrMonth,
          session: dto.deliverySession,
          liters,
          ratePerLiter: rate,
          todayAmount: amount,
          monthToDateBill,
          previousDue,
          totalPayable,
          distributorName,
          distributorPhone,
        });

    const normalizedTo = this.normalizePhoneNumber(dto.to);
    const maskedTo = this.maskPhoneNumber(normalizedTo);

    if (dto.useTemplate !== false) {
      const templateName = isMonthly
        ? (dto.templateName ??
           this.config.get<string>('WHATSAPP_MONTHLY_TEMPLATE_NAME') ??
           'monthly_milk_bill_settlement')
        : 'daily_milk_delivery_update'; // Consolidated single approved daily template

      let languageCode =
        dto.languageCode ??
        this.config.get<string>('WHATSAPP_TEMPLATE_LANGUAGE') ??
        'en';

      // Meta templates 'daily_milk_delivery_update', 'monthly_milk_bill_settlement', and 'dairy_milk_bill_update' are approved under language 'en'
      if (
        (templateName === 'daily_milk_delivery_update' ||
          templateName === 'monthly_milk_bill_settlement' ||
          templateName === 'dairy_milk_bill_update') &&
        (languageCode === 'en_US' || !languageCode)
      ) {
        languageCode = 'en';
      }

      let bodyParameters: string[];
      if (!isMonthly) {
        bodyParameters = buildDailyMilkDeliveryParameters({
          customerName: dto.customerName,
          dateStr: dateOrMonth,
          session: dto.deliverySession,
          liters,
          ratePerLiter: rate,
          todayAmount: amount,
          monthToDateBill,
          previousDue,
          totalPayable,
          distributorName,
          distributorPhone,
        });
      } else if (templateName === 'dairy_milk_bill_update') {
        // Meta approved 7-parameter legacy template: {{1}} Customer, {{2}} Month/Date, {{3}} Quantity, {{4}} Rate, {{5}} Due, {{6}} Distributor, {{7}} Phone
        bodyParameters = [
          dto.customerName,
          dto.monthName ?? dateOrMonth,
          `${liters.toFixed(1)} L`,
          rate.toFixed(2),
          totalPayable.toFixed(2),
          distributorName,
          distributorPhone,
        ];
      } else {
        // Meta approved 11-parameter 'monthly_milk_bill_settlement' template
        bodyParameters = [
          dto.customerName,
          dto.monthName ?? dateOrMonth,
          `${dto.totalDays ?? 30} Days`,
          `${liters.toFixed(1)} L`,
          rate.toFixed(2),
          amount.toFixed(2),
          previousDue.toFixed(2),
          advanceCredit.toFixed(2),
          totalPayable.toFixed(2),
          distributorName,
          distributorPhone,
        ];
      }

      this.logger.log(
        `Sending bill template "${templateName}" (${languageCode}) with ${bodyParameters.length} params to ${maskedTo} (amount: ₹${totalPayable.toFixed(2)})`,
      );

      const { messageId } = await this.sendTemplateMessage({
        to: normalizedTo,
        templateName,
        languageCode,
        bodyParameters,
      });

      return {
        status: 'SubmittedToProvider',
        messageId,
        recipient: maskedTo,
        formattedMessage,
      };
    }

    this.logger.log(
      `Sending direct text bill to ${maskedTo} within 24h customer window`,
    );

    const { messageId } = await this.sendTextMessage({
      to: normalizedTo,
      message: formattedMessage,
    });

    return {
      status: 'SubmittedToProvider',
      messageId,
      recipient: maskedTo,
      formattedMessage,
    };
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

  async inspectNode(id: string): Promise<unknown> {
    try {
      const res = await this.httpClient.get(`/${id}`);
      return res.data;
    } catch (e) {
      throw this.apiException(e, `Could not inspect ${id}`);
    }
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

  async createBillTemplate(): Promise<{ id: string; status: string; category: string }> {
    const wabaId = this.requiredConfig('WHATSAPP_BUSINESS_ACCOUNT_ID');
    const templateName =
      this.config.get<string>('WHATSAPP_MILK_BILL_TEMPLATE_NAME') ??
      'dairy_milk_bill_update';
    const language =
      this.config.get<string>('WHATSAPP_TEMPLATE_LANGUAGE') ?? 'en_US';

    try {
      const response = await this.httpClient.post<{
        id: string;
        status: string;
        category: string;
      }>(`/${wabaId}/message_templates`, {
        name: templateName,
        category: 'UTILITY',
        language,
        components: [
          {
            type: 'BODY',
            text: 'Hi {{1}}, your milk bill for {{2}} is ready. Quantity: {{3}}. Rate: ₹{{4}}/L. Total due: ₹{{5}}.',
            example: {
              body_text: [
                ['Ramesh Patel', 'October 2026', '30.0 L', '60.00', '1800.00'],
              ],
            },
          },
        ],
      });
      this.logger.log(
        `Created WhatsApp template "${templateName}" on Meta: ID ${response.data.id}, status ${response.data.status}`,
      );
      return response.data;
    } catch (error) {
      throw this.apiException(error, 'Could not create WhatsApp bill template');
    }
  }

  async getDiagnostics(): Promise<Record<string, unknown>> {
    const wabaId = this.requiredConfig('WHATSAPP_BUSINESS_ACCOUNT_ID');
    const phoneNumberId = this.requiredConfig('WHATSAPP_PHONE_NUMBER_ID');
    const configuredBillTemplate =
      this.config.get<string>('WHATSAPP_MILK_BILL_TEMPLATE_NAME') ??
      'dairy_milk_bill_update';

    const result: Record<string, unknown> = {
      wabaId,
      phoneNumberId,
      configuredBillTemplate,
    };

    try {
      const phoneRes = await this.httpClient.get(`/${phoneNumberId}`);
      result.phoneNumberInfo = phoneRes.data;
    } catch (e) {
      result.phoneNumberError = this.errorMessage(e);
    }

    try {
      const wabaRes = await this.httpClient.get(
        `/${wabaId}?fields=id,name,timezone_id`,
      );
      result.wabaInfo = wabaRes.data;
    } catch (e) {
      result.wabaError = this.errorMessage(e);
    }

    try {
      const templatesRes = await this.httpClient.get<{ data?: Array<{ name?: string; status?: string; language?: string }> }>(
        `/${wabaId}/message_templates?limit=100`,
      );
      const templates = templatesRes.data?.data ?? [];
      result.templates = templates;
      const found = templates.find((t) => t.name === configuredBillTemplate);
      result.billTemplateStatus = found ? found.status : 'NOT_FOUND_ON_META';
    } catch (e) {
      result.templatesError = this.errorMessage(e);
      result.billTemplateStatus = 'UNKNOWN';
    }

    return result;
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
    let normalized = value.replace(/[^\d]/g, '');
    if (normalized.length === 10 && /^[6-9]\d{9}$/.test(normalized)) {
      normalized = `91${normalized}`;
    }
    if (!/^[1-9]\d{7,14}$/.test(normalized)) {
      throw new BadGatewayException(
        'WhatsApp phone number must include country code with no +, spaces, or dashes',
      );
    }
    return normalized;
  }

  private maskPhoneNumber(phone: string): string {
    if (phone.length <= 4) return phone;
    const visibleStart = Math.min(4, Math.floor(phone.length / 2));
    const visibleEnd = 2;
    const maskedLength = phone.length - visibleStart - visibleEnd;
    return (
      phone.slice(0, visibleStart) +
      '*'.repeat(Math.max(3, maskedLength)) +
      phone.slice(-visibleEnd)
    );
  }

  private apiException(error: unknown, fallback: string): BadGatewayException {
    const axiosError = error as AxiosError<{ error?: { message?: string; error_data?: { details?: string } }; message?: string }>;
    const metaError = axiosError.response?.data?.error;
    const msg =
      metaError?.error_data?.details ??
      metaError?.message ??
      axiosError.response?.data?.message ??
      (error instanceof Error ? error.message : fallback);
    return new BadGatewayException(msg);
  }

  private errorMessage(error: unknown): string {
    const axiosError = error as AxiosError<{ error?: { message?: string; error_data?: { details?: string } } }>;
    const metaMsg = axiosError.response?.data?.error?.message;
    if (metaMsg) return metaMsg;
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
        : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

    const allCustomers = await this.customers.find(
      { distributor },
      { orderBy: { uniqueNumber: 'ASC' } },
    );
    allCustomers.sort((a, b) => {
      const numA = Number.parseInt(String(a.uniqueNumber || '').replace(/\D/g, ''), 10);
      const numB = Number.parseInt(String(b.uniqueNumber || '').replace(/\D/g, ''), 10);
      if (Number.isInteger(numA) && Number.isInteger(numB)) {
        return numA - numB;
      }
      return (a.uniqueNumber || '').localeCompare(b.uniqueNumber || '', undefined, { numeric: true });
    });

    const em = this.customers.getEntityManager();
    const conn = typeof em.getConnection === 'function' ? em.getConnection() : null;
    let entries: Array<{
      eid: string;
      cid: string;
      liters: number | string;
      price: number | string;
      total: number | string;
    }> = [];
    let logs: Array<any> = [];

    if (conn) {
      entries = await conn.execute<
        Array<{
          eid: string;
          cid: string;
          liters: number | string;
          price: number | string;
          total: number | string;
        }>
      >(
        'SELECT eid, cid, liters, price, total FROM milk_entries WHERE did = ? AND entry_date = ?',
        [distributor.did, effectiveDateStr],
      );
      logs = await conn.execute<
        Array<{
          id: string;
          cid: string;
          status: string;
          attempt_count?: number;
          last_attempted_at?: Date | string | null;
          message_content?: string | null;
          provider_message_id?: string | null;
          error_message?: string | null;
        }>
      >(
        'SELECT id, cid, status, attempt_count, last_attempted_at, message_content, provider_message_id, error_message FROM daily_message_logs WHERE did = ? AND entry_date = ?',
        [distributor.did, effectiveDateStr],
      );
    } else {
      const ormEntries = await this.milkEntries.find({ distributor });
      entries = ormEntries
        .filter(
          (e) =>
            (e.entryDate instanceof Date
              ? e.entryDate.toISOString().slice(0, 10)
              : String(e.entryDate).slice(0, 10)) === effectiveDateStr,
        )
        .map((e) => ({
          eid: e.eid,
          cid: e.customer.cid,
          liters: e.liters,
          price: e.price,
          total: e.total,
        }));
      const ormLogs = await this.messageLogs.find({ distributor });
      logs = ormLogs
        .filter(
          (l) =>
            (l.entryDate instanceof Date
              ? l.entryDate.toISOString().slice(0, 10)
              : String(l.entryDate).slice(0, 10)) === effectiveDateStr,
        )
        .map((l) => ({
          id: l.id,
          cid: l.customer.cid,
          status: l.status,
          attempt_count: l.attemptCount,
          last_attempted_at: l.lastAttemptedAt,
          message_content: l.messageContent,
          provider_message_id: l.providerMessageId,
          error_message: l.errorMessage,
        }));
    }
    const entryByCid = new Map(entries.map((e) => [e.cid, e]));
    const logByCid = new Map(logs.map((l) => [l.cid, l]));

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
        ? (entry.total != null
            ? Number(entry.total)
            : Math.round((liters * price + Number.EPSILON) * 100) / 100)
        : hasEntry
        ? Math.round((liters * price + Number.EPSILON) * 100) / 100
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
              attemptCount: (log as any).attempt_count ?? (log as any).attemptCount ?? 1,
              lastAttemptedAt: (log as any).last_attempted_at ?? (log as any).lastAttemptedAt ?? null,
              messageContent: (log as any).message_content ?? (log as any).messageContent ?? null,
              providerMessageId: (log as any).provider_message_id ?? (log as any).providerMessageId ?? null,
              errorMessage: (log as any).error_message ?? (log as any).errorMessage ?? null,
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

    const cleanDateStr = (dto.date || '').slice(0, 10);
    const entryDate = new Date(`${cleanDateStr}T00:00:00.000Z`);
    const em = this.messageLogs.getEntityManager();
    const conn = typeof em.getConnection === 'function' ? em.getConnection() : null;
    let log: DailyMessageLog | null = null;
    if (conn) {
      const rawLogs = await conn.execute<Array<{ id: string }>>(
        'SELECT id FROM daily_message_logs WHERE cid = ? AND entry_date = ? LIMIT 1',
        [customer.cid, cleanDateStr],
      );
      if (rawLogs.length > 0) {
        log = await this.messageLogs.findOne({ id: rawLogs[0].id });
      }
    } else {
      log = await this.messageLogs.findOne({ distributor, customer, entryDate });
    }

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

  async sendDailyEntry(
    userId: string,
    dto: SendDailyEntryDto,
  ): Promise<{ success: boolean; status: string; messageId?: string; error?: string }> {
    const user = await this.users.findOne({ uid: userId });
    if (!user) throw new NotFoundException('User not found');
    const distributor = await this.distributors.findOne({ user });
    if (!distributor) throw new NotFoundException('Distributor not found');

    const customer = await this.customers.findOne({
      cid: dto.customerId,
      distributor,
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const phone = customer.phoneNumber?.trim();
    const cleanPhone = (phone ?? '').replace(/\D/g, '');
    if (!phone || cleanPhone.length < 10) {
      await this.updateMessageStatus(userId, {
        customerId: customer.cid,
        date: dto.date,
        status: 'failed',
        errorMessage: 'Customer has no valid mobile number. Skipped API call.',
      });
      return {
        success: false,
        status: 'failed',
        error: 'Customer has no valid mobile number. Skipped API call.',
      };
    }

    const em = this.customers.getEntityManager();
    const conn = typeof em.getConnection === 'function' ? em.getConnection() : null;
    const cleanDateStr = (dto.date || '').slice(0, 10);
    let rawEntries: Array<{ eid: string; liters: number | string; price: number | string; total: number | string }> = [];
    if (conn) {
      rawEntries = await conn.execute(
        'SELECT eid, liters, price, total FROM milk_entries WHERE cid = ? AND entry_date = ? LIMIT 1',
        [customer.cid, cleanDateStr],
      );
    } else {
      const found = await this.milkEntries.findOne({
        distributor,
        customer,
        entryDate: new Date(`${cleanDateStr}T00:00:00.000Z`),
      });
      if (found) {
        rawEntries = [
          { eid: found.eid, liters: found.liters, price: found.price, total: found.total },
        ];
      }
    }

    const hasSpecificEntry = rawEntries.length > 0;
    const liters = hasSpecificEntry
      ? Number(rawEntries[0].liters)
      : Number(customer.liters ?? 0);
    const price = hasSpecificEntry
      ? Number(rawEntries[0].price)
      : Number(customer.price ?? 0);
    const total = hasSpecificEntry
      ? (rawEntries[0].total != null
          ? Number(rawEntries[0].total)
          : Math.round((liters * price + Number.EPSILON) * 100) / 100)
      : Math.round((liters * price + Number.EPSILON) * 100) / 100;

    const [y, m, d] = cleanDateStr.split('-');
    const formattedDate = (y && m && d)
      ? `${d}-${m}-${y}`
      : new Date().toLocaleDateString('en-IN');

    const distributorName =
      distributor.dairyName ??
      this.config.get<string>('WHATSAPP_DISTRIBUTOR_NAME') ??
      'Dairy Desk';
    const distributorPhone =
      user.phoneNumber ??
      this.config.get<string>('WHATSAPP_DISTRIBUTOR_PHONE') ??
      '+91 7600579310';

    let monthToDateBill = total;
    let previousDue = 0;

    try {
      const monthStart = `${cleanDateStr.slice(0, 7)}-01`;
      if (conn) {
        try {
          const monthEntries = await conn.execute<Array<{ total: number | string }>>(
            'SELECT total FROM milk_entries WHERE cid = ? AND entry_date >= ? AND entry_date <= ?',
            [customer.cid, monthStart, cleanDateStr],
          );
          const sum = monthEntries.reduce((acc, e) => acc + Number(e.total ?? 0), 0);
          if (sum > 0) monthToDateBill = roundToCurrency(sum);

          const pastEntries = await conn.execute<Array<{ total: number | string }>>(
            'SELECT total FROM milk_entries WHERE cid = ? AND entry_date < ?',
            [customer.cid, monthStart],
          );
          const pastBills = pastEntries.reduce((acc, e) => acc + Number(e.total ?? 0), 0);

          const curY = Number(cleanDateStr.slice(0, 4));
          const curM = Number(cleanDateStr.slice(5, 7));
          const pastPayments = await conn.execute<Array<{ received_amount: number | string }>>(
            'SELECT received_amount FROM payment_entries WHERE cid = ? AND (year < ? OR (year = ? AND month < ?))',
            [customer.cid, curY, curY, curM],
          );
          const pastPaid = pastPayments.reduce((acc, p) => acc + Number(p.received_amount ?? 0), 0);
          if (pastBills > pastPaid) {
            previousDue = roundToCurrency(pastBills - pastPaid);
          }
        } catch {
          monthToDateBill = total;
          previousDue = 0;
        }
      }

      const billResult = await this.sendBillMessage({
        to: phone,
        customerName: customer.name,
        liters,
        ratePerLiter: price,
        totalAmount: total,
        monthToDateBill: monthToDateBill > 0 ? monthToDateBill : total,
        previousDue,
        type: 'daily',
        date: formattedDate,
        distributorName,
        distributorPhone,
        useTemplate: true,
      });

      await this.updateMessageStatus(userId, {
        customerId: customer.cid,
        date: dto.date,
        status: 'sent',
        providerMessageId: billResult.messageId,
        messageContent: billResult.formattedMessage,
      });

      return {
        success: true,
        status: 'sent',
        messageId: billResult.messageId,
      };
    } catch (err: unknown) {
      const errMessage = this.errorMessage(err);
      this.logger.warn(
        `Template send failed for ${customer.name}: ${errMessage}. Attempting text fallback...`,
      );
      try {
        const textToSend =
          dto.message ??
          buildDailyMilkDeliveryTextMessage({
            customerName: customer.name,
            dateStr: formattedDate,
            liters,
            ratePerLiter: price,
            todayAmount: total,
            monthToDateBill: monthToDateBill > 0 ? monthToDateBill : total,
            previousDue,
            totalPayable: roundToCurrency(monthToDateBill + previousDue),
            distributorName,
            distributorPhone,
          });

        const textResult = await this.sendTextMessage({
          to: phone,
          message: textToSend,
        });

        await this.updateMessageStatus(userId, {
          customerId: customer.cid,
          date: dto.date,
          status: 'sent',
          providerMessageId: textResult.messageId,
          messageContent: textToSend,
        });

        return {
          success: true,
          status: 'sent',
          messageId: textResult.messageId,
        };
      } catch (fallbackErr: unknown) {
        const finalError = this.errorMessage(fallbackErr);
        await this.updateMessageStatus(userId, {
          customerId: customer.cid,
          date: dto.date,
          status: 'failed',
          errorMessage: finalError,
        });

        return {
          success: false,
          status: 'failed',
          error: finalError,
        };
      }
    }
  }

  getBulkJobStatus(jobId: string): BulkMessageJob | null {
    return this.bulkJobs.get(jobId) ?? null;
  }

  async sendBulkDailyEntries(
    userId: string,
    dto: SendDailyEntryBulkDto,
  ): Promise<{
    success: boolean;
    jobId: string;
    totalSelected: number;
    eligibleCount: number;
    ineligibleCount: number;
    message: string;
  }> {
    const user = await this.users.findOne({ uid: userId });
    if (!user) throw new NotFoundException('User not found');
    const distributor = await this.distributors.findOne({ user });
    if (!distributor) throw new NotFoundException('Distributor not found');

    const cleanDateStr = (dto.date || '').slice(0, 10);
    const customers = await this.customers.find({
      distributor,
      cid: { $in: dto.customerIds },
    });

    const eligibleCustomers: Customer[] = [];
    let ineligibleCount = 0;

    for (const customer of customers) {
      const cleanCustomerPhone = (customer.phoneNumber ?? '').replace(/\D/g, '');
      const hasValidPhone = cleanCustomerPhone.length >= 10;
      if (hasValidPhone) {
        eligibleCustomers.push(customer);
      } else {
        ineligibleCount++;
      }
    }

    const jobId = `job_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const job: BulkMessageJob = {
      jobId,
      userId,
      date: dto.date,
      totalSelected: dto.customerIds.length,
      eligibleCount: eligibleCustomers.length,
      ineligibleCount,
      sentCount: 0,
      failedCount: 0,
      status: 'queued',
      startedAt: new Date().toISOString(),
      results: [],
    };
    this.bulkJobs.set(jobId, job);

    // Keep memory map bounded
    if (this.bulkJobs.size > 100) {
      const oldestKey = this.bulkJobs.keys().next().value;
      if (oldestKey) this.bulkJobs.delete(oldestKey);
    }

    // Run bulk dispatch in background job via setImmediate with MikroORM RequestContext
    // This immediately frees the HTTP response in < 15ms so client does NOT wait or timeout!
    setImmediate(async () => {
      try {
        await RequestContext.create(
          this.messageLogs.getEntityManager(),
          async () => {
            await this.processBulkJob(job, eligibleCustomers, dto.date);
          },
        );
      } catch (bgErr: unknown) {
        this.logger.error(
          `[WhatsApp Bulk Job ${job.jobId}] Background runner error: ${this.errorMessage(bgErr)}`,
        );
        job.status = 'failed';
        job.completedAt = new Date().toISOString();
      }
    });

    return {
      success: true,
      jobId,
      totalSelected: dto.customerIds.length,
      eligibleCount: eligibleCustomers.length,
      ineligibleCount,
      message: `Bulk message job queued for ${eligibleCustomers.length} eligible customer(s) in background.`,
    };
  }

  private async processBulkJob(
    job: BulkMessageJob,
    eligibleCustomers: Customer[],
    dateStr: string,
  ): Promise<void> {
    job.status = 'processing';
    this.logger.log(
      `[WhatsApp Bulk Job ${job.jobId}] Starting background dispatch for ${eligibleCustomers.length} eligible customers (Date: ${dateStr})`,
    );

    // In background: batch-mark eligible customers as pending if not already sent
    try {
      const cleanDateStr = (dateStr || '').slice(0, 10);
      const entryDate = new Date(`${cleanDateStr}T00:00:00.000Z`);
      const user = await this.users.findOne({ uid: job.userId });
      const distributor = user ? await this.distributors.findOne({ user }) : null;
      const em = this.messageLogs.getEntityManager();
      const conn = typeof em.getConnection === 'function' ? em.getConnection() : null;
      if (distributor && user && conn) {
        const existingLogs = await conn.execute<Array<{ id: string; cid: string; status: string }>>(
          'SELECT id, cid, status FROM daily_message_logs WHERE did = ? AND entry_date = ?',
          [distributor.did, cleanDateStr],
        );
        const logMap = new Map(existingLogs.map((l) => [l.cid, l]));

        for (const customer of eligibleCustomers) {
          const existing = logMap.get(customer.cid);
          if (!existing) {
            const newLog = this.messageLogs.create({
              id: randomUUID(),
              customer,
              distributor,
              user,
              entryDate,
              status: 'pending',
              attemptCount: 1,
              lastAttemptedAt: new Date(),
            });
            this.messageLogs.getEntityManager().persist(newLog);
          } else if (existing.status !== 'sent') {
            const loaded = await this.messageLogs.findOne({ id: existing.id });
            if (loaded) {
              loaded.status = 'pending';
              loaded.lastAttemptedAt = new Date();
            }
          }
        }
        await this.messageLogs.getEntityManager().flush();
      }
    } catch (pendingErr: unknown) {
      this.logger.warn(`Could not set initial pending logs: ${this.errorMessage(pendingErr)}`);
    }

    for (const customer of eligibleCustomers) {
      try {
        const res = await this.sendDailyEntry(job.userId, {
          customerId: customer.cid,
          date: dateStr,
        });

        if (res.success) {
          job.sentCount++;
          job.results.push({
            customerId: customer.cid,
            customerName: customer.name,
            status: 'sent',
          });
        } else {
          job.failedCount++;
          job.results.push({
            customerId: customer.cid,
            customerName: customer.name,
            status: 'failed',
            error: res.error,
          });
        }
      } catch (err: unknown) {
        job.failedCount++;
        job.results.push({
          customerId: customer.cid,
          customerName: customer.name,
          status: 'failed',
          error: this.errorMessage(err),
        });
      }

      // Safe delay between WhatsApp messages (150ms)
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    if (job.failedCount > 0 && job.sentCount === 0) {
      job.status = 'failed';
    } else if (job.failedCount > 0 && job.sentCount > 0) {
      job.status = 'partially_completed';
    } else {
      job.status = 'completed';
    }
    job.completedAt = new Date().toISOString();
    this.logger.log(
      `[WhatsApp Bulk Job ${job.jobId}] Finished: ${job.sentCount} sent, ${job.failedCount} failed of ${eligibleCustomers.length} eligible.`,
    );
  }
}

