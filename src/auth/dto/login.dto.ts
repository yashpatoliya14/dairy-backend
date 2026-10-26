import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  /**
   * Accepts either an email address or a mobile phone number.
   */
  @IsString()
  @IsNotEmpty({ message: 'Email or mobile number is required' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Password is required' })
  password!: string;
}
