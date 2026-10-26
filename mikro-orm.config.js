import 'dotenv/config';
import { defineConfig } from '@mikro-orm/postgresql';
import { Customer } from './dist/entities/customer.entity.js';
import { Distributor } from './dist/entities/distributor.entity.js';
import { MilkEntry } from './dist/entities/milk-entry.entity.js';
import { DailyMessageLog } from './dist/entities/daily-message-log.entity.js';
import { Settings } from './dist/entities/settings.entity.js';
import { User } from './dist/entities/user.entity.js';

export default defineConfig({
  clientUrl: process.env.DATABASE_URL,
  schema: 'public',
  entities: [User, Distributor, Customer, Settings, MilkEntry, DailyMessageLog],
});
