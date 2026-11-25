import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import type { Request } from 'express';
import type { AuthenticatedUser } from './auth.types.js';
import { User } from '../entities/user.entity.js';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(User)
    private readonly users?: EntityRepository<User>,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer token required');
    }

    let user: AuthenticatedUser;
    try {
      user = this.jwtService.verify<AuthenticatedUser>(
        header.slice('Bearer '.length),
      );
      request.user = user;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const role = (user.role || '').toLowerCase();
    if (role !== 'admin' && role !== 'super_admin') {
      throw new ForbiddenException(
        'Access denied. This endpoint is restricted to authorized administrators.',
      );
    }

    if (this.users) {
      return this.validateUserActive(user.sub);
    }

    return true;
  }

  private async validateUserActive(uid: string): Promise<boolean> {
    const dbUser = await this.users!.findOne({ uid });
    if (!dbUser || dbUser.isActive === false) {
      throw new UnauthorizedException(
        'Your administrator account has been deactivated. Please contact support.',
      );
    }
    return true;
  }
}
