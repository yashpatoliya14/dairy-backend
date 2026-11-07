import { describe, expect, it } from 'vitest';
import { isValidCustomerPhone } from '../src/customers/dto/customer-phone.validator.js';

describe('Customer Phone Number Validation', () => {
  describe('Standard 10-digit numbers (Any country / Non-specific to India)', () => {
    it('accepts valid 10-digit numbers regardless of leading digit', () => {
      // Indian mobile numbers starting with 6-9
      expect(isValidCustomerPhone('9876543210')).toBe(true);
      expect(isValidCustomerPhone('7043333359')).toBe(true);
      expect(isValidCustomerPhone('8123456789')).toBe(true);
      expect(isValidCustomerPhone('6123456789')).toBe(true);

      // US / International 10-digit numbers starting with 2-5
      expect(isValidCustomerPhone('2025550123')).toBe(true);
      expect(isValidCustomerPhone('4155552671')).toBe(true);
      expect(isValidCustomerPhone('3125550199')).toBe(true);
      expect(isValidCustomerPhone('5551234567')).toBe(true);
    });

    it('accepts 10-digit numbers with spaces, hyphens, and parentheses', () => {
      expect(isValidCustomerPhone('98765 43210')).toBe(true);
      expect(isValidCustomerPhone('(202) 555-0123')).toBe(true);
      expect(isValidCustomerPhone('704-333-3359')).toBe(true);
    });
  });

  describe('Country-wise international formats', () => {
    it('accepts international numbers with + country code', () => {
      // India (+91)
      expect(isValidCustomerPhone('+919876543210')).toBe(true);
      expect(isValidCustomerPhone('+91 98765 43210')).toBe(true);

      // US / Canada (+1)
      expect(isValidCustomerPhone('+1 202 555 0123')).toBe(true);
      expect(isValidCustomerPhone('+1 (415) 555-2671')).toBe(true);

      // UK (+44)
      expect(isValidCustomerPhone('+44 7911 123456')).toBe(true);

      // UAE (+971)
      expect(isValidCustomerPhone('+971 50 123 4567')).toBe(true);

      // Australia (+61)
      expect(isValidCustomerPhone('+61 412 345 678')).toBe(true);

      // Saudi Arabia (+966)
      expect(isValidCustomerPhone('+966 50 123 4567')).toBe(true);
    });

    it('accepts international numbers with country code without + (11 to 15 digits)', () => {
      expect(isValidCustomerPhone('919876543210')).toBe(true);
      expect(isValidCustomerPhone('12025550123')).toBe(true);
      expect(isValidCustomerPhone('447911123456')).toBe(true);
    });
  });

  describe('Rejection of invalid formats', () => {
    it('strictly rejects numbers with less than 10 digits', () => {
      expect(isValidCustomerPhone('12345')).toBe(false);
      expect(isValidCustomerPhone('1234567')).toBe(false);
      expect(isValidCustomerPhone('12345678')).toBe(false);
      expect(isValidCustomerPhone('123456789')).toBe(false);
    });

    it('strictly rejects numbers with more than 15 digits', () => {
      expect(isValidCustomerPhone('1234567890123456')).toBe(false);
      expect(isValidCustomerPhone('+91987654321099999')).toBe(false);
    });

    it('strictly rejects non-numeric/invalid characters', () => {
      expect(isValidCustomerPhone('abcdefghij')).toBe(false);
      expect(isValidCustomerPhone('98765abcde')).toBe(false);
      expect(isValidCustomerPhone('+0123456789')).toBe(false);
      expect(isValidCustomerPhone('')).toBe(false);
      expect(isValidCustomerPhone(null)).toBe(false);
    });
  });
});

