import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CustomersService } from './customers.service.js';
import { NotFoundException } from '@nestjs/common';

describe('CustomersService - Milk Entries & Card', () => {
  let service: CustomersService;
  let mockCustomersRepo: any;
  let mockDistributorsRepo: any;
  let mockUsersRepo: any;
  let mockEntriesRepo: any;
  let mockPaymentsRepo: any;
  let mockEntityManager: any;
  let mockSettingsService: any;
  let mockWhatsAppService: any;

  beforeEach(() => {
    mockEntityManager = {
      persist: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn(),
      clear: vi.fn(),
      getConnection: vi.fn(() => ({
        execute: vi.fn().mockResolvedValue([]),
      })),
    };

    mockCustomersRepo = {
      findOne: vi.fn(),
      find: vi.fn(),
      create: vi.fn((data) => ({ cid: 'c_' + Math.random(), ...data })),
      getEntityManager: () => mockEntityManager,
    };

    mockDistributorsRepo = {
      findOne: vi.fn(),
    };

    mockUsersRepo = {
      findOne: vi.fn(),
    };

    mockEntriesRepo = {
      findOne: vi.fn(),
      find: vi.fn(),
      create: vi.fn(),
      getEntityManager: () => mockEntityManager,
    };

    mockPaymentsRepo = {
      findOne: vi.fn(),
      find: vi.fn().mockResolvedValue([]),
      create: vi.fn((data) => data),
      getEntityManager: () => mockEntityManager,
    };

    mockSettingsService = {
      valuesFor: vi.fn(),
    };

    mockWhatsAppService = {
      sendMilkEntryMessage: vi.fn(),
    };

    service = new CustomersService(
      mockCustomersRepo,
      mockDistributorsRepo,
      mockUsersRepo,
      mockEntriesRepo,
      mockPaymentsRepo,
      mockSettingsService,
      mockWhatsAppService,
    );
  });

  it('lists entries with month filter correctly', async () => {
    const fakeUser = { uid: 'u1' };
    const fakeDistributor = { did: 'd1', user: fakeUser };
    const fakeCustomer = { cid: 'c1', distributor: fakeDistributor };

    mockUsersRepo.findOne.mockResolvedValue(fakeUser);
    mockDistributorsRepo.findOne.mockResolvedValue(fakeDistributor);
    mockCustomersRepo.findOne.mockResolvedValue(fakeCustomer);

    const mockEntries = [
      {
        eid: 'e1',
        entryDate: new Date('2026-10-01T00:00:00.000Z'),
        liters: 1.5,
        price: 60,
        total: 90,
      },
      {
        eid: 'e2',
        entryDate: new Date('2026-10-02T00:00:00.000Z'),
        liters: 2.0,
        price: 60,
        total: 120,
      },
    ];
    mockEntriesRepo.find.mockResolvedValue(mockEntries);

    const result = await service.listEntries('u1', 'c1', '2026-10');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 'e1',
      entryDate: '2026-10-01',
      liters: 1.5,
      price: 60,
      total: 90,
    });
    expect(mockEntriesRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: fakeCustomer,
        entryDate: expect.objectContaining({
          $gte: expect.any(Date),
          $lte: expect.any(Date),
        }),
      }),
      { orderBy: { entryDate: 'ASC' } },
    );
  });

  it('deletes an existing milk entry for the customer and distributor', async () => {
    const fakeUser = { uid: 'u1' };
    const fakeDistributor = { did: 'd1', user: fakeUser };
    const fakeCustomer = { cid: 'c1', distributor: fakeDistributor };
    const fakeEntry = {
      eid: 'e1',
      customer: fakeCustomer,
      distributor: fakeDistributor,
    };

    mockUsersRepo.findOne.mockResolvedValue(fakeUser);
    mockDistributorsRepo.findOne.mockResolvedValue(fakeDistributor);
    mockCustomersRepo.findOne.mockResolvedValue(fakeCustomer);
    mockEntriesRepo.findOne.mockResolvedValue(fakeEntry);

    const result = await service.deleteEntry('u1', 'c1', 'e1');
    expect(result.success).toBe(true);
    expect(mockEntityManager.remove).toHaveBeenCalledWith(fakeEntry);
    expect(mockEntityManager.flush).toHaveBeenCalled();
  });

  it('throws NotFoundException when entry to delete does not exist', async () => {
    const fakeUser = { uid: 'u1' };
    const fakeDistributor = { did: 'd1', user: fakeUser };
    const fakeCustomer = { cid: 'c1', distributor: fakeDistributor };

    mockUsersRepo.findOne.mockResolvedValue(fakeUser);
    mockDistributorsRepo.findOne.mockResolvedValue(fakeDistributor);
    mockCustomersRepo.findOne.mockResolvedValue(fakeCustomer);
    mockEntriesRepo.findOne.mockResolvedValue(null);

    await expect(service.deleteEntry('u1', 'c1', 'nonexistent')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('searches customers across name, phoneNumber and uniqueNumber', async () => {
    const fakeUser = { uid: 'u1' };
    const fakeDistributor = { did: 'd1', user: fakeUser };
    mockUsersRepo.findOne.mockResolvedValue(fakeUser);
    mockDistributorsRepo.findOne.mockResolvedValue(fakeDistributor);
    mockCustomersRepo.find.mockResolvedValue([
      {
        cid: 'c1',
        name: 'Haresh Sambad',
        uniqueNumber: '1',
        liters: 2,
        price: 60,
        phoneNumber: '919104152524',
        notificationChannel: 'whatsapp',
      },
    ]);

    const result = await service.list('u1', 'Haresh');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Haresh Sambad');
    expect(mockCustomersRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        distributor: fakeDistributor,
        $or: [
          { name: { $ilike: '%Haresh%' } },
          { phoneNumber: { $ilike: '%Haresh%' } },
          { uniqueNumber: { $ilike: '%Haresh%' } },
        ],
      }),
      { orderBy: { uniqueNumber: 'ASC' } },
    );
  });

  it('calculates entry total with financial decimal precision (no floating point errors)', async () => {
    const fakeUser = { uid: 'u1' };
    const fakeDistributor = { did: 'd1', user: fakeUser };
    const fakeCustomer = { cid: 'c1', distributor: fakeDistributor };
    mockUsersRepo.findOne.mockResolvedValue(fakeUser);
    mockDistributorsRepo.findOne.mockResolvedValue(fakeDistributor);
    mockCustomersRepo.findOne.mockResolvedValue(fakeCustomer);
    mockEntriesRepo.findOne.mockResolvedValue(null);
    mockEntriesRepo.create.mockImplementation((data: any) => ({
      ...data,
      entryDate: '2026-10-15',
    }));

    // 1.25 L @ 62.50 = 78.125 -> rounds to 78.13
    const result = await service.createEntry('u1', 'c1', {
      entryDate: '2026-10-15',
      liters: 1.25,
      price: 62.5,
    });
    expect(result.total).toBe(78.13);
    expect(mockEntriesRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        liters: 1.25,
        price: 62.5,
        total: 78.13,
      }),
    );
  });

  it('deletes customer along with payments and entries without altering other numbers', async () => {
    const fakeUser = { uid: 'u1' };
    const fakeDistributor = { did: 'd1', user: fakeUser };
    const fakeCustomer = {
      cid: 'c4',
      uniqueNumber: '4',
      distributor: fakeDistributor,
    };
    mockUsersRepo.findOne.mockResolvedValue(fakeUser);
    mockDistributorsRepo.findOne.mockResolvedValue(fakeDistributor);
    mockCustomersRepo.findOne.mockResolvedValue(fakeCustomer);
    mockPaymentsRepo.find.mockResolvedValue([{ pid: 'p1' }]);
    mockEntriesRepo.find.mockResolvedValue([{ eid: 'e1' }]);

    const res = await service.delete('u1', 'c4');
    expect(res.success).toBe(true);
    expect(res.deletedCustomerNumber).toBe('4');
    expect(mockEntityManager.clear).toHaveBeenCalled();
  });

  it('performs payment entry CRUD properly', async () => {
    const fakeUser = { uid: 'u1' };
    const fakeDistributor = { did: 'd1', user: fakeUser };
    const fakeCustomer = { cid: 'c1', distributor: fakeDistributor };
    mockUsersRepo.findOne.mockResolvedValue(fakeUser);
    mockDistributorsRepo.findOne.mockResolvedValue(fakeDistributor);
    mockCustomersRepo.findOne.mockResolvedValue(fakeCustomer);

    // Save payment
    mockPaymentsRepo.findOne.mockResolvedValue(null);
    mockPaymentsRepo.create.mockImplementation((data: any) => ({
      ...data,
      pid: 'p-new',
    }));

    const saved = await service.savePayment('u1', 'c1', {
      year: 2026,
      month: 11,
      billAmount: 10000,
      receivedAmount: 5000,
      note: '50% advance',
    });

    expect(saved.billAmount).toBe(10000);
    expect(saved.receivedAmount).toBe(5000);
    expect(saved.note).toBe('50% advance');
  });

  it('computes monthly bills summary in a single pass', async () => {
    const fakeUser = { uid: 'u1', firstName: 'John', lastName: 'Doe' };
    const fakeDistributor = { did: 'd1', user: fakeUser, dairyName: 'Speed Dairy' };
    const fakeCustomer = {
      cid: 'c1',
      name: 'Ramesh',
      uniqueNumber: '1',
      distributor: fakeDistributor,
      price: 60,
      liters: 2,
    };
    mockUsersRepo.findOne.mockResolvedValue(fakeUser);
    mockDistributorsRepo.findOne.mockResolvedValue(fakeDistributor);
    mockCustomersRepo.find.mockResolvedValue([fakeCustomer]);
    mockCustomersRepo.findOne.mockResolvedValue(fakeCustomer);
    // Bulk summary reads SQL rows (pg returns decimals as strings)
    const execute = vi.fn().mockResolvedValue([
      { cid: 'c1', d: '2026-11-05', liters: '2.00', total: '120.00' },
    ]);
    mockEntityManager.getConnection = vi.fn(() => ({ execute }));
    mockEntriesRepo.find.mockResolvedValue([
      {
        customer: fakeCustomer,
        entryDate: new Date('2026-11-05T00:00:00.000Z'),
        liters: 2,
        price: 60,
        total: 120,
      },
    ]);
    mockPaymentsRepo.find.mockResolvedValue([
      {
        customer: fakeCustomer,
        year: 2026,
        month: 11,
        billAmount: 120,
        receivedAmount: 60,
        receivedDate: new Date('2026-11-10T00:00:00.000Z'),
      },
    ]);

    const bills = await service.getMonthlyBillsSummary('u1', 2026, 11);
    expect(bills.length).toBe(1);
    expect(bills[0].customerId).toBe('c1');
    expect(bills[0].thisMonthBill).toBe(120);
    expect(bills[0].thisMonthPaid).toBe(60);
    expect(bills[0].thisMonthDue).toBe(60);
    expect(bills[0].hasPayment).toBe(true);
    expect(execute.mock.calls[0][1]).toEqual(['d1', '2026-11-01', 'd1', '2026-11-01', '2026-11-30']);

    const singleBill = await service.getCustomerBillSummary('u1', 'c1', 2026, 11);
    expect(singleBill.customerId).toBe('c1');
    expect(singleBill.thisMonthPaid).toBe(60);
    expect(singleBill.thisMonthDue).toBe(60);
    expect(singleBill.hasPayment).toBe(true);
  });

  it('carries pre-summed past months into the monthly bill', async () => {
    const fakeUser = { uid: 'u1' };
    const fakeDistributor = { did: 'd1', user: fakeUser };
    const fakeCustomer = { cid: 'c1', name: 'Ramesh', uniqueNumber: '1', price: 60, liters: 2 };
    mockUsersRepo.findOne.mockResolvedValue(fakeUser);
    mockDistributorsRepo.findOne.mockResolvedValue(fakeDistributor);
    mockCustomersRepo.find.mockResolvedValue([fakeCustomer]);
    mockPaymentsRepo.find.mockResolvedValue([]);
    mockEntityManager.getConnection = vi.fn(() => ({
      execute: vi.fn().mockResolvedValue([
        { cid: 'c1', d: '2026-10-01', liters: '30.00', total: '1800.00' },
        { cid: 'c1', d: '2026-11-05', liters: '2.00', total: '120.00' },
      ]),
    }));

    const [bill] = await service.getMonthlyBillsSummary('u1', 2026, 11);
    expect(bill.thisMonthBill).toBe(120);
    expect(bill.pastMonthsDue).toBe(1800);
    expect(bill.netBalanceDue).toBe(1920);
  });

  it('scanCards rejects blank/invalid cards with no customer name', async () => {
    const fakeUser = { uid: 'u1' };
    const fakeDistributor = { did: 'd1', user: fakeUser };
    mockUsersRepo.findOne.mockResolvedValue(fakeUser);
    mockDistributorsRepo.findOne.mockResolvedValue(fakeDistributor);
    mockSettingsService.valuesFor.mockResolvedValue({
      defaultLiters: 1.0,
      defaultPrice: 60.0,
    });
    mockCustomersRepo.find.mockResolvedValue([]);

    const result = await service.scanCards('u1', ['data:image/jpeg;base64,12345']);
    expect(result.success).toBe(false);
    expect(result.customers.length).toBe(0);
    expect(result.rejectedCount).toBe(1);
    expect(result.message).toContain('કાર્ડમાંથી ગ્રાહકનું નામ ડિટેક્ટ થઈ શક્યું નથી');
  });

  it('parseScannedCardText detects Gujarati, Hindi, and English names, mobile, and milk with dairy fallback', () => {
    const defaults = { defaultLiters: 1.5, defaultPrice: 50 };

    const guj = service.parseScannedCardText(
      'શ્રી ગોકુલ ડેરી\nગ્રાહકનું નામ ચીમનભાઈ પટેલ\nમોબાઈલ નંબર ૯૮૯૮૦ ૨૨૩૪૨\nદૈનિક જથ્થો ૨.૫ લિટર\nભાવ રૂ. ૭૦ / લીટર',
      defaults,
    );
    expect(guj).toEqual({
      name: 'ચીમનભાઈ પટેલ',
      phoneNumber: '9898022342',
      liters: 2.5,
      price: 70,
    });

    const hin = service.parseScannedCardText(
      'श्री गोकुल डेयरी\nग्राहक का नाम : रमेश कुमार शर्मा\nमोबाइल नंबर : 98765 43210\nदैनिक दूध : 2.0 लीटर',
      defaults,
    );
    expect(hin).toEqual({
      name: 'रमेश कुमार शर्मा',
      phoneNumber: '9876543210',
      liters: 2,
      price: 50, // dairy default
    });

    const engNoMilk = service.parseScannedCardText(
      'Shree Gokul Dairy\nCustomer Name: Pooja Parmar\nMobile No: +91 99040 62345',
      defaults,
    );
    expect(engNoMilk).toEqual({
      name: 'Pooja Parmar',
      phoneNumber: '9904062345',
      liters: 1.5, // dairy default
      price: 50, // dairy default
    });

    // Rejects phone-only / screenshot text without valid customer name
    expect(
      service.parseScannedCardText('Mobile: 9898022342\nGemini API Key Required', defaults),
    ).toBeNull();
    expect(
      service.parseScannedCardText('Daily Reminder Settings\n02:00 PM\n01:10 AM', defaults),
    ).toBeNull();
    expect(
      service.parseScannedCardText('Search by name or customer number\n#12 Haresh', defaults),
    ).toBeNull();
  });

  it('bulkCreate ensures static sequential unique numbers starting after highest existing customer', async () => {
    const fakeUser = { uid: 'u1' };
    const fakeDistributor = { did: 'd1', user: fakeUser };
    mockUsersRepo.findOne.mockResolvedValue(fakeUser);
    mockDistributorsRepo.findOne.mockResolvedValue(fakeDistributor);
    mockSettingsService.valuesFor.mockResolvedValue({
      defaultLiters: 1.5,
      defaultPrice: 50.0,
    });
    // Last customer #12 already exists
    mockCustomersRepo.find.mockResolvedValue([
      { cid: 'c1', uniqueNumber: '1', distributor: fakeDistributor },
      { cid: 'c12', uniqueNumber: '12', distributor: fakeDistributor },
    ]);

    const result = await service.bulkCreate('u1', [
      { name: 'Customer A', uniqueNumber: '12' }, // collides -> gets 13
      { name: 'Customer B', uniqueNumber: 'abc' }, // non-numeric -> gets 14
      { name: 'Customer C', uniqueNumber: '15', liters: 2.5, price: 70 },
    ]);

    expect(result.success).toBe(true);
    expect(result.customers.length).toBe(3);
    expect(result.customers[0].uniqueNumber).toBe('13');
    expect(result.customers[0].liters).toBe(1.5);
    expect(result.customers[0].price).toBe(50);
    expect(result.customers[1].uniqueNumber).toBe('14');
    expect(result.customers[2].uniqueNumber).toBe('15');
    expect(result.customers[2].liters).toBe(2.5);
    expect(result.customers[2].price).toBe(70);
  });
});
