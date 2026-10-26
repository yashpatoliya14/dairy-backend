import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Distributor } from '../entities/distributor.entity.js';
import { User } from '../entities/user.entity.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { MailService } from './mail.service.js';

@Module({
  imports: [
    ConfigModule,
    MikroOrmModule.forFeature([User, Distributor]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const expiresInRaw = config.get('JWT_EXPIRES_IN_SECONDS');
        const parsed =
          expiresInRaw !== undefined ? Number(expiresInRaw) : 2592000;
        // 2,592,000 seconds = 30 days (1 month)
        const expiresIn =
          Number.isFinite(parsed) && parsed > 0 ? parsed : 2592000;
        return {
          secret: config.get<string>('JWT_SECRET', 'development-only-change-me'),
          signOptions: {
            expiresIn,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, MailService],
  exports: [JwtModule, JwtAuthGuard],
})
export class AuthModule {}
