import { IsNumber, IsString, IsNotEmpty, Min } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  uniqueNumber!: string;

  @IsNumber()
  @Min(0)
  liters!: number;

  @IsNumber()
  @Min(0)
  price!: number;
}
