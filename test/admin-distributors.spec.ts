import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { DistributorsService } from '../src/distributors/distributors.service.js';

describe('Admin Distributor Endpoints & Services', () => {
  let distributorsService: DistributorsService;
  let distributorsRepo: any;
  let customersRepo: any;
  let usersRepo: any;
  let milkEntriesRepo: any;
  let paymentEntriesRepo: any;
  let mockEm: any;

  beforeEach(() => {
    mockEm = {
      flush: vi.fn().mockResolvedValue(undefined),
    };

    distributorsRepo = {
      find: vi.fn(),
      findOne: vi.fn(),
      getEntityManager: vi.fn().mockReturnValue(mockEm),
    };

    customersRepo = {
      find: vi.fn(),
      findOne: vi.fn(),
      getEntityManager: vi.fn().mockReturnValue(mockEm),
    };

    usersRepo = {
      find: vi.fn(),
      findOne: vi.fn(),
      getEntityManager: vi.fn().mockReturnValue(mockEm),
    };

    milkEntriesRepo = {
      find: vi.fn(),
      findOne: vi.fn(),
    };

    paymentEntriesRepo = {
      find: vi.fn(),
      findOne: vi.fn(),
    };

    distributorsService = new DistributorsService(
      distributorsRepo,
      customersRepo,
      usersRepo,
      milkEntriesRepo,
      paymentEntriesRepo,
    );
  });

  describe('getStats', () => {
    it('calculates platform-wide statistics from real database entities', async () => {
      distributorsRepo.find.mockResolvedValue([
        { did: 'd1', isActive: true, dairyName: 'D1', user: {} },
        { did: 'd2', isActive: false, dairyName: 'D2', user: {} },
      ]);

      customersRepo.find.mockResolvedValue([
        { cid: 'c1', isActive: true },
        { cid: 'c2', isActive: true },
        { cid: 'c3', isActive: false },
      ]);

      milkEntriesRepo.find.mockResolvedValue([
        { eid: 'e1', liters: 10, price: 60, total: 600, entryDate: new Date('2026-11-20') },
        { eid: 'e2', liters: 5, price: 60, total: 300, entryDate: new Date('2026-11-21') },
      ]);

      paymentEntriesRepo.find.mockResolvedValue([
        { pid: 'p1', receivedAmount: 500, billAmount: 600, receivedDate: new Date('2026-11-22') },
      ]);

      const stats = await distributorsService.getStats();

      expect(stats.totalDistributors).toBe(2);
      expect(stats.activeDistributors).toBe(1);
      expect(stats.inactiveDistributors).toBe(1);
      expect(stats.totalCustomers).toBe(3);
      expect(stats.activeCustomers).toBe(2);
      expect(stats.totalMilkLiters).toBe(15);
      expect(stats.totalMilkValue).toBe(900);
      expect(stats.totalPaymentsReceived).toBe(500);
      expect(stats.totalOutstandingAmount).toBe(400);
      expect(stats.totalTransactions).toBe(1);
    });
  });

  describe('getDistributorDetails', () => {
    it('returns distributor profile, business metrics, and customer list', async () => {
      const mockDistributor = {
        did: 'dist-1',
        dairyName: 'Shree Dairy',
        isActive: true,
        createdAt: new Date('2026-01-01'),
        user: {
          uid: 'u-1',
          name: 'Ramesh Patel',
          email: 'ramesh@dairy.com',
          phoneNumber: '9876543210',
          isActive: true,
        },
      };

      distributorsRepo.findOne.mockResolvedValue(mockDistributor);
      customersRepo.find.mockResolvedValue([
        { cid: 'c-1', name: 'Cust 1', uniqueNumber: '1', liters: 2, price: 60, isActive: true },
      ]);
      milkEntriesRepo.find.mockResolvedValue([
        { eid: 'e-1', liters: 10, total: 600 },
      ]);
      paymentEntriesRepo.find.mockResolvedValue([
        { pid: 'p-1', receivedAmount: 400 },
      ]);

      const details = await distributorsService.getDistributorDetails('dist-1');

      expect(details.distributor.dairyName).toBe('Shree Dairy');
      expect(details.distributor.user.name).toBe('Ramesh Patel');
      expect(details.overview.totalCustomers).toBe(1);
      expect(details.overview.totalMilkLiters).toBe(10);
      expect(details.overview.totalMilkAmount).toBe(600);
      expect(details.overview.totalPaymentsReceived).toBe(400);
      expect(details.overview.outstandingBalance).toBe(200);
      expect(details.customers).toHaveLength(1);
    });

    it('throws NotFoundException when distributor does not exist', async () => {
      distributorsRepo.findOne.mockResolvedValue(null);

      await expect(
        distributorsService.getDistributorDetails('non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getCustomerDetails', () => {
    it('returns customer profile, associated distributor, milk collection history, and billing breakdown', async () => {
      const mockCustomer = {
        cid: 'c-100',
        name: 'Gopal Verma',
        uniqueNumber: '5',
        phoneNumber: '9123456780',
        liters: 2.0,
        price: 65,
        isActive: true,
        distributor: {
          did: 'dist-1',
          dairyName: 'Gokul Dairy',
          user: {
            uid: 'u-dist',
            name: 'Distributor Owner',
            email: 'dist@gokul.com',
            phoneNumber: '9898989898',
          },
        },
      };

      customersRepo.findOne.mockResolvedValue(mockCustomer);
      milkEntriesRepo.find.mockResolvedValue([
        {
          eid: 'e-1',
          entryDate: new Date('2026-11-01'),
          liters: 2.0,
          price: 65,
          total: 130,
        },
      ]);
      paymentEntriesRepo.find.mockResolvedValue([
        {
          pid: 'p-1',
          year: 2026,
          month: 11,
          billAmount: 130,
          receivedAmount: 100,
          receivedDate: new Date('2026-11-02'),
          note: 'Partial cash',
        },
      ]);

      const details = await distributorsService.getCustomerDetails('c-100');

      expect(details.customer.name).toBe('Gopal Verma');
      expect(details.distributor.dairyName).toBe('Gokul Dairy');
      expect(details.summary.totalLiters).toBe(2);
      expect(details.summary.totalBilled).toBe(130);
      expect(details.summary.totalPaid).toBe(100);
      expect(details.summary.outstandingBalance).toBe(30);
      expect(details.milkEntries).toHaveLength(1);
      expect(details.payments).toHaveLength(1);
      expect(details.monthlyBills).toHaveLength(1);
      expect(details.monthlyBills[0].period).toBe('2026-11');
      expect(details.monthlyBills[0].status).toBe('Partial');
    });
  });
});
