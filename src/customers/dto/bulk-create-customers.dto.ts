import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class BulkCustomerItemDto {
  @IsString()
  @IsNotEmpty()
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
  @IsString()
  phoneNumber?: string;

  @IsOptional()
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

