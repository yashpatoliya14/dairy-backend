import { IsDateString, IsIn, IsNumber, IsOptional, Min } from 'class-validator';

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
  @IsIn(['add', 'replace'])
  mode?: 'add' | 'replace';
}
