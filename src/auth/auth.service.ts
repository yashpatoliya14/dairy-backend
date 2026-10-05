import {
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

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly users: EntityRepository<User>,
    @InjectRepository(Distributor)
    private readonly distributors: EntityRepository<Distributor>,
    private readonly jwtService: JwtService,
  ) {}

  async signup(dto: SignupDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.users.findOne({ email })) {
      throw new ConflictException('Email is already registered');
    }

    const user = this.users.create({
      uid: randomUUID(),
      email,
      passwordHash: await bcrypt.hash(dto.password, 12),
      name: email,
      role: UserRole.DISTRIBUTOR,
    });
    const distributor = this.distributors.create({
      did: randomUUID(),
      dairyName: dto.dairyName.trim(),
      user,
    });
    const em = this.users.getEntityManager();
    em.persist([user, distributor]);
    await em.flush();
    return this.issueToken(user, distributor);
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.users.findOne({ email });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const distributor = await this.distributors.findOne({ user });
    if (!distributor) {
      throw new UnauthorizedException('Distributor account is not configured');
    }
    return this.issueToken(user, distributor);
  }

  private issueToken(user: User, distributor: Distributor) {
    const payload = { sub: user.uid, did: distributor.did, email: user.email };
    return {
      accessToken: this.jwtService.sign(payload),
      user: { id: user.uid, email: user.email, dairyName: distributor.dairyName },
    };
  }
}
