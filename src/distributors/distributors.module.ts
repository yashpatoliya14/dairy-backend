import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Distributor } from '../entities/distributor.entity.js';
import { Customer } from '../entities/customer.entity.js';
import { User } from '../entities/user.entity.js';
import { MilkEntry } from '../entities/milk-entry.entity.js';
import { PaymentEntry } from '../entities/payment-entry.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { DistributorsService } from './distributors.service.js';
import { DistributorsController } from './distributors.controller.js';

@Module({
  imports: [
    MikroOrmModule.forFeature([Distributor, Customer, User, MilkEntry, PaymentEntry]),
    AuthModule,
  ],
  controllers: [DistributorsController],
  providers: [DistributorsService],
  exports: [MikroOrmModule, DistributorsService],
})
export class DistributorsModule {}
