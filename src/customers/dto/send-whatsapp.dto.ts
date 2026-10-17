import { IsNumber, Min } from 'class-validator';

export class SendWhatsAppDto {
  @IsNumber()
  @Min(0)
  liters!: number;

  @IsNumber()
  @Min(0)
  price!: number;
}
