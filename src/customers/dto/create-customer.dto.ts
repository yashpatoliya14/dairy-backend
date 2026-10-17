import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsNotEmpty,
  Min,
  Matches,
} from 'class-validator';

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
  @Matches(/^[0-9+()\-\s]{7,20}$/, { message: 'Enter a valid phone number' })
  phoneNumber!: string;

  @IsIn(['sms', 'whatsapp'])
  notificationChannel!: 'sms' | 'whatsapp';
}
