import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  DistributorsService,
  CustomerFilterQuery,
} from './distributors.service.js';
import { AdminAuthGuard } from '../auth/admin-auth.guard.js';

@Controller('distributors')
@UseGuards(AdminAuthGuard)
export class DistributorsController {
  constructor(private readonly distributorsService: DistributorsService) {}

  @Get('stats')
  getStats() {
    return this.distributorsService.getStats();
  }

  @Get('transactions')
  getTransactions() {
    return this.distributorsService.getTransactions();
  }

  @Get('customers')
  listCustomers(
    @Query('distributorId') distributorId?: string,
    @Query('distributorName') distributorName?: string,
    @Query('search') search?: string,
    @Query('status') status?: 'active' | 'inactive' | 'all',
  ) {
    const filter: CustomerFilterQuery = {
      distributorId,
      distributorName,
      search,
      status,
    };
    return this.distributorsService.listCustomers(filter);
  }

  @Get('customers/:cid')
  getCustomerDetails(@Param('cid') cid: string) {
    return this.distributorsService.getCustomerDetails(cid);
  }

  @Get(':did')
  getDistributorDetails(@Param('did') did: string) {
    return this.distributorsService.getDistributorDetails(did);
  }

  @Patch(':did/status')
  updateStatus(
    @Param('did') did: string,
    @Body() body: { isActive: boolean },
  ) {
    const isActive = body?.isActive === true;
    return this.distributorsService.updateStatus(did, isActive);
  }

  @Get()
  listDistributors(
    @Query('search') search?: string,
    @Query('status') status?: 'active' | 'inactive' | 'all',
  ) {
    return this.distributorsService.listDistributors(search, status);
  }
}
