import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DistributorsService } from '../src/distributors/distributors.service.js';
import { UnauthorizedException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthService } from '../src/auth/auth.service.js';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard.js';

describe('Distributor Status & Inactivation Flow', () => {
  let distributorsService: DistributorsService;
  let mockDistributorsRepo: any;
  let mockCustomersRepo: any;
  let mockUsersRepo: any;
  let mockEm: any;

  beforeEach(() => {
    mockEm = {
      flush: vi.fn().mockResolvedValue(undefined),
    };

    mockDistributorsRepo = {
      find: vi.fn(),
      findOne: vi.fn(),
      getEntityManager: vi.fn().mockReturnValue(mockEm),
    };

    mockCustomersRepo = {
      find: vi.fn(),
      findOne: vi.fn(),
      getEntityManager: vi.fn().mockReturnValue(mockEm),
    };

    mockUsersRepo = {
      find: vi.fn(),
      findOne: vi.fn(),
      getEntityManager: vi.fn().mockReturnValue(mockEm),
    };

    const mockMilkEntriesRepo: any = {
      find: vi.fn().mockResolvedValue([]),
    };

    const mockPaymentsRepo: any = {
      find: vi.fn().mockResolvedValue([]),
    };

    distributorsService = new DistributorsService(
      mockDistributorsRepo,
      mockCustomersRepo,
      mockUsersRepo,
      mockMilkEntriesRepo,
      mockPaymentsRepo,
    );
  });

  describe('updateStatus', () => {
    it('sets distributor and all its customers to inactive when deactivated', async () => {
      const mockDistributor = {
        did: 'dist-123',
        dairyName: 'Amul Dairy',
        isActive: true,
        user: { uid: 'u-1', isActive: true },
      };

      const mockCustomers = [
        { cid: 'c-1', name: 'Ramesh', isActive: true },
        { cid: 'c-2', name: 'Suresh', isActive: true },
      ];

      mockDistributorsRepo.findOne.mockResolvedValue(mockDistributor);
      mockCustomersRepo.find.mockResolvedValue(mockCustomers);

      const result = await distributorsService.updateStatus('dist-123', false);

      expect(mockDistributor.isActive).toBe(false);
      expect(mockDistributor.user.isActive).toBe(false);
      expect(mockCustomers[0].isActive).toBe(false);
      expect(mockCustomers[1].isActive).toBe(false);
      expect(result.updatedCustomersCount).toBe(2);
      expect(result.isActive).toBe(false);
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it('throws NotFoundException for non-existent distributor', async () => {
      mockDistributorsRepo.findOne.mockResolvedValue(null);

      await expect(
        distributorsService.updateStatus('non-existent', false),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listCustomers with filters', () => {
    it('filters customers by distributorId and distributorName', async () => {
      const sampleCustomers = [
        {
          cid: 'c-1',
          uniqueNumber: '1',
          name: 'Mukesh Patel',
          phoneNumber: '9876543210',
          liters: 2.5,
          price: 60,
          notificationChannel: 'whatsapp',
          isActive: true,
          distributor: { did: 'dist-123', dairyName: 'Amul Dairy' },
        },
      ];

      mockCustomersRepo.find.mockResolvedValue(sampleCustomers);

      const res = await distributorsService.listCustomers({
        distributorId: 'dist-123',
        distributorName: 'Amul',
      });

      expect(res.length).toBe(1);
      expect(res[0].distributor.did).toBe('dist-123');
      expect(res[0].distributor.dairyName).toBe('Amul Dairy');
      expect(mockCustomersRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          distributor: expect.objectContaining({
            did: 'dist-123',
            dairyName: { $ilike: '%Amul%' },
          }),
        }),
        expect.any(Object),
      );
    });
  });
});

describe('Auth Service Inactive Distributor Protection', () => {
  let authService: AuthService;
  let mockUsersRepo: any;
  let mockDistributorsRepo: any;
  let mockJwtService: any;
  let mockMailService: any;

  beforeEach(() => {
    mockUsersRepo = {
      findOne: vi.fn(),
      create: vi.fn(),
      getEntityManager: vi.fn().mockReturnValue({
        persist: vi.fn(),
        flush: vi.fn().mockResolvedValue(undefined),
      }),
    };
    mockDistributorsRepo = {
      findOne: vi.fn(),
      create: vi.fn(),
    };
    mockJwtService = {
      sign: vi.fn().mockReturnValue('mock-jwt-token'),
    };
    mockMailService = {
      sendCode: vi.fn().mockResolvedValue(undefined),
      getDiagnostics: vi.fn().mockReturnValue({}),
    };

    authService = new AuthService(
      mockUsersRepo,
      mockDistributorsRepo,
      mockJwtService,
      mockMailService,
    );
  });

  it('blocks login if distributor is marked inactive', async () => {
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('password123', 10);

    const user = {
      uid: 'u-1',
      email: 'owner@dairy.com',
      passwordHash: hash,
      emailVerified: true,
      isActive: true,
    };
    const inactiveDistributor = {
      did: 'd-1',
      dairyName: 'Amul Center',
      isActive: false,
      user,
    };

    mockUsersRepo.findOne.mockResolvedValue(user);
    mockDistributorsRepo.findOne.mockResolvedValue(inactiveDistributor);

    await expect(
      authService.login({ email: 'owner@dairy.com', password: 'password123' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('blocks signup if attempting to register an inactive distributor email', async () => {
    const inactiveUser = {
      uid: 'u-1',
      email: 'banned@dairy.com',
      isActive: false,
    };
    const inactiveDist = {
      did: 'd-1',
      dairyName: 'Banned Dairy',
      isActive: false,
      user: inactiveUser,
    };

    mockUsersRepo.findOne.mockResolvedValue(inactiveUser);
    mockDistributorsRepo.findOne.mockResolvedValue(inactiveDist);

    await expect(
      authService.signup({
        email: 'banned@dairy.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
        dairyName: 'Banned Dairy',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('blocks profile access with 401 if user or distributor is inactive', async () => {
    const inactiveUser = {
      uid: 'u-1',
      email: 'deactivated@dairy.com',
      isActive: false,
    };
    mockUsersRepo.findOne.mockResolvedValue(inactiveUser);

    await expect(authService.profile('u-1')).rejects.toThrow(UnauthorizedException);

    const activeUser = {
      uid: 'u-2',
      email: 'active@dairy.com',
      isActive: true,
    };
    const inactiveDist = {
      did: 'd-2',
      dairyName: 'Inactive Dairy',
      isActive: false,
      user: activeUser,
    };
    mockUsersRepo.findOne.mockResolvedValue(activeUser);
    mockDistributorsRepo.findOne.mockResolvedValue(inactiveDist);

    await expect(authService.profile('u-2')).rejects.toThrow(UnauthorizedException);
  });
});

describe('JwtAuthGuard Inactive Enforcement', () => {
  let guard: JwtAuthGuard;
  let mockJwtService: any;
  let mockUsersRepo: any;
  let mockDistributorsRepo: any;

  beforeEach(() => {
    mockJwtService = {
      verify: vi.fn(),
    };
    mockUsersRepo = {
      findOne: vi.fn(),
    };
    mockDistributorsRepo = {
      findOne: vi.fn(),
    };
    guard = new JwtAuthGuard(mockJwtService, mockUsersRepo, mockDistributorsRepo);
  });

  it('rejects with 401 when user is inactive', async () => {
    mockJwtService.verify.mockReturnValue({
      sub: 'u-1',
      did: 'd-1',
      role: 'distributor',
      email: 'user@dairy.com',
    });
    mockUsersRepo.findOne.mockResolvedValue({
      uid: 'u-1',
      isActive: false,
    });

    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization: 'Bearer mock-token' },
        }),
      }),
    } as any;

    await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects with 401 when distributor is inactive', async () => {
    mockJwtService.verify.mockReturnValue({
      sub: 'u-1',
      did: 'd-1',
      role: 'distributor',
      email: 'user@dairy.com',
    });
    mockUsersRepo.findOne.mockResolvedValue({
      uid: 'u-1',
      isActive: true,
      role: 'distributor',
    });
    mockDistributorsRepo.findOne.mockResolvedValue({
      did: 'd-1',
      isActive: false,
    });

    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization: 'Bearer mock-token' },
        }),
      }),
    } as any;

    await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
  });

  it('allows access when user and distributor are both active', async () => {
    mockJwtService.verify.mockReturnValue({
      sub: 'u-1',
      did: 'd-1',
      role: 'distributor',
      email: 'user@dairy.com',
    });
    mockUsersRepo.findOne.mockResolvedValue({
      uid: 'u-1',
      isActive: true,
      role: 'distributor',
    });
    mockDistributorsRepo.findOne.mockResolvedValue({
      did: 'd-1',
      isActive: true,
    });

    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization: 'Bearer mock-token' },
        }),
      }),
    } as any;

    const result = await guard.canActivate(mockContext);
    expect(result).toBe(true);
  });
});
