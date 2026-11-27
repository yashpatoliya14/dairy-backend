import { IsArray, IsOptional, IsString } from 'class-validator';

export class ScanCardsDto {
  @IsArray()
  @IsString({ each: true })
  images!: string[];

  @IsOptional()
  @IsString()
  apiKey?: string;
}
