import { Transform } from 'class-transformer';
import { IsDateString, IsNotEmpty, IsNumber, IsString, Max, MaxLength, Min } from 'class-validator';

/** A non-milk item a customer bought (ghee, paneer, curd...) billed with the month. */
export class CreateOtherItemDto {
  @IsDateString()
  entryDate!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10_000_000)
  amount!: number;
}
