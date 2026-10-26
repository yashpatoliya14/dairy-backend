import {
  IsBoolean,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const phonePattern = /^[+]?[1-9]\d{7,14}$/;

export class SendTextMessageRequest {
  @IsString()
  @Matches(phonePattern)
  to!: string;

  @IsString()
  message!: string;
}

export class SendTemplateMessageRequest {
  @IsString()
  @Matches(phonePattern)
  to!: string;

  @IsString()
  templateName!: string;

  @IsOptional()
  @IsString()
  languageCode?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  bodyParameters?: string[];
}

export class SendBillMessageRequest {
  @IsString()
  @Matches(phonePattern)
  to!: string;

  @IsString()
  customerName!: string;

  @ValidateIf((dto: SendBillMessageRequest) => dto.type !== 'monthly')
  @IsNumber()
  liters?: number;

  @IsNumber()
  ratePerLiter!: number;

  @IsOptional()
  @IsIn(['daily', 'monthly'])
  type?: 'daily' | 'monthly';

  @ValidateIf((dto: SendBillMessageRequest) => dto.type === 'monthly')
  @IsNumber()
  totalLiters!: number;

  @IsOptional()
  @IsString()
  monthName?: string;

  @IsOptional()
  @IsNumber()
  totalDays?: number;

  @IsOptional()
  @IsNumber()
  monthlyAmount?: number;

  @IsOptional()
  @IsNumber()
  totalAmount?: number;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  deliverySession?: string;

  @IsOptional()
  @IsNumber()
  previousDue?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  distributorName?: string;

  @IsOptional()
  @IsString()
  distributorPhone?: string;

  @IsOptional()
  @IsBoolean()
  useTemplate?: boolean;

  @IsOptional()
  @IsString()
  templateName?: string;

  @IsOptional()
  @IsString()
  languageCode?: string;
}

export class BulkCustomerRequest {
  @IsString()
  @Matches(phonePattern)
  phone!: string;

  @IsString()
  name!: string;
}

export class BulkTemplateMessageDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkCustomerRequest)
  customers!: BulkCustomerRequest[];

  @IsString()
  templateName!: string;

  @IsOptional()
  @IsString()
  languageCode?: string;
}

export class UpdateDailyMessageStatusDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be YYYY-MM-DD' })
  date!: string;

  @IsString()
  @IsIn(['not_sent', 'pending', 'opened_in_whatsapp', 'sent', 'failed'])
  status!: 'not_sent' | 'pending' | 'opened_in_whatsapp' | 'sent' | 'failed';

  @IsOptional()
  @IsString()
  messageContent?: string;

  @IsOptional()
  @IsString()
  providerMessageId?: string;

  @IsOptional()
  @IsString()
  errorMessage?: string;
}

export class SendDailyEntryDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be YYYY-MM-DD' })
  date!: string;

  @IsOptional()
  @IsString()
  message?: string;
}

export class SendDailyEntryBulkDto {
  @IsArray()
  @IsString({ each: true })
  customerIds!: string[];

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be YYYY-MM-DD' })
  date!: string;
}

