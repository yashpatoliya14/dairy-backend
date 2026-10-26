import { describe, expect, it } from 'vitest';
import {
  getPhoneSearchVariants,
  isPhoneNumber,
  isValidEmail,
  normalizePhone,
} from '../src/auth/auth.utils.js';

describe('Auth Validation & Normalization Utils', () => {
  describe('Email validation', () => {
    it('rejects invalid email formats including malformed domain like HArEshSambad@426gmail.com', () => {
      expect(isValidEmail('HArEshSambad@426gmail.com')).toBe(false);
      expect(isValidEmail('invalid@')).toBe(false);
      expect(isValidEmail('invalid@com')).toBe(false);
      expect(isValidEmail('user..name@gmail.com')).toBe(false);
      expect(isValidEmail('@domain.com')).toBe(false);
      expect(isValidEmail('user@123yahoo.com')).toBe(false);
    });

    it('accepts legitimate email formats', () => {
      expect(isValidEmail('hareshsambad426@gmail.com')).toBe(true);
      expect(isValidEmail('yashpatoliya59@gmail.com')).toBe(true);
      expect(isValidEmail('dairy.owner@example.co.in')).toBe(true);
      expect(isValidEmail('test+alias@dairy-desk.org')).toBe(true);
    });
  });

  describe('Phone number detection and normalization', () => {
    it('detects valid mobile numbers', () => {
      expect(isPhoneNumber('9876543210')).toBe(true);
      expect(isPhoneNumber('+919876543210')).toBe(true);
      expect(isPhoneNumber('7043333359')).toBe(true);
      expect(isPhoneNumber('+91 70433 33359')).toBe(true);
    });

    it('rejects invalid mobile numbers and emails', () => {
      expect(isPhoneNumber('user@example.com')).toBe(false);
      expect(isPhoneNumber('12345')).toBe(false);
      expect(isPhoneNumber('abc9876543210')).toBe(false);
    });

    it('normalizes mobile numbers and generates search variants', () => {
      expect(normalizePhone('9876543210')).toBe('+919876543210');
      const variants = getPhoneSearchVariants('9876543210');
      expect(variants).toContain('9876543210');
      expect(variants).toContain('+919876543210');
      expect(variants).toContain('919876543210');
    });
  });
});
