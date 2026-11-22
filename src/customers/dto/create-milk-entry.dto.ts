import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateMilkEntryDto {
  @IsDateString()
  entryDate!: string;

  @IsNumber()
  @Min(0)
  liters!: number;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsString()
  mode?: 'add' | 'replace';
}
