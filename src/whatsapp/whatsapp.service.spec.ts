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
    config.set('WHATSAPP_MILK_BILL_TEMPLATE_NAME', 'dairy_milk_bill_update');
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

  it('sends daily bills using the configured approved template by default', async () => {
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
        name: 'dairy_milk_bill_update',
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
              { type: 'text', text: 'Haresh Sambad' },
              { type: 'text', text: '+91 9104152524' },
            ],
          },
        ],
      },
    });
  });

  it('accepts monthly payload fields and includes previous due only once', async () => {
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
    });

    expect(result.status).toBe('SubmittedToProvider');
    expect(requests[0].body).toMatchObject({
      type: 'template',
      template: {
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Test Customer' },
              { type: 'text', text: 'October 2026' },
              { type: 'text', text: '30.0 L' },
              { type: 'text', text: '60.00' },
              { type: 'text', text: '1900.00' },
              { type: 'text', text: 'Haresh Sambad' },
              { type: 'text', text: '+91 9104152524' },
            ],
          },
        ],
      },
    });
    expect(result.formattedMessage).toContain('Milk Billing & Delivery Update');
    expect(result.formattedMessage).toContain('Total Amount Due: ₹1900.00');
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
