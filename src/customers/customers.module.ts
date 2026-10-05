import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Customer } from '../entities/customer.entity.js';
import { Distributor } from '../entities/distributor.entity.js';
import { User } from '../entities/user.entity.js';
import { CustomersController } from './customers.controller.js';
import { CustomersService } from './customers.service.js';

@Module({
  imports: [MikroOrmModule.forFeature([Customer, Distributor, User])],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
