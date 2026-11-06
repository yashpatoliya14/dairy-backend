import { describe, it, expect } from 'vitest';
import {
  roundToCurrency,
  calculateEntryTotal,
  calculateBillingPeriodSummary,
} from './billing.utils.js';

describe('Phase 6 Billing Accuracy & Financial Logic Audit', () => {
  it('1. calculates normal daily billing accurately', () => {
    // 2.5 Liters @ Rs 60.00 = Rs 150.00
    const total = calculateEntryTotal(2.5, 60.0);
    expect(total).toBe(150.0);
  });

  it('2. handles morning-only milk entry', () => {
    const summary = calculateBillingPeriodSummary({
      entries: [{ liters: 1.5, price: 55, shift: 'morning' }],
    });
    expect(summary.totalQuantity).toBe(1.5);
    expect(summary.billingPeriodAmount).toBe(82.5);
    expect(summary.netPayable).toBe(82.5);
  });

  it('3. handles evening-only milk entry', () => {
    const summary = calculateBillingPeriodSummary({
      entries: [{ liters: 2.0, price: 55, shift: 'evening' }],
    });
    expect(summary.totalQuantity).toBe(2.0);
    expect(summary.billingPeriodAmount).toBe(110.0);
    expect(summary.netPayable).toBe(110.0);
  });

  it('4. aggregates both morning and evening entries on the same billing period', () => {
    const summary = calculateBillingPeriodSummary({
      entries: [
        { liters: 1.5, price: 60, shift: 'morning' }, // 90
        { liters: 1.0, price: 60, shift: 'evening' }, // 60
      ],
    });
    expect(summary.totalQuantity).toBe(2.5);
    expect(summary.billingPeriodAmount).toBe(150.0);
  });

  it('5. handles zero quantity safely without error', () => {
    const total = calculateEntryTotal(0, 60);
    expect(total).toBe(0);

    const summary = calculateBillingPeriodSummary({
      entries: [{ liters: 0, price: 60 }],
    });
    expect(summary.totalQuantity).toBe(0);
    expect(summary.billingPeriodAmount).toBe(0);
    expect(summary.netPayable).toBe(0);
  });

  it('6. avoids floating point errors with odd decimal quantities', () => {
    // 1.15 L * 63.33 = 72.8295 -> 72.83
    const total = calculateEntryTotal(1.15, 63.33);
    expect(total).toBe(72.83);

    // Summing 0.1 + 0.2 in JS gives 0.30000000000000004
    const totalQuantity = roundToCurrency(0.1 + 0.2);
    expect(totalQuantity).toBe(0.3);
  });

  it('7. supports different milk rates per entry', () => {
    const summary = calculateBillingPeriodSummary({
      entries: [
        { liters: 2.0, price: 50 }, // 100
        { liters: 2.0, price: 60 }, // 120
      ],
    });
    expect(summary.billingPeriodAmount).toBe(220.0);
  });

  it('8. handles variable rates across a billing period', () => {
    const summary = calculateBillingPeriodSummary({
      entries: [
        { liters: 3.0, price: 58.5 }, // 175.50
        { liters: 2.5, price: 61.2 }, // 153.00
      ],
    });
    expect(summary.totalQuantity).toBe(5.5);
    expect(summary.billingPeriodAmount).toBe(328.5);
  });

  it('9. handles missing entry days appropriately (only active days count)', () => {
    // Customer delivered milk on 3 out of 7 days
    const summary = calculateBillingPeriodSummary({
      entries: [
        { liters: 1.0, price: 60 },
        { liters: 1.0, price: 60 },
        { liters: 1.0, price: 60 },
      ],
    });
    expect(summary.entries).toBeUndefined(); // internal
    expect(summary.totalQuantity).toBe(3.0);
    expect(summary.billingPeriodAmount).toBe(180.0);
  });

  it('10. carries forward previous outstanding balance correctly', () => {
    const summary = calculateBillingPeriodSummary({
      entries: [{ liters: 10, price: 60 }], // 600
      previousBalance: 250.5,
    });
    expect(summary.billingPeriodAmount).toBe(600.0);
    expect(summary.previousBalance).toBe(250.5);
    expect(summary.netPayable).toBe(850.5);
  });

  it('11. accounts for partial payments received', () => {
    const summary = calculateBillingPeriodSummary({
      entries: [{ liters: 10, price: 60 }], // 600
      previousBalance: 100, // 700 total
      paymentsReceived: 400, // remaining 300
    });
    expect(summary.payments).toBe(400);
    expect(summary.remainingBalance).toBe(300);
    expect(summary.netPayable).toBe(300);
  });

  it('12. handles full payment (zero balance)', () => {
    const summary = calculateBillingPeriodSummary({
      entries: [{ liters: 10, price: 60 }], // 600
      paymentsReceived: 600,
    });
    expect(summary.remainingBalance).toBe(0);
  });

  it('13. handles advance payments and negative balance (credit state)', () => {
    const summary = calculateBillingPeriodSummary({
      entries: [{ liters: 5, price: 60 }], // 300
      paymentsReceived: 500, // Customer paid 500 in advance
    });
    // Remaining balance is -200 (credit to customer)
    expect(summary.remainingBalance).toBe(-200);
  });

  it('14. applies discounts and additional charges consistently', () => {
    const summary = calculateBillingPeriodSummary({
      entries: [{ liters: 10, price: 60 }], // 600
      adjustmentsOrCharges: 25, // container fee
      discounts: 50, // festival discount
      paymentsReceived: 200,
    });
    // 600 + 25 - 50 - 200 = 375
    expect(summary.charges).toBe(25);
    expect(summary.discounts).toBe(50);
    expect(summary.netPayable).toBe(375);
  });

  it('15. correctly reconciles customers with zero milk entries in the period', () => {
    const summary = calculateBillingPeriodSummary({
      entries: [],
      previousBalance: 120,
    });
    expect(summary.totalQuantity).toBe(0);
    expect(summary.billingPeriodAmount).toBe(0);
    expect(summary.netPayable).toBe(120);
  });

  it('16. verified formula: Net Payable = Billing Period Amount + Previous Outstanding + Charges - Discounts - Payments', () => {
    const B = 1450.75;
    const O = 320.0;
    const C = 15.0;
    const D = 25.5;
    const P = 1000.0;

    const summary = calculateBillingPeriodSummary({
      entries: [{ liters: 1, price: B }],
      previousBalance: O,
      adjustmentsOrCharges: C,
      discounts: D,
      paymentsReceived: P,
    });

    const expected = roundToCurrency(B + O + C - D - P);
    expect(summary.netPayable).toBe(expected);
    expect(summary.netPayable).toBe(760.25);
  });
});
