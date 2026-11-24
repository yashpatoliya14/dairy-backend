import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../src/auth/auth.service.js';
import { User, UserRole } from '../src/entities/user.entity.js';
import { Distributor } from '../src/entities/distributor.entity.js';
import { AdminAuthGuard } from '../src/auth/admin-auth.guard.js';
import bcrypt from 'bcrypt';

describe('Admin Authentication & Role Separation', () => {
  let authService: AuthService;
  let usersRepo: any;
  let distributorsRepo: any;
  let jwtService: any;
  let mailService: any;

  beforeEach(() => {
    usersRepo = {
      findOne: vi.fn(),
      create: vi.fn(),
      getEntityManager: vi.fn().mockReturnValue({
        flush: vi.fn(),
        persist: vi.fn(),
      }),
    };
    distributorsRepo = {
      findOne: vi.fn(),
      create: vi.fn(),
    };
    jwtService = {
      sign: vi.fn().mockReturnValue('mock-jwt-token'),
      verify: vi.fn(),
    };
    mailService = {
      sendCode: vi.fn().mockResolvedValue(true),
      getDiagnostics: vi.fn().mockReturnValue({}),
    };

    authService = new AuthService(
      usersRepo,
      distributorsRepo,
      jwtService,
      mailService,
    );
  });

  describe('adminLogin', () => {
    it('allows login for authorized ADMIN users', async () => {
      const passwordHash = await bcrypt.hash('AdminPass123!', 10);
      const adminUser = {
        uid: 'admin-uuid-1',
        email: 'hareshsambad426@gmail.com',
        firstName: 'Haresh',
        lastName: 'Sambad',
        name: 'Haresh Sambad',
        passwordHash,
        role: UserRole.ADMIN,
        isActive: true,
      } as User;

      usersRepo.findOne.mockResolvedValue(adminUser);

      const result = await authService.adminLogin({
        email: 'hareshsambad426@gmail.com',
        password: 'AdminPass123!',
      });

      expect(result).toBeDefined();
      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user.email).toBe('hareshsambad426@gmail.com');
      expect(result.user.role).toBe(UserRole.ADMIN);
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'admin-uuid-1',
        email: 'hareshsambad426@gmail.com',
        role: UserRole.ADMIN,
      });
    });

    it('allows login for platform owner friend Yes Patodia (SUPER_ADMIN / ADMIN)', async () => {
      const passwordHash = await bcrypt.hash('YashPass123!', 10);
      const yashAdmin = {
        uid: 'yash-uuid-2',
        email: 'yashpatoliya14@gmail.com',
        firstName: 'Yash',
        lastName: 'Patolia',
        name: 'Yash Patolia',
        passwordHash,
        role: UserRole.ADMIN,
        isActive: true,
      } as User;

      usersRepo.findOne.mockResolvedValue(yashAdmin);

      const result = await authService.adminLogin({
        email: 'yashpatoliya14@gmail.com',
        password: 'YashPass123!',
      });

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user.role).toBe(UserRole.ADMIN);
    });

    it('DENIES access when a DISTRIBUTOR attempts to log in via admin login', async () => {
      const passwordHash = await bcrypt.hash('DistributorPass123!', 10);
      const distUser = {
        uid: 'dist-uuid-1',
        email: 'distributor@dairy.com',
        firstName: 'Dairy',
        lastName: 'Distributor',
        passwordHash,
        role: UserRole.DISTRIBUTOR,
        isActive: true,
      } as User;

      usersRepo.findOne.mockResolvedValue(distUser);

      await expect(
        authService.adminLogin({
          email: 'distributor@dairy.com',
          password: 'DistributorPass123!',
        }),
      ).rejects.toThrow(
        new ForbiddenException(
          'Access denied. This application is restricted to authorized administrators.',
        ),
      );
    });

    it('fails when invalid credentials are provided', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      await expect(
        authService.adminLogin({
          email: 'nonexistent@example.com',
          password: 'WrongPassword',
        }),
      ).rejects.toThrow(
        new UnauthorizedException(
          'Invalid email or password. Please try again.',
        ),
      );
    });
  });

  describe('distributor login (/auth/login)', () => {
    it('rejects ADMIN credentials from accessing the distributor application', async () => {
      const passwordHash = await bcrypt.hash('AdminPass123!', 10);
      const adminUser = {
        uid: 'admin-uuid-1',
        email: 'hareshsambad426@gmail.com',
        passwordHash,
        role: UserRole.ADMIN,
        isActive: true,
        emailVerified: true,
      } as User;

      usersRepo.findOne.mockResolvedValue(adminUser);

      await expect(
        authService.login({
          email: 'hareshsambad426@gmail.com',
          password: 'AdminPass123!',
        }),
      ).rejects.toThrow(
        new ForbiddenException(
          'Admin credentials cannot access the distributor application. Please use the Admin Panel.',
        ),
      );
    });

    it('allows valid DISTRIBUTOR users to log in', async () => {
      const passwordHash = await bcrypt.hash('DistPass123!', 10);
      const distUser = {
        uid: 'dist-uuid-1',
        email: 'distributor@dairy.com',
        passwordHash,
        role: UserRole.DISTRIBUTOR,
        isActive: true,
        emailVerified: true,
      } as User;

      const mockDistributor = {
        did: 'dist-did-1',
        dairyName: 'Fresh Milk Dairy',
        isActive: true,
        user: distUser,
      } as Distributor;

      usersRepo.findOne.mockResolvedValue(distUser);
      distributorsRepo.findOne.mockResolvedValue(mockDistributor);

      const result = await authService.login({
        email: 'distributor@dairy.com',
        password: 'DistPass123!',
      });

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user.email).toBe('distributor@dairy.com');
      expect(result.user.dairyName).toBe('Fresh Milk Dairy');
    });
  });

  describe('AdminAuthGuard', () => {
    let guard: AdminAuthGuard;

    beforeEach(() => {
      guard = new AdminAuthGuard(jwtService);
    });

    it('allows access for verified ADMIN token', () => {
      jwtService.verify.mockReturnValue({
        sub: 'admin-uuid-1',
        email: 'hareshsambad426@gmail.com',
        role: 'admin',
      });

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: 'Bearer valid-admin-token' },
          }),
        }),
      } as any;

      expect(guard.canActivate(mockContext)).toBe(true);
    });

    it('blocks access (403) for DISTRIBUTOR token', () => {
      jwtService.verify.mockReturnValue({
        sub: 'dist-uuid-1',
        email: 'distributor@dairy.com',
        role: 'distributor',
      });

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: 'Bearer valid-dist-token' },
          }),
        }),
      } as any;

      expect(() => guard.canActivate(mockContext)).toThrow(
        new ForbiddenException(
          'Access denied. This endpoint is restricted to authorized administrators.',
        ),
      );
    });

    it('blocks access (401) when no authorization header is present', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {},
          }),
        }),
      } as any;

      expect(() => guard.canActivate(mockContext)).toThrow(
        new UnauthorizedException('Bearer token required'),
      );
    });

    it('blocks access (401) when token is invalid or expired', () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: 'Bearer expired-token' },
          }),
        }),
      } as any;

      expect(() => guard.canActivate(mockContext)).toThrow(
        new UnauthorizedException('Invalid or expired token'),
      );
    });
  });
});
