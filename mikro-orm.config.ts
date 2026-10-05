import 'dotenv/config';
import { defineConfig } from '@mikro-orm/postgresql';
import { Customer } from './src/entities/customer.entity.js';
import { Distributor } from './src/entities/distributor.entity.js';
import { Settings } from './src/entities/settings.entity.js';
import { User } from './src/entities/user.entity.js';

export default defineConfig({
  clientUrl: process.env.DATABASE_URL,
  entities: [User, Distributor, Customer, Settings],
  migrations: {
    path: './dist/migrations',
    pathTs: './src/migrations',
  },
});
