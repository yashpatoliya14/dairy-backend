import { describe, expect, it } from 'vitest';
import { WhatsAppController } from '../src/whatsapp/whatsapp.controller.js';
import { WhatsAppService } from '../src/whatsapp/whatsapp.service.js';

describe('WhatsApp Daily Summary & Status Controller', () => {
  it('calls getDailySummary with user id and date', async () => {
    const mockSummary = {
      date: '2026-10-26',
      dairyName: 'Test Dairy',
      summary: {
        totalLiters: 10,
        totalAmount: 600,
        totalCustomers: 2,
        completedEntriesCount: 2,
        missingEntriesCount: 0,
        sentCount: 1,
        openedCount: 0,
        pendingCount: 0,
        failedCount: 0,
        notSentCount: 1,
      },
      customers: [],
    };

    const mockService = {
      getDailySummary: async (_userId: string, _date?: string) => mockSummary,
      updateMessageStatus: async () => ({ id: '1', status: 'opened_in_whatsapp' }),
      getCustomerMessageHistory: async () => [],
    } as unknown as WhatsAppService;

    const controller = new WhatsAppController(mockService);
    const mockReq = { user: { sub: 'user-123' } } as any;

    const res = await controller.getDailySummary(mockReq, '2026-10-26');
    expect(res).toEqual(mockSummary);
  });

  it('calls updateDailyMessageStatus with payload', async () => {
    const mockService = {
      updateMessageStatus: async (userId: string, dto: any) => ({
        id: 'log-1',
        customerId: dto.customerId,
        status: dto.status,
      }),
    } as unknown as WhatsAppService;

    const controller = new WhatsAppController(mockService);
    const mockReq = { user: { sub: 'user-123' } } as any;

    const res = await controller.updateDailyMessageStatus(mockReq, {
      customerId: 'cust-1',
      date: '2026-10-26',
      status: 'opened_in_whatsapp',
      messageContent: 'Test',
    });
    expect(res.status).toBe('opened_in_whatsapp');
    expect(res.customerId).toBe('cust-1');
  });
});
