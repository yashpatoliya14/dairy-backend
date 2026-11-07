import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { IsCustomerPhoneNumber } from './customer-phone.validator.js';

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  name?: string;

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
  @IsCustomerPhoneNumber()
  phoneNumber?: string;

  @IsOptional()
  @IsIn(['sms', 'whatsapp'])
  notificationChannel?: 'sms' | 'whatsapp';
}
