import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import type { Request } from 'express';
import type { AuthenticatedUser } from './auth.types.js';
import { User, UserRole } from '../entities/user.entity.js';
import { Distributor } from '../entities/distributor.entity.js';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(User)
    private readonly users?: EntityRepository<User>,
    @InjectRepository(Distributor)
    private readonly distributors?: EntityRepository<Distributor>,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer token required');
    }

    let payload: AuthenticatedUser;
    try {
      payload = this.jwtService.verify<AuthenticatedUser>(
        header.slice('Bearer '.length),
      );
      request.user = payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (this.users) {
      return this.validateActive(payload);
    }

    return true;
  }

  private async validateActive(payload: AuthenticatedUser): Promise<boolean> {
    const user = await this.users!.findOne({ uid: payload.sub });
    if (!user || user.isActive === false) {
      throw new UnauthorizedException(
        'Your account has been deactivated. Please contact support.',
      );
    }

    if (this.distributors) {
      if (payload.did) {
        const distributor = await this.distributors.findOne({ did: payload.did });
        if (!distributor || distributor.isActive === false) {
          throw new UnauthorizedException(
            'Your distributor account has been deactivated. Please contact support.',
          );
        }
      } else if (
        payload.role === UserRole.DISTRIBUTOR ||
        user.role === UserRole.DISTRIBUTOR
      ) {
        const distributor = await this.distributors.findOne({ user });
        if (!distributor || distributor.isActive === false) {
          throw new UnauthorizedException(
            'Your distributor account has been deactivated. Please contact support.',
          );
        }
      }
    }

    return true;
  }
}
