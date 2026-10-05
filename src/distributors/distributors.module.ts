import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Distributor } from '../entities/distributor.entity.js';

@Module({
  imports: [MikroOrmModule.forFeature([Distributor])],
  exports: [MikroOrmModule],
})
export class DistributorsModule {}
