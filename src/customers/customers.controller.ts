import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { CreateMilkEntryDto } from './dto/create-milk-entry.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { SendWhatsAppDto } from './dto/send-whatsapp.dto.js';
import { CustomersService } from './customers.service.js';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  private readonly logger = new Logger(CustomersController.name);

  constructor(private readonly customersService: CustomersService) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(request.user.sub, dto);
  }

  @Patch(':customerId')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('customerId') customerId: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(request.user.sub, customerId, dto);
  }

  @Post(':customerId/entries')
  createEntry(
    @Req() request: AuthenticatedRequest,
    @Param('customerId') customerId: string,
    @Body() dto: CreateMilkEntryDto,
  ) {
    return this.customersService.createEntry(request.user.sub, customerId, dto);
  }

  @Get(':customerId/entries')
  listEntries(
    @Req() request: AuthenticatedRequest,
    @Param('customerId') customerId: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    if (year && month) {
      return this.customersService.listEntriesForMonth(
        request.user.sub,
        customerId,
        parseInt(year, 10),
        parseInt(month, 10),
      );
    }
    return this.customersService.listEntries(request.user.sub, customerId);
  }

  @Delete(':customerId/entries/:entryId')
  deleteEntry(
    @Req() request: AuthenticatedRequest,
    @Param('customerId') customerId: string,
    @Param('entryId') entryId: string,
  ) {
    return this.customersService.deleteEntry(
      request.user.sub,
      customerId,
      entryId,
    );
  }

  @Post(':customerId/entries/notify')
  notify(
    @Req() request: AuthenticatedRequest,
    @Param('customerId') customerId: string,
    @Body() dto: SendWhatsAppDto,
  ) {
    this.logger.log(
      `WhatsApp notify requested for customer ${customerId} by user ${request.user.sub}`,
    );
    return this.customersService.notifyWhatsApp(
      request.user.sub,
      customerId,
      dto,
    );
  }

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query('search') search?: string) {
    return this.customersService.list(request.user.sub, search);
  }
}
