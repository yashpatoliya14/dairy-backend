import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Distributor } from '../entities/distributor.entity.js';
import { Customer } from '../entities/customer.entity.js';
import { User } from '../entities/user.entity.js';
import { DistributorsService } from './distributors.service.js';
import { DistributorsController } from './distributors.controller.js';

@Module({
  imports: [MikroOrmModule.forFeature([Distributor, Customer, User])],
  controllers: [DistributorsController],
  providers: [DistributorsService],
  exports: [MikroOrmModule, DistributorsService],
})
export class DistributorsModule {}
