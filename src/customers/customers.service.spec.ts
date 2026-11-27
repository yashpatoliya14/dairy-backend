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
      create: vi.fn(),
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

    const singleBill = await service.getCustomerBillSummary('u1', 'c1', 2026, 11);
    expect(singleBill.customerId).toBe('c1');
    expect(singleBill.thisMonthPaid).toBe(60);
    expect(singleBill.thisMonthDue).toBe(60);
    expect(singleBill.hasPayment).toBe(true);
  });

  it('scanCards returns apiKeyRequired when no key is configured', async () => {
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
    expect(result.apiKeyRequired).toBe(true);
    expect(result.customers).toEqual([]);
  });
});
