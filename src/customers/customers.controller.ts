import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { CustomersService } from './customers.service.js';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(request.user.sub, dto);
  }

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query('search') search?: string) {
    return this.customersService.list(request.user.sub, search);
  }
}
