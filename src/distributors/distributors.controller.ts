import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { DistributorsService, CustomerFilterQuery } from './distributors.service.js';

@Controller('distributors')
export class DistributorsController {
  constructor(private readonly distributorsService: DistributorsService) {}

  @Get()
  listDistributors(@Query('search') search?: string) {
    return this.distributorsService.listDistributors(search);
  }

  @Patch(':did/status')
  updateStatus(
    @Param('did') did: string,
    @Body() body: { isActive: boolean },
  ) {
    const isActive = body?.isActive === true;
    return this.distributorsService.updateStatus(did, isActive);
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
}
