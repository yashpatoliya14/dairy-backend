import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

/**
 * Validates that a customer phone number strictly adheres to:
 * 1. Exactly a 10-digit number (national 10-digit format for any country, e.g. 9876543210, 2025550123), OR
 * 2. Country-wise international format (10 to 15 digits according to ITU-T E.164, e.g. +91 98765 43210, +1 202 555 0123, +44 7911 123456).
 *
 * Strictly rejects numbers with fewer than 10 digits (e.g. 7 digits), numbers > 15 digits, or invalid characters.
 */
export function isValidCustomerPhone(input: unknown): boolean {
  if (typeof input !== 'string') return false;
  const clean = input.trim();
  if (clean.length === 0) return false;

  // Only allow digits, optional leading '+', and formatting characters: spaces, hyphens, parentheses
  if (!/^\+?[0-9\s\-()]+$/.test(clean)) return false;

  const digits = clean.replace(/\D/g, '');

  // Must have between 10 and 15 digits (ITU-T E.164 standard)
  if (digits.length < 10 || digits.length > 15) return false;

  // Case 1: If starts with '+', country code cannot start with '0'
  if (clean.startsWith('+')) {
    const withoutPlus = clean.substring(1).replace(/\D/g, '');
    return withoutPlus.length >= 10 && !withoutPlus.startsWith('0');
  }

  // Case 2: Exactly 10 digits (standard national 10-digit format for any country)
  if (digits.length === 10) {
    return true;
  }

  // Case 3: 11-15 digits without '+' (country code digits e.g. 919876543210, 12025550123)
  return !digits.startsWith('0');
}

export function IsCustomerPhoneNumber(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isCustomerPhoneNumber',
      target: object.constructor,
      propertyName: propertyName,
      options: {
        message:
          'Phone number must be a valid 10-digit number or country-wise format (e.g. +91 98765 43210, +1 202 555 0123)',
        ...validationOptions,
      },
      validator: {
        validate(value: any, _args: ValidationArguments) {
          return isValidCustomerPhone(value);
        },
      },
    });
  };
}

