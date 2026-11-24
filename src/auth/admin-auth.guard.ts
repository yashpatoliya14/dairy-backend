import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AuthenticatedUser } from './auth.types.js';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
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

    return true;
  }
}
