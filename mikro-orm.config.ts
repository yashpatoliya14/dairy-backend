import 'dotenv/config';
import { defineConfig } from '@mikro-orm/postgresql';
import { Customer } from './src/entities/customer.entity.js';
import { Distributor } from './src/entities/distributor.entity.js';
import { Settings } from './src/entities/settings.entity.js';
import { User } from './src/entities/user.entity.js';
import { MilkEntry } from './src/entities/milk-entry.entity.js';

export default defineConfig({
  clientUrl: process.env.DATABASE_URL,
  entities: [User, Distributor, Customer, Settings, MilkEntry],
  migrations: {
    path: './dist/migrations',
    pathTs: './src/migrations',
  },
});
