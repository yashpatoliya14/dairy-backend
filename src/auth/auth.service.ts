import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { Distributor } from '../entities/distributor.entity.js';
import { User, UserRole } from '../entities/user.entity.js';
import { LoginDto } from './dto/login.dto.js';
import { SignupDto } from './dto/signup.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { ResendVerificationDto } from './dto/resend-verification.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { MailService } from './mail.service.js';
import { createHash, randomInt } from 'node:crypto';
import {
  getPhoneSearchVariants,
  isPhoneNumber,
  isValidEmail,
  normalizePhone,
} from './auth.utils.js';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly users: EntityRepository<User>,
    @InjectRepository(Distributor)
    private readonly distributors: EntityRepository<Distributor>,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async signup(dto: SignupDto) {
    const rawEmail = dto.email?.trim() ?? '';
    const email = rawEmail.toLowerCase();
    if (!isValidEmail(email)) {
      throw new BadRequestException('Please enter a valid email address');
    }

    if (await this.users.findOne({ email })) {
      throw new ConflictException('Email is already registered');
    }

    let normalizedPhone: string | undefined = undefined;
    if (dto.phoneNumber) {
      const rawPhone = dto.phoneNumber.trim();
      if (!isPhoneNumber(rawPhone)) {
        throw new BadRequestException(
          'Please enter a valid 10-15 digit mobile number',
        );
      }
      normalizedPhone = normalizePhone(rawPhone);
      const existingPhoneUser = await this.users.findOne({
        phoneNumber: { $in: getPhoneSearchVariants(rawPhone) },
      });
      if (existingPhoneUser) {
        throw new ConflictException('Mobile number is already registered');
      }
    }

    const user = this.users.create({
      uid: randomUUID(),
      email,
      passwordHash: await bcrypt.hash(dto.password, 12),
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      name: `${dto.firstName.trim()} ${dto.lastName.trim()}`,
      phoneNumber: normalizedPhone,
      emailVerified: false,
      role: UserRole.DISTRIBUTOR,
    });
    const distributor = this.distributors.create({
      did: randomUUID(),
      dairyName: dto.dairyName.trim(),
      user,
    });
    const em = this.users.getEntityManager();
    const code = this.createCode();
    user.verificationCodeHash = this.hashCode(code);
    user.verificationExpiresAt = this.expiresAt();
    em.persist([user, distributor]);
    await em.flush();
    await this.mailService.sendCode(email, code, 'verify');
    return { message: 'Verification code sent to your email' };
  }

  async login(dto: LoginDto) {
    const rawIdentifier = (dto.email ?? '').trim();
    if (!rawIdentifier) {
      throw new BadRequestException('Email address or mobile number is required');
    }

    let user: User | null = null;
    const isEmailInput = rawIdentifier.includes('@');

    if (isEmailInput) {
      const email = rawIdentifier.toLowerCase();
      if (!isValidEmail(email)) {
        throw new BadRequestException('Please enter a valid email address');
      }
      user = await this.users.findOne({ email });
      if (!user) {
        throw new UnauthorizedException('No account found with this email');
      }
    } else if (isPhoneNumber(rawIdentifier)) {
      const variants = getPhoneSearchVariants(rawIdentifier);
      user = await this.users.findOne({
        phoneNumber: { $in: variants },
      });
      if (!user) {
        throw new UnauthorizedException(
          'No account found with this mobile number',
        );
      }
    } else {
      throw new BadRequestException(
        'Please enter a valid email address or 10-digit mobile number',
      );
    }

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (isEmailInput && !user.emailVerified) {
      throw new UnauthorizedException(
        'Please verify your email before logging in',
      );
    }

    const distributor = await this.distributors.findOne({ user });
    if (!distributor) {
      throw new UnauthorizedException('Distributor account is not configured');
    }

    return this.issueToken(user, distributor);
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const rawEmail = dto.email?.trim() ?? '';
    const email = rawEmail.toLowerCase();
    if (!isValidEmail(email)) {
      throw new BadRequestException('Please enter a valid email address');
    }

    const user = await this.users.findOne({ email });
    if (
      !user ||
      !user.verificationCodeHash ||
      !user.verificationExpiresAt ||
      user.verificationExpiresAt < new Date() ||
      user.verificationCodeHash !== this.hashCode(dto.code)
    ) {
      throw new UnauthorizedException('Invalid or expired verification code');
    }

    user.emailVerified = true;
    user.verificationCodeHash = undefined;
    user.verificationExpiresAt = undefined;
    await this.users.getEntityManager().flush();
    const distributor = await this.distributors.findOne({ user });
    if (!distributor)
      throw new UnauthorizedException('Distributor account is not configured');
    return this.issueToken(user, distributor);
  }

  async resendVerification(dto: ResendVerificationDto) {
    const rawEmail = dto.email?.trim() ?? '';
    const email = rawEmail.toLowerCase();
    if (!isValidEmail(email)) {
      throw new BadRequestException('Please enter a valid email address');
    }

    const user = await this.users.findOne({ email });
    if (!user || user.emailVerified) {
      return { message: 'If the account needs verification, a code was sent' };
    }
    const code = this.createCode();
    user.verificationCodeHash = this.hashCode(code);
    user.verificationExpiresAt = this.expiresAt();
    await this.users.getEntityManager().flush();
    await this.mailService.sendCode(email, code, 'verify');
    return { message: 'Verification code sent to your email' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const rawEmail = dto.email?.trim() ?? '';
    const email = rawEmail.toLowerCase();
    if (!isValidEmail(email)) {
      throw new BadRequestException('Please enter a valid email address');
    }

    const user = await this.users.findOne({ email });
    if (user) {
      const code = this.createCode();
      user.resetCodeHash = this.hashCode(code);
      user.resetExpiresAt = this.expiresAt();
      await this.users.getEntityManager().flush();
      await this.mailService.sendCode(email, code, 'reset');
    }
    return { message: 'If that email is registered, a reset code was sent' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const rawEmail = dto.email?.trim() ?? '';
    const email = rawEmail.toLowerCase();
    if (!isValidEmail(email)) {
      throw new BadRequestException('Please enter a valid email address');
    }

    const user = await this.users.findOne({ email });
    if (
      !user ||
      !user.resetCodeHash ||
      !user.resetExpiresAt ||
      user.resetExpiresAt < new Date() ||
      user.resetCodeHash !== this.hashCode(dto.code)
    ) {
      throw new UnauthorizedException('Invalid or expired reset code');
    }
    user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    user.resetCodeHash = undefined;
    user.resetExpiresAt = undefined;
    await this.users.getEntityManager().flush();
    return { message: 'Password reset successfully' };
  }

  async profile(uid: string) {
    const user = await this.users.findOne({ uid });
    if (!user) throw new UnauthorizedException('User account not found');
    const distributor = await this.distributors.findOne({ user });
    if (!distributor) {
      throw new UnauthorizedException('Distributor account is not configured');
    }
    return {
      id: user.uid,
      name: `${user.firstName} ${user.lastName}`.trim(),
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber ?? null,
      dairyName: distributor.dairyName,
    };
  }

  async updateProfile(uid: string, dto: UpdateProfileDto) {
    const user = await this.users.findOne({ uid });
    if (!user) throw new UnauthorizedException('User account not found');
    const distributor = await this.distributors.findOne({ user });
    if (!distributor) {
      throw new UnauthorizedException('Distributor account is not configured');
    }

    if (dto.firstName !== undefined) {
      user.firstName = dto.firstName.trim();
    }
    if (dto.lastName !== undefined) {
      user.lastName = dto.lastName.trim();
    }
    if (dto.firstName !== undefined || dto.lastName !== undefined) {
      user.name = `${user.firstName} ${user.lastName}`.trim();
    }
    if (dto.phoneNumber !== undefined) {
      const rawPhone = dto.phoneNumber.trim();
      if (rawPhone.length > 0) {
        if (!isPhoneNumber(rawPhone)) {
          throw new BadRequestException(
            'Please enter a valid 10-15 digit mobile number',
          );
        }
        const normalized = normalizePhone(rawPhone);
        const existing = await this.users.findOne({
          phoneNumber: { $in: getPhoneSearchVariants(rawPhone) },
          uid: { $ne: uid },
        });
        if (existing) {
          throw new ConflictException(
            'This mobile number is already in use by another account',
          );
        }
        user.phoneNumber = normalized;
      } else {
        user.phoneNumber = undefined;
      }
    }
    if (dto.dairyName !== undefined && dto.dairyName.trim().length > 0) {
      distributor.dairyName = dto.dairyName.trim();
    }

    await this.users.getEntityManager().flush();

    return {
      id: user.uid,
      name: `${user.firstName} ${user.lastName}`.trim(),
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber ?? null,
      dairyName: distributor.dairyName,
    };
  }

  async changePassword(uid: string, dto: ChangePasswordDto) {
    const user = await this.users.findOne({ uid });
    if (
      !user ||
      !(await bcrypt.compare(dto.currentPassword, user.passwordHash))
    ) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.users.getEntityManager().flush();
    return { message: 'Password changed successfully' };
  }

  private issueToken(user: User, distributor: Distributor) {
    const payload = { sub: user.uid, did: distributor.did, email: user.email };
    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.uid,
        email: user.email,
        phoneNumber: user.phoneNumber ?? null,
        dairyName: distributor.dairyName,
      },
    };
  }

  private createCode() {
    return randomInt(100000, 1000000).toString();
  }

  private hashCode(code: string) {
    return createHash('sha256').update(code).digest('hex');
  }

  private expiresAt() {
    return new Date(Date.now() + 15 * 60 * 1000);
  }
}
