import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ForbiddenException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { AuthService } from '../src/auth/auth.service.js';
import { DistributorsService } from '../src/distributors/distributors.service.js';
import { CustomersService } from '../src/customers/customers.service.js';
import { AdminAuthGuard } from '../src/auth/admin-auth.guard.js';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard.js';
import { User, UserRole } from '../src/entities/user.entity.js';
import { Distributor } from '../src/entities/distributor.entity.js';
import { Customer } from '../src/entities/customer.entity.js';
import bcrypt from 'bcrypt';

describe('Mandatory Testing Scenarios: Admin & Distributor Separation', () => {
  let authService: AuthService;
  let distributorsService: DistributorsService;
  let customersService: CustomersService;
  let adminGuard: AdminAuthGuard;
  let jwtGuard: JwtAuthGuard;

  let usersRepo: any;
  let distributorsRepo: any;
  let customersRepo: any;
  let milkEntriesRepo: any;
  let paymentEntriesRepo: any;
  let jwtService: any;
  let mailService: any;
  let settingsService: any;
  let whatsappService: any;

  // Stored password hash for tests
  let adminPasswordHash: string;
  let yashPasswordHash: string;
  let distributorPasswordHash: string;

  beforeEach(async () => {
    adminPasswordHash = await bcrypt.hash('AdminSecret123!', 10);
    yashPasswordHash = await bcrypt.hash('YashSecret123!', 10);
    distributorPasswordHash = await bcrypt.hash('DistributorSecret123!', 10);

    const mockEm = {
      flush: vi.fn().mockResolvedValue(undefined),
      persist: vi.fn(),
      remove: vi.fn(),
    };

    usersRepo = {
      findOne: vi.fn(),
      find: vi.fn(),
      create: vi.fn(),
      getEntityManager: vi.fn().mockReturnValue(mockEm),
    };

    distributorsRepo = {
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      getEntityManager: vi.fn().mockReturnValue(mockEm),
    };

    customersRepo = {
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      getEntityManager: vi.fn().mockReturnValue(mockEm),
    };

    milkEntriesRepo = {
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      getEntityManager: vi.fn().mockReturnValue(mockEm),
    };

    paymentEntriesRepo = {
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      getEntityManager: vi.fn().mockReturnValue(mockEm),
    };

    jwtService = {
      sign: vi.fn().mockImplementation((payload) => `signed-jwt-${payload.sub}-${payload.role}`),
      verify: vi.fn(),
    };

    mailService = {
      sendCode: vi.fn().mockResolvedValue(true),
      getDiagnostics: vi.fn().mockReturnValue({}),
    };

    settingsService = {
      get: vi.fn().mockResolvedValue({ defaultPrice: 60, defaultLiters: 1.5 }),
      valuesFor: vi.fn().mockResolvedValue({ defaultPrice: 60, defaultLiters: 1.5 }),
    };

    whatsappService = {
      getDailySummary: vi.fn().mockResolvedValue({ totalCustomers: 5 }),
    };

    authService = new AuthService(usersRepo, distributorsRepo, jwtService, mailService);
    distributorsService = new DistributorsService(
      distributorsRepo,
      customersRepo,
      usersRepo,
      milkEntriesRepo,
      paymentEntriesRepo,
    );
    customersService = new CustomersService(
      customersRepo,
      distributorsRepo,
      usersRepo,
      milkEntriesRepo,
      paymentEntriesRepo,
      settingsService,
      whatsappService,
    );

    adminGuard = new AdminAuthGuard(jwtService);
    jwtGuard = new JwtAuthGuard(jwtService);
  });

  // Scenario 1: Admin login with valid admin credentials
  it('Scenario 1: Admin login with valid admin credentials -> SUCCESS', async () => {
    const adminUser = {
      uid: 'admin-owner-uid',
      email: 'hareshsambad426@gmail.com',
      firstName: 'Haresh',
      lastName: 'Sambad',
      name: 'Haresh Sambad',
      passwordHash: adminPasswordHash,
      role: UserRole.ADMIN,
      isActive: true,
    } as User;

    usersRepo.findOne.mockResolvedValue(adminUser);

    const res = await authService.adminLogin({
      email: 'hareshsambad426@gmail.com',
      password: 'AdminSecret123!',
    });

    expect(res).toBeDefined();
    expect(res.accessToken).toContain('signed-jwt-admin-owner-uid-admin');
    expect(res.user.email).toBe('hareshsambad426@gmail.com');
    expect(res.user.role).toBe(UserRole.ADMIN);
  });

  // Scenario 2: Friend's admin login with valid credentials
  it("Scenario 2: Friend's admin login with valid credentials (Yes Patodia) -> SUCCESS", async () => {
    const yashUser = {
      uid: 'yash-owner-uid',
      email: 'yashpatoliya14@gmail.com',
      firstName: 'Yash',
      lastName: 'Patolia',
      name: 'Yash Patolia',
      passwordHash: yashPasswordHash,
      role: UserRole.ADMIN,
      isActive: true,
    } as User;

    usersRepo.findOne.mockResolvedValue(yashUser);

    const res = await authService.adminLogin({
      email: 'yashpatoliya14@gmail.com',
      password: 'YashSecret123!',
    });

    expect(res).toBeDefined();
    expect(res.accessToken).toContain('signed-jwt-yash-owner-uid-admin');
    expect(res.user.email).toBe('yashpatoliya14@gmail.com');
    expect(res.user.role).toBe(UserRole.ADMIN);
  });

  // Scenario 3: Distributor login through Admin Panel
  it('Scenario 3: Distributor login through Admin Panel -> ACCESS DENIED', async () => {
    const distUser = {
      uid: 'dist-uid-1',
      email: 'miteshsambad426@gmail.com',
      firstName: 'Mitesh',
      lastName: 'Sambad',
      passwordHash: distributorPasswordHash,
      role: UserRole.DISTRIBUTOR,
      isActive: true,
    } as User;

    usersRepo.findOne.mockResolvedValue(distUser);

    await expect(
      authService.adminLogin({
        email: 'miteshsambad426@gmail.com',
        password: 'DistributorSecret123!',
      }),
    ).rejects.toThrow(
      new ForbiddenException(
        'Access denied. This application is restricted to authorized administrators.',
      ),
    );
  });

  // Scenario 4: Invalid credentials through Admin Panel
  it('Scenario 4: Invalid credentials through Admin Panel -> LOGIN FAILED', async () => {
    usersRepo.findOne.mockResolvedValue(null);

    await expect(
      authService.adminLogin({
        email: 'nonexistent@dairy.com',
        password: 'RandomPassword123',
      }),
    ).rejects.toThrow(
      new UnauthorizedException(
        'Invalid email or password. Please try again.',
      ),
    );
  });

  // Scenario 5: Distributor directly opens /admin/dashboard
  it('Scenario 5: Distributor directly opens /admin/dashboard -> ACCESS DENIED', () => {
    jwtService.verify.mockReturnValue({
      sub: 'dist-uid-1',
      email: 'distributor@dairy.com',
      role: 'distributor',
    });

    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization: 'Bearer dist-token' },
        }),
      }),
    } as any;

    expect(() => adminGuard.canActivate(mockContext)).toThrow(
      new ForbiddenException(
        'Access denied. This endpoint is restricted to authorized administrators.',
      ),
    );
  });

  // Scenario 6: Distributor calls admin API directly
  it('Scenario 6: Distributor calls admin API directly -> HTTP 403 Forbidden', () => {
    jwtService.verify.mockReturnValue({
      sub: 'dist-uid-1',
      email: 'distributor@dairy.com',
      role: 'distributor',
      did: 'dist-did-1',
    });

    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization: 'Bearer dist-token' },
          url: '/distributors/stats',
        }),
      }),
    } as any;

    expect(() => adminGuard.canActivate(mockContext)).toThrow(
      new ForbiddenException(
        'Access denied. This endpoint is restricted to authorized administrators.',
      ),
    );
  });

  // Scenario 7: Unauthenticated user opens admin route
  it('Scenario 7: Unauthenticated user opens admin route -> Redirect to admin login / HTTP 401', () => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {}, // No Bearer token
          url: '/distributors',
        }),
      }),
    } as any;

    expect(() => adminGuard.canActivate(mockContext)).toThrow(
      new UnauthorizedException('Bearer token required'),
    );
  });

  // Scenario 8: Distributor logs into Distributor Application
  it('Scenario 8: Distributor logs into Distributor Application -> SUCCESS', async () => {
    const distUser = {
      uid: 'dist-uid-1',
      email: 'miteshsambad426@gmail.com',
      firstName: 'Mitesh',
      lastName: 'Sambad',
      passwordHash: distributorPasswordHash,
      role: UserRole.DISTRIBUTOR,
      isActive: true,
      emailVerified: true,
    } as User;

    const distRecord = {
      did: 'dist-did-1',
      dairyName: 'Khodiyar Dairy',
      isActive: true,
      user: distUser,
    } as Distributor;

    usersRepo.findOne.mockResolvedValue(distUser);
    distributorsRepo.findOne.mockResolvedValue(distRecord);

    const res = await authService.login({
      email: 'miteshsambad426@gmail.com',
      password: 'DistributorSecret123!',
    });

    expect(res).toBeDefined();
    expect(res.accessToken).toContain('signed-jwt-dist-uid-1-distributor');
    expect(res.user.dairyName).toBe('Khodiyar Dairy');
    expect(res.user.role).toBe(UserRole.DISTRIBUTOR);
  });

  // Scenario 9: Distributor accesses their own customers
  it('Scenario 9: Distributor accesses their own customers -> SUCCESS', async () => {
    const distUser = {
      uid: 'dist-user-1',
      role: UserRole.DISTRIBUTOR,
    } as User;

    const distRecord = {
      did: 'dist-did-1',
      dairyName: 'Khodiyar Dairy',
      user: distUser,
    } as Distributor;

    const myCustomers = [
      { cid: 'cust-1', name: 'Ramesh', uniqueNumber: '1', liters: 2.0, price: 60, distributor: distRecord },
      { cid: 'cust-2', name: 'Suresh', uniqueNumber: '2', liters: 1.0, price: 60, distributor: distRecord },
    ] as Customer[];

    usersRepo.findOne.mockResolvedValue(distUser);
    distributorsRepo.findOne.mockResolvedValue(distRecord);
    customersRepo.find.mockResolvedValue(myCustomers);

    const list = await customersService.list('dist-user-1');

    expect(list).toHaveLength(2);
    expect(list[0].name).toBe('Ramesh');
    expect(list[1].name).toBe('Suresh');
  });

  // Scenario 10: Distributor accesses another distributor's customers
  it("Scenario 10: Distributor accesses another distributor's customers -> ACCESS DENIED", async () => {
    const distUser1 = { uid: 'dist-user-1', role: UserRole.DISTRIBUTOR } as User;
    const distRecord1 = { did: 'dist-did-1', dairyName: 'Dairy 1', user: distUser1 } as Distributor;

    usersRepo.findOne.mockResolvedValue(distUser1);
    distributorsRepo.findOne.mockResolvedValue(distRecord1);

    // Customer belongs to dist-did-2, so customers.findOne scoped to distributor returns null
    customersRepo.findOne.mockResolvedValue(null);

    await expect(
      customersService.listEntries('dist-user-1', 'other-dist-cust-id'),
    ).rejects.toThrow(new NotFoundException('Customer not found'));
  });

  // Scenario 11: Admin views distributor list
  it('Scenario 11: Admin views distributor list -> SUCCESS', async () => {
    const distList = [
      {
        did: 'did-1',
        dairyName: 'Haresh Dairy',
        isActive: true,
        user: { uid: 'u-1', name: 'Haresh', email: 'haresh@dairy.com', phoneNumber: '9100000000', isActive: true },
      },
      {
        did: 'did-2',
        dairyName: 'Yash Dairy',
        isActive: true,
        user: { uid: 'u-2', name: 'Yash', email: 'yash@dairy.com', phoneNumber: '9200000000', isActive: true },
      },
    ];

    distributorsRepo.find.mockResolvedValue(distList);
    customersRepo.find.mockResolvedValue([
      { cid: 'c-1', distributor: 'did-1', isActive: true },
      { cid: 'c-2', distributor: 'did-2', isActive: true },
    ]);

    const result = await distributorsService.listDistributors();

    expect(result).toHaveLength(2);
    expect(result[0].dairyName).toBe('Haresh Dairy');
    expect(result[1].dairyName).toBe('Yash Dairy');
    expect(result[0].customerCount).toBe(1);
  });

  // Scenario 12: Admin opens distributor details
  it('Scenario 12: Admin opens distributor details -> SUCCESS', async () => {
    const mockDistributor = {
      did: 'did-1',
      dairyName: 'Haresh Dairy',
      isActive: true,
      createdAt: new Date('2026-01-01'),
      user: {
        uid: 'u-1',
        name: 'Haresh',
        email: 'haresh@dairy.com',
        phoneNumber: '9100000000',
        isActive: true,
      },
    };

    distributorsRepo.findOne.mockResolvedValue(mockDistributor);
    customersRepo.find.mockResolvedValue([
      { cid: 'c-1', name: 'Customer A', uniqueNumber: '1', liters: 2, price: 60, isActive: true },
    ]);
    milkEntriesRepo.find.mockResolvedValue([
      { eid: 'e-1', liters: 15, total: 900 },
    ]);
    paymentEntriesRepo.find.mockResolvedValue([
      { pid: 'p-1', receivedAmount: 500 },
    ]);

    const res = await distributorsService.getDistributorDetails('did-1');

    expect(res).toBeDefined();
    expect(res.distributor.dairyName).toBe('Haresh Dairy');
    expect(res.overview.totalCustomers).toBe(1);
    expect(res.overview.totalMilkLiters).toBe(15);
    expect(res.overview.totalMilkAmount).toBe(900);
    expect(res.overview.totalPaymentsReceived).toBe(500);
    expect(res.overview.outstandingBalance).toBe(400);
    expect(res.customers).toHaveLength(1);
  });

  // Scenario 13: Admin views distributor's customers
  it("Scenario 13: Admin views distributor's customers -> SUCCESS", async () => {
    customersRepo.find.mockResolvedValue([
      {
        cid: 'c-1',
        uniqueNumber: '1',
        name: 'Ramesh Patel',
        phoneNumber: '9876543210',
        liters: 2.5,
        price: 60,
        notificationChannel: 'whatsapp',
        isActive: true,
        distributor: { did: 'did-1', dairyName: 'Haresh Dairy' },
      },
    ]);

    const res = await distributorsService.listCustomers({ distributorId: 'did-1' });

    expect(res).toHaveLength(1);
    expect(res[0].name).toBe('Ramesh Patel');
    expect(res[0].distributor.dairyName).toBe('Haresh Dairy');
  });

  // Scenario 14: Admin opens customer milk history
  it('Scenario 14: Admin opens customer milk history -> SUCCESS', async () => {
    const mockCustomer = {
      cid: 'cid-1',
      name: 'Mukesh Bhai',
      uniqueNumber: '3',
      phoneNumber: '9898000000',
      liters: 2.0,
      price: 65,
      isActive: true,
      distributor: {
        did: 'did-1',
        dairyName: 'Haresh Dairy',
        user: { uid: 'u-1', name: 'Haresh', email: 'haresh@dairy.com' },
      },
    };

    customersRepo.findOne.mockResolvedValue(mockCustomer);
    milkEntriesRepo.find.mockResolvedValue([
      { eid: 'e-1', entryDate: new Date('2026-11-20'), liters: 2, price: 65, total: 130 },
      { eid: 'e-2', entryDate: new Date('2026-11-21'), liters: 2, price: 65, total: 130 },
    ]);
    paymentEntriesRepo.find.mockResolvedValue([]);

    const details = await distributorsService.getCustomerDetails('cid-1');

    expect(details.milkEntries).toHaveLength(2);
    expect(details.milkEntries[0].liters).toBe(2);
    expect(details.summary.totalLiters).toBe(4);
    expect(details.summary.totalBilled).toBe(260);
  });

  // Scenario 15: Admin views customer bills
  it('Scenario 15: Admin views customer bills -> SUCCESS', async () => {
    const mockCustomer = {
      cid: 'cid-1',
      name: 'Mukesh Bhai',
      uniqueNumber: '3',
      phoneNumber: '9898000000',
      liters: 2.0,
      price: 65,
      isActive: true,
      distributor: {
        did: 'did-1',
        dairyName: 'Haresh Dairy',
        user: { uid: 'u-1', name: 'Haresh', email: 'haresh@dairy.com' },
      },
    };

    customersRepo.findOne.mockResolvedValue(mockCustomer);
    milkEntriesRepo.find.mockResolvedValue([
      { eid: 'e-1', entryDate: new Date('2026-11-05'), liters: 10, price: 60, total: 600 },
    ]);
    paymentEntriesRepo.find.mockResolvedValue([
      { pid: 'p-1', year: 2026, month: 11, billAmount: 600, receivedAmount: 600, receivedDate: new Date('2026-11-06') },
    ]);

    const details = await distributorsService.getCustomerDetails('cid-1');

    expect(details.monthlyBills).toHaveLength(1);
    expect(details.monthlyBills[0].period).toBe('2026-11');
    expect(details.monthlyBills[0].billedAmount).toBe(600);
    expect(details.monthlyBills[0].paidAmount).toBe(600);
    expect(details.monthlyBills[0].status).toBe('Paid');
  });

  // Scenario 16: Admin views transactions
  it('Scenario 16: Admin views transactions -> SUCCESS', async () => {
    paymentEntriesRepo.find.mockResolvedValue([
      {
        pid: 'pay-1',
        year: 2026,
        month: 11,
        billAmount: 600,
        receivedAmount: 600,
        note: 'UPI Payment',
        receivedDate: new Date('2026-11-15'),
        createdAt: new Date('2026-11-15T10:00:00Z'),
        customer: { cid: 'c-1', name: 'Kishan Patel', uniqueNumber: '1', phoneNumber: '9870000000' },
        distributor: { did: 'd-1', dairyName: 'Amul Dairy' },
      },
    ]);

    const res = await distributorsService.getTransactions();

    expect(res).toBeDefined();
    expect(res.summary.totalTransactions).toBe(1);
    expect(res.summary.totalReceivedAmount).toBe(600);
    expect(res.transactions).toHaveLength(1);
    expect(res.transactions[0].customer.name).toBe('Kishan Patel');
    expect(res.transactions[0].distributor.dairyName).toBe('Amul Dairy');
  });

  // Scenario 17: Expired admin token
  it('Scenario 17: Expired admin token -> Authentication required (HTTP 401)', () => {
    jwtService.verify.mockImplementation(() => {
      throw new Error('jwt expired');
    });

    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization: 'Bearer expired-admin-token' },
          url: '/distributors/stats',
        }),
      }),
    } as any;

    expect(() => adminGuard.canActivate(mockContext)).toThrow(
      new UnauthorizedException('Invalid or expired token'),
    );
  });
});
