import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { AuthModule } from '../auth/auth.module.js';
import { WhatsAppService } from './whatsapp.service.js';
import { WhatsAppController } from './whatsapp.controller.js';
import { DailyMessageLog } from '../entities/daily-message-log.entity.js';
import { Customer } from '../entities/customer.entity.js';
import { MilkEntry } from '../entities/milk-entry.entity.js';
import { Distributor } from '../entities/distributor.entity.js';
import { User } from '../entities/user.entity.js';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    MikroOrmModule.forFeature([
      DailyMessageLog,
      Customer,
      MilkEntry,
      Distributor,
      User,
    ]),
  ],
  controllers: [WhatsAppController],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
