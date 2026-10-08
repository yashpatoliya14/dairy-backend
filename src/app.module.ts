import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { Customer } from './entities/customer.entity.js';
import { Distributor } from './entities/distributor.entity.js';
import { Settings } from './entities/settings.entity.js';
import { User } from './entities/user.entity.js';
import { CustomersModule } from './customers/customers.module.js';
import { DistributorsModule } from './distributors/distributors.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MikroOrmModule.forRootAsync({
      driver: PostgreSqlDriver,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        clientUrl: configService.getOrThrow<string>('DATABASE_URL'),
        entities: [User, Distributor, Customer, Settings],
      }),
    }),
    UsersModule,
    AuthModule,
    DistributorsModule,
    CustomersModule,
    SettingsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
