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
import { BulkCreateCustomersDto } from './dto/bulk-create-customers.dto.js';
import { ScanCardsDto } from './dto/scan-cards.dto.js';
import { CreateMilkEntryDto } from './dto/create-milk-entry.dto.js';
import { CreatePaymentEntryDto } from './dto/create-payment-entry.dto.js';
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

  @Post('bulk')
  bulkCreate(
    @Req() request: AuthenticatedRequest,
    @Body() dto: BulkCreateCustomersDto,
  ) {
    return this.customersService.bulkCreate(request.user.sub, dto.customers);
  }

  @Post('scan-cards')
  scanCards(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ScanCardsDto,
  ) {
    return this.customersService.scanCards(request.user.sub, dto.images);
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

  @Get('bootstrap')
  getBootstrap(
    @Req() request: AuthenticatedRequest,
    @Query('date') date?: string,
  ) {
    return this.customersService.getBootstrapData(request.user.sub, date);
  }

  @Get('monthly-bills')
  getMonthlyBills(
    @Req() request: AuthenticatedRequest,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const y = year ? parseInt(year, 10) : new Date().getFullYear();
    const m = month ? parseInt(month, 10) : new Date().getMonth() + 1;
    return this.customersService.getMonthlyBillsSummary(request.user.sub, y, m);
  }

  @Get(':customerId/bill-summary')
  getCustomerBillSummary(
    @Req() request: AuthenticatedRequest,
    @Param('customerId') customerId: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const y = year ? parseInt(year, 10) : new Date().getFullYear();
    const m = month ? parseInt(month, 10) : new Date().getMonth() + 1;
    return this.customersService.getCustomerBillSummary(
      request.user.sub,
      customerId,
      y,
      m,
    );
  }

  @Get(':customerId/entries') 
  listEntries(
    @Req() request: AuthenticatedRequest,
    @Param('customerId') customerId: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    if (year && month) {
      const y = parseInt(year, 10);
      const m = parseInt(month, 10);
      if (!isNaN(y) && !isNaN(m)) {
        return this.customersService.listEntriesForMonth(
          request.user.sub,
          customerId,
          y,
          m,
        );
      }
    }
    return this.customersService.listEntries(
      request.user.sub,
      customerId,
      month,
    );
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

  @Delete(':customerId')
  delete(
    @Req() request: AuthenticatedRequest,
    @Param('customerId') customerId: string,
  ) {
    return this.customersService.delete(request.user.sub, customerId);
  }

  @Post(':customerId/payments')
  savePayment(
    @Req() request: AuthenticatedRequest,
    @Param('customerId') customerId: string,
    @Body() dto: CreatePaymentEntryDto,
  ) {
    return this.customersService.savePayment(
      request.user.sub,
      customerId,
      dto,
    );
  }

  @Get(':customerId/payments')
  getPayments(
    @Req() request: AuthenticatedRequest,
    @Param('customerId') customerId: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    if (year && month) {
      const y = parseInt(year, 10);
      const m = parseInt(month, 10);
      if (!isNaN(y) && !isNaN(m)) {
        return this.customersService.getPayment(
          request.user.sub,
          customerId,
          y,
          m,
        );
      }
    }
    return this.customersService.listPayments(request.user.sub, customerId);
  }

  @Delete(':customerId/payments/:paymentId')
  deletePaymentById(
    @Req() request: AuthenticatedRequest,
    @Param('customerId') customerId: string,
    @Param('paymentId') paymentId: string,
  ) {
    return this.customersService.deletePayment(request.user.sub, customerId, {
      paymentId,
    });
  }

  @Delete(':customerId/payments')
  deletePaymentByMonth(
    @Req() request: AuthenticatedRequest,
    @Param('customerId') customerId: string,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    return this.customersService.deletePayment(request.user.sub, customerId, {
      year: y,
      month: m,
    });
  }

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query('search') search?: string) {
    return this.customersService.list(request.user.sub, search);
  }
}
