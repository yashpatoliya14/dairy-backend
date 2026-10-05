import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Settings } from '../entities/settings.entity.js';

@Module({
  imports: [MikroOrmModule.forFeature([Settings])],
  exports: [MikroOrmModule],
})
export class SettingsModule {}
