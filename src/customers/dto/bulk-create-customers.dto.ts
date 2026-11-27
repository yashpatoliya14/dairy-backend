import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsCustomerPhoneNumber } from './customer-phone.validator.js';

export class BulkCustomerItemDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Customer name is required' })
  name!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  liters?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @ValidateIf((o) => typeof o.phoneNumber === 'string' && o.phoneNumber.trim().length > 0)
  @IsCustomerPhoneNumber()
  phoneNumber?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  uniqueNumber?: string;

  @IsOptional()
  @IsIn(['sms', 'whatsapp'])
  notificationChannel?: 'sms' | 'whatsapp';
}

export class BulkCreateCustomersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkCustomerItemDto)
  customers!: BulkCustomerItemDto[];
}
