import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

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
  @Matches(/^[0-9+()\-\s]{7,20}$/, { message: 'Enter a valid phone number' })
  phoneNumber?: string;

  @IsOptional()
  @IsIn(['sms', 'whatsapp'])
  notificationChannel?: 'sms' | 'whatsapp';
}
