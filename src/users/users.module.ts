import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { User } from '../entities/user.entity.js';

@Module({
  imports: [MikroOrmModule.forFeature([User])],
  exports: [MikroOrmModule],
})
export class UsersModule {}
