/**
 * Validation and normalization utilities for email and mobile phone numbers.
 */

export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();

  // Basic RFC 5322 compliant regex
  const regex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!regex.test(trimmed)) return false;

  const atIndex = trimmed.indexOf('@');
  if (atIndex === -1) return false;
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);

  if (local.length === 0 || local.length > 64) return false;
  if (domain.length === 0 || domain.length > 255) return false;

  // Disallow consecutive dots
  if (local.includes('..') || domain.includes('..')) return false;

  const domainLabels = domain.split('.');
  if (domainLabels.length < 2) return false;
  const tld = domainLabels[domainLabels.length - 1];
  if (tld.length < 2 || !/^[a-zA-Z]+$/.test(tld)) return false;

  // Reject malformed domains where numbers precede provider names (e.g. "426gmail.com")
  for (const label of domainLabels) {
    if (/^\d+[a-zA-Z]+$/.test(label)) {
      return false;
    }
  }

  return true;
}

export function isPhoneNumber(input: string): boolean {
  if (!input || typeof input !== 'string') return false;
  const clean = input.trim();
  if (clean.includes('@')) return false;
  const digitsOnly = clean.replace(/\D/g, '');
  return (
    digitsOnly.length >= 10 &&
    digitsOnly.length <= 15 &&
    /^[+]?[0-9\s\-()]+$/.test(clean)
  );
}

export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  // Normalize standard 10-digit Indian numbers to E.164 (+91)
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

export function getPhoneSearchVariants(input: string): string[] {
  const digits = input.replace(/\D/g, '');
  const variants = new Set<string>();
  if (digits.length > 0) {
    variants.add(digits);
    variants.add(`+${digits}`);
    if (digits.length === 10) {
      variants.add(`91${digits}`);
      variants.add(`+91${digits}`);
    } else if (digits.length === 12 && digits.startsWith('91')) {
      variants.add(digits.slice(2));
      variants.add(`+91${digits.slice(2)}`);
    }
  }
  variants.add(input.trim());
  return Array.from(variants);
}
