import 'dotenv/config';
import { defineConfig } from '@mikro-orm/postgresql';
import { Customer } from './src/entities/customer.entity.js';
import { Distributor } from './src/entities/distributor.entity.js';
import { Settings } from './src/entities/settings.entity.js';
import { User } from './src/entities/user.entity.js';
import { MilkEntry } from './src/entities/milk-entry.entity.js';
import { DailyMessageLog } from './src/entities/daily-message-log.entity.js';

export default defineConfig({
  clientUrl: process.env.DATABASE_URL,
  schema: 'public',
  entities: [User, Distributor, Customer, Settings, MilkEntry, DailyMessageLog],
  migrations: {
    path: './dist/migrations',
    pathTs: './src/migrations',
  },
});
