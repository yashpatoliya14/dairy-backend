import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsNotEmpty,
  Min,
} from 'class-validator';
import { IsCustomerPhoneNumber } from './customer-phone.validator.js';

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  liters!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price!: number;

  @IsString()
  @IsNotEmpty()
  @IsCustomerPhoneNumber()
  phoneNumber!: string;

  @IsIn(['sms', 'whatsapp'])
  notificationChannel!: 'sms' | 'whatsapp';
}
