import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import axios, { type AxiosAdapter } from 'axios';
import { SendBillMessageRequest } from './whatsapp.dto.js';
import { WhatsAppService } from './whatsapp.service.js';

describe('SendBillMessageRequest', () => {
  it('validates monthly requests without requiring daily liters', async () => {
    const dto = plainToInstance(SendBillMessageRequest, {
      to: '919876543210',
      customerName: 'Test Customer',
      type: 'monthly',
      totalLiters: 30,
      ratePerLiter: 60,
      monthlyAmount: 1800,
      useTemplate: true,
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('requires total liters for monthly requests', async () => {
    const dto = plainToInstance(SendBillMessageRequest, {
      to: '919876543210',
      customerName: 'Test Customer',
      type: 'monthly',
      ratePerLiter: 60,
    });

    expect((await validate(dto)).map((error) => error.property)).toContain(
      'totalLiters',
    );
  });
});

describe('WhatsAppService.sendBillMessage', () => {
  const requests: Array<{ url?: string; body: Record<string, unknown> }> = [];
  let service: WhatsAppService;

  beforeEach(() => {
    requests.length = 0;
    const config = new ConfigService();
    config.set('WHATSAPP_PHONE_NUMBER_ID', 'test-phone-number-id');
    config.set('WHATSAPP_ACCESS_TOKEN', 'test-access-token');
    config.set('WHATSAPP_DAILY_TEMPLATE_NAME', 'daily_milk_delivery_update');
    config.set('WHATSAPP_MONTHLY_TEMPLATE_NAME', 'monthly_milk_bill_settlement');
    config.set('WHATSAPP_TEMPLATE_LANGUAGE', 'en_US');

    const adapter: AxiosAdapter = async (request) => {
      requests.push({
        url: request.url,
        body: JSON.parse(String(request.data)) as Record<string, unknown>,
      });
      return {
        data: { messages: [{ id: 'wamid.test' }] },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: request,
      };
    };

    const client = axios.create({ adapter });
    vi.spyOn(axios, 'create').mockReturnValue(client);
    service = new WhatsAppService(config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends daily bills using the 9-parameter daily_milk_delivery_update template', async () => {
    const result = await service.sendBillMessage({
      to: '919876543210',
      customerName: 'Test Customer',
      type: 'daily',
      liters: 2,
      ratePerLiter: 60,
      totalAmount: 120,
      date: '23 Oct 2026',
    });

    expect(result.messageId).toBe('wamid.test');
    expect(result.status).toBe('SubmittedToProvider');
    expect(result.recipient).toBe('9198******10');
    expect(requests[0].url).toBe('/test-phone-number-id/messages');
    expect(requests[0].body).toMatchObject({
      type: 'template',
      template: {
        name: 'daily_milk_delivery_update',
        language: { code: 'en_US' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Test Customer' },
              { type: 'text', text: '23 Oct 2026' },
              { type: 'text', text: '2.0 L' },
              { type: 'text', text: '60.00' },
              { type: 'text', text: '120.00' },
              { type: 'text', text: '120.00' },
              { type: 'text', text: '0.00' },
              { type: 'text', text: '120.00' },
              { type: 'text', text: 'Dairy Owner (+91 9104152524)' },
            ],
          },
        ],
      },
    });
  });

  it('accepts monthly payload fields using 11-parameter monthly_milk_bill_settlement template', async () => {
    const result = await service.sendBillMessage({
      to: '919876543210',
      customerName: 'Test Customer',
      type: 'monthly',
      totalLiters: 30,
      ratePerLiter: 60,
      monthName: 'October 2026',
      monthlyAmount: 1800,
      totalAmount: 1900,
      previousDue: 100,
      advanceCredit: 0,
      totalDays: 30,
    });

    expect(result.status).toBe('SubmittedToProvider');
    expect(requests[0].body).toMatchObject({
      type: 'template',
      template: {
        name: 'monthly_milk_bill_settlement',
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Test Customer' },
              { type: 'text', text: 'October 2026' },
              { type: 'text', text: '30 Days' },
              { type: 'text', text: '30.0 L' },
              { type: 'text', text: '60.00' },
              { type: 'text', text: '1800.00' },
              { type: 'text', text: '100.00' },
              { type: 'text', text: '0.00' },
              { type: 'text', text: '1900.00' },
              { type: 'text', text: 'Dairy Owner' },
              { type: 'text', text: '+91 9104152524' },
            ],
          },
        ],
      },
    });
    expect(result.formattedMessage).toContain('MILK BILL STATEMENT');
    expect(result.formattedMessage).toContain('NET TOTAL PAYABLE: ₹1900.00');
  });

  it('skips customers with missing or invalid phone numbers in sendBulkDailyEntries', async () => {
    const mockUser = { uid: 'user-1' };
    const mockDistributor = { id: 'dist-1', user: mockUser, dairyName: 'Test Dairy' };
    const mockEntries = [
      { customer: { cid: 'c1' }, liters: 2, price: 60, total: 120 },
      { customer: { cid: 'c2' }, liters: 1.5, price: 60, total: 90 },
      { customer: { cid: 'c3' }, liters: 3, price: 60, total: 180 },
    ];
    const mockCustomers = [
      { cid: 'c1', name: 'Alice', phoneNumber: '9876543210' },
      { cid: 'c2', name: 'Bob', phoneNumber: '' }, // missing phone
      { cid: 'c3', name: 'Charlie', phoneNumber: '123' }, // invalid short phone
    ];

    const mockEmInstance: any = {
      persist: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
    };
    mockEmInstance.fork = vi.fn().mockReturnValue(mockEmInstance);

    (service as any).users = { findOne: vi.fn().mockResolvedValue(mockUser) };
    (service as any).distributors = { findOne: vi.fn().mockResolvedValue(mockDistributor) };
    (service as any).milkEntries = { find: vi.fn().mockResolvedValue(mockEntries) };
    (service as any).customers = { find: vi.fn().mockResolvedValue(mockCustomers) };
    (service as any).messageLogs = {
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockReturnValue({}),
      getEntityManager: vi.fn().mockReturnValue(mockEmInstance),
    };

    const res = await service.sendBulkDailyEntries('user-1', {
      date: '2026-10-26',
      customerIds: ['c1', 'c2', 'c3'],
    });

    // Only Alice has a valid phone (>= 10 digits) + entry. Bob and Charlie are filtered out upfront.
    expect(res.success).toBe(true);
    expect(res.totalSelected).toBe(3);
    expect(res.eligibleCount).toBe(1);
    expect(res.ineligibleCount).toBe(2);
  });

  it('normalizes 10-digit Indian phone numbers with 91 prefix', async () => {
    const result = await service.sendBillMessage({
      to: '9876543210',
      customerName: 'Test Customer',
      liters: 1,
      ratePerLiter: 60,
    });

    expect(result.status).toBe('SubmittedToProvider');
    expect(requests[0].body).toMatchObject({
      to: '919876543210',
    });
  });

  it('sends free-form text only when explicitly requested', async () => {
    const result = await service.sendBillMessage({
      to: '919876543210',
      customerName: 'Test Customer',
      liters: 1,
      ratePerLiter: 60,
      useTemplate: false,
    });

    expect(result.status).toBe('SubmittedToProvider');
    expect(requests[0].body).toMatchObject({
      type: 'text',
      text: { preview_url: false },
    });
  });

  it('throws BadGatewayException when Meta rejects message with provider error', async () => {
    const error: any = new Error('Request failed with status code 400');
    error.isAxiosError = true;
    error.response = {
      status: 400,
      data: {
        error: {
          message: '(#132001) Template name does not exist in the translation',
          code: 132001,
        },
      },
    };

    vi.spyOn((service as any).httpClient, 'post').mockRejectedValue(error);

    await expect(
      service.sendBillMessage({
        to: '919876543210',
        customerName: 'Test Customer',
        liters: 1,
        ratePerLiter: 60,
      }),
    ).rejects.toThrow('Template name does not exist in the translation');
  });

  it('throws ServiceUnavailableException when WhatsApp config is missing', async () => {
    const emptyConfig = new ConfigService();
    vi.spyOn(emptyConfig, 'get').mockReturnValue(undefined);
    const unconfiguredService = new WhatsAppService(emptyConfig);

    await expect(
      unconfiguredService.sendBillMessage({
        to: '919876543210',
        customerName: 'Test Customer',
        liters: 1,
        ratePerLiter: 60,
      }),
    ).rejects.toThrow('WhatsApp is not configured');
  });
});
