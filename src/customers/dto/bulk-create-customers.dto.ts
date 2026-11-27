import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { CreateCustomerDto } from './create-customer.dto.js';

export class BulkCreateCustomersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCustomerDto)
  customers!: CreateCustomerDto[];
}
