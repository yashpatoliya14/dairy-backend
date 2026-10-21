import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
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

  @IsNumber()
  liters!: number;

  @IsNumber()
  ratePerLiter!: number;

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
  useTemplate?: boolean;

  @IsOptional()
  @IsString()
  templateName?: string;
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
