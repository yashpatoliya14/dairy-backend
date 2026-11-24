import { describe, it, expect } from 'vitest';
import {
  roundToCurrency,
  calculateEntryTotal,
  calculateBillingPeriod,
  calculateBillingPeriodSummary,
  calculateCustomerLedger,
} from './billing.utils.js';

describe('Central Billing Calculation & Accounting Rules', () => {
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
    expect(summary.remainingDue).toBe(82.5);
    expect(summary.netPayable).toBe(82.5);
  });

  it('3. handles evening-only milk entry', () => {
    const summary = calculateBillingPeriodSummary({
      entries: [{ liters: 2.0, price: 55, shift: 'evening' }],
    });
    expect(summary.totalQuantity).toBe(2.0);
    expect(summary.billingPeriodAmount).toBe(110.0);
    expect(summary.remainingDue).toBe(110.0);
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

  it('5. avoids floating point errors with odd decimal quantities', () => {
    // 1.15 L * 63.33 = 72.8295 -> 72.83
    const total = calculateEntryTotal(1.15, 63.33);
    expect(total).toBe(72.83);

    // Summing 0.1 + 0.2 in JS gives 0.30000000000000004
    const totalQuantity = roundToCurrency(0.1 + 0.2);
    expect(totalQuantity).toBe(0.3);
  });

  it('6. supports different milk rates per entry', () => {
    const summary = calculateBillingPeriodSummary({
      entries: [
        { liters: 2.0, price: 50 }, // 100
        { liters: 2.0, price: 60 }, // 120
      ],
    });
    expect(summary.billingPeriodAmount).toBe(220.0);
  });

  it('7. handles variable rates across a billing period', () => {
    const summary = calculateBillingPeriodSummary({
      entries: [
        { liters: 3.0, price: 58.5 }, // 175.50
        { liters: 2.5, price: 61.2 }, // 153.00
      ],
    });
    expect(summary.totalQuantity).toBe(5.5);
    expect(summary.billingPeriodAmount).toBe(328.5);
  });

  it('8. handles missing entry days appropriately (only active days count)', () => {
    const summary = calculateBillingPeriodSummary({
      entries: [
        { liters: 1.0, price: 60 },
        { liters: 1.0, price: 60 },
        { liters: 1.0, price: 60 },
      ],
    });
    expect(summary.totalQuantity).toBe(3.0);
    expect(summary.billingPeriodAmount).toBe(180.0);
  });

  it('9. applies discounts and additional charges consistently', () => {
    const summary = calculateBillingPeriodSummary({
      entries: [{ liters: 10, price: 60 }], // 600
      adjustmentsOrCharges: 25, // container fee
      discounts: 50, // festival discount
      paymentsReceived: 200,
    });
    // 600 + 25 - 50 = 575 payable; 200 payment applied -> remainingDue 375
    expect(summary.charges).toBe(25);
    expect(summary.discounts).toBe(50);
    expect(summary.payableBeforeAdvance).toBe(575);
    expect(summary.remainingDue).toBe(375);
    expect(summary.netPayable).toBe(375);
  });

  // ==========================================
  // MANDATORY EDGE-CASE TESTS (Prompt Section 5.B)
  // ==========================================

  it('Edge Case 1: Zero bill', () => {
    const result = calculateBillingPeriod({
      entries: [],
      previousBalance: 0,
      paymentsReceived: 0,
    });
    expect(result.billingPeriodAmount).toBe(0);
    expect(result.remainingDue).toBe(0);
    expect(result.remainingAdvance).toBe(0);
  });

  it('Edge Case 2: Zero advance', () => {
    const result = calculateBillingPeriod({
      entries: [{ liters: 5, price: 60 }], // 300
      availableAdvance: 0,
      paymentsReceived: 0,
    });
    expect(result.payableBeforeAdvance).toBe(300);
    expect(result.advanceApplied).toBe(0);
    expect(result.remainingDue).toBe(300);
    expect(result.remainingAdvance).toBe(0);
  });

  it('Edge Case 3: Advance greater than current bill', () => {
    // Current bill: 300, Available advance: 500, Previous due: 0
    const result = calculateBillingPeriod({
      entries: [{ liters: 5, price: 60 }], // 300
      availableAdvance: 500,
      paymentsReceived: 0,
    });
    // Advance applied = min(500, 300) = 300
    // Remaining due = 0 (never negative)
    // Advance carried forward = 200
    expect(result.payableBeforeAdvance).toBe(300);
    expect(result.advanceApplied).toBe(300);
    expect(result.remainingDue).toBe(0);
    expect(result.remainingAdvance).toBe(200);
  });

  it('Edge Case 4: Advance greater than total payable (Prompt Rule 3 example)', () => {
    // Previous due: 200, Current bill: 300, Available advance: 700
    const result = calculateBillingPeriod({
      entries: [{ liters: 5, price: 60 }], // 300
      previousBalance: 200, // 200
      availableAdvance: 700,
      paymentsReceived: 0,
    });
    // Payable before advance = 200 + 300 = 500
    // Advance applied = min(700, 500) = 500
    // Remaining due = 0
    // Advance carried forward = 200
    expect(result.payableBeforeAdvance).toBe(500);
    expect(result.advanceApplied).toBe(500);
    expect(result.dueAfterAdvance).toBe(0);
    expect(result.remainingDue).toBe(0);
    expect(result.remainingAdvance).toBe(200);
  });

  it('Edge Case 5: Previous due without a current bill', () => {
    const result = calculateBillingPeriod({
      entries: [],
      previousBalance: 350.5,
      paymentsReceived: 0,
    });
    expect(result.billingPeriodAmount).toBe(0);
    expect(result.payableBeforeAdvance).toBe(350.5);
    expect(result.remainingDue).toBe(350.5);
    expect(result.remainingAdvance).toBe(0);
  });

  it('Edge Case 6: Payment equal to outstanding due', () => {
    const result = calculateBillingPeriod({
      entries: [{ liters: 10, price: 60 }], // 600
      paymentsReceived: 600,
    });
    expect(result.paymentsAppliedToDue).toBe(600);
    expect(result.remainingDue).toBe(0);
    expect(result.excessPayment).toBe(0);
    expect(result.remainingAdvance).toBe(0);
  });

  it('Edge Case 7: Payment greater than outstanding due (Prompt Rule 2 example)', () => {
    // Outstanding due: 500, Customer payment: 700
    const result = calculateBillingPeriod({
      entries: [],
      previousBalance: 500,
      paymentsReceived: 700,
    });
    // Remaining due = 0
    // Advance balance = 200
    expect(result.payableBeforeAdvance).toBe(500);
    expect(result.paymentsAppliedToDue).toBe(500);
    expect(result.remainingDue).toBe(0);
    expect(result.excessPayment).toBe(200);
    expect(result.remainingAdvance).toBe(200);
  });

  it('Edge Case 8: Multiple payments on the same day / month', () => {
    // Two payments: 300 + 400 = 700 towards 500 bill
    const result = calculateBillingPeriod({
      entries: [{ liters: 10, price: 50 }], // 500
      paymentsReceived: 700, // 300 + 400
    });
    expect(result.remainingDue).toBe(0);
    expect(result.remainingAdvance).toBe(200);
  });

  it('Edge Case 9 & 10: Multiple payments & month-boundary calculations across billing periods', () => {
    // Month 1 (Oct 2026): 10L @ 60 = 600. Payment: 800.
    // -> Remaining due: 0, Advance carried forward: 200.
    // Month 2 (Nov 2026): 5L @ 60 = 300. Payment: 50.
    // -> Payable before advance: 300. Advance applied: 200. Due after advance: 100.
    // -> Payment: 50 applied to due. Remaining due: 50, Advance: 0.
    const ledger = calculateCustomerLedger({
      entries: [
        { entryDate: '2026-10-15', liters: 10, price: 60, total: 600 },
        { entryDate: '2026-11-10', liters: 5, price: 60, total: 300 },
      ],
      payments: [
        { year: 2026, month: 10, receivedAmount: 800 },
        { year: 2026, month: 11, receivedAmount: 50 },
      ],
      targetYear: 2026,
      targetMonth: 11,
    });

    expect(ledger.grossPastDue).toBe(0);
    expect(ledger.grossPastAdvance).toBe(200);
    expect(ledger.thisMonthBill).toBe(300);
    expect(ledger.thisMonthPaid).toBe(50);
    expect(ledger.advanceApplied).toBe(200);
    expect(ledger.thisMonthDue).toBe(50);
    expect(ledger.netBalanceDue).toBe(50);
    expect(ledger.netAdvance).toBe(0);
  });

  it('Edge Case 11 & 12: Editing and deleting an existing bill dynamically recalculates future balances', () => {
    // Initial state: Oct bill 600, Oct payment 600 -> Nov opening 0. Nov bill 200 -> Nov due 200.
    const initialLedger = calculateCustomerLedger({
      entries: [
        { entryDate: '2026-10-15', liters: 10, price: 60, total: 600 },
        { entryDate: '2026-11-10', liters: 5, price: 40, total: 200 },
      ],
      payments: [{ year: 2026, month: 10, receivedAmount: 600 }],
      targetYear: 2026,
      targetMonth: 11,
    });
    expect(initialLedger.grossPastDue).toBe(0);
    expect(initialLedger.netBalanceDue).toBe(200);

    // Edit Oct bill from 600 to 400 (e.g. corrected quantity from 10 to 6.67):
    // Now Oct payment of 600 yields 200 advance!
    // Nov bill of 200 is completely absorbed by the 200 advance -> Nov netBalanceDue = 0!
    const editedLedger = calculateCustomerLedger({
      entries: [
        { entryDate: '2026-10-15', liters: 6.67, price: 60, total: 400 },
        { entryDate: '2026-11-10', liters: 5, price: 40, total: 200 },
      ],
      payments: [{ year: 2026, month: 10, receivedAmount: 600 }],
      targetYear: 2026,
      targetMonth: 11,
    });
    expect(editedLedger.grossPastAdvance).toBe(200);
    expect(editedLedger.advanceApplied).toBe(200);
    expect(editedLedger.netBalanceDue).toBe(0);

    // Delete Oct bill completely:
    // Entire 600 payment becomes advance. Nov bill of 200 consumes 200 advance -> Net advance remaining = 400!
    const deletedBillLedger = calculateCustomerLedger({
      entries: [
        { entryDate: '2026-11-10', liters: 5, price: 40, total: 200 },
      ],
      payments: [{ year: 2026, month: 10, receivedAmount: 600 }],
      targetYear: 2026,
      targetMonth: 11,
    });
    expect(deletedBillLedger.grossPastAdvance).toBe(600);
    expect(deletedBillLedger.advanceApplied).toBe(200);
    expect(deletedBillLedger.netBalanceDue).toBe(0);
    expect(deletedBillLedger.netAdvance).toBe(400);
  });

  it('Edge Case 13 & 14: Editing and deleting an existing payment dynamically recalculates balances', () => {
    // Oct bill 500, Oct payment 500. Nov bill 300, payment 0 -> Nov due 300.
    const baseline = calculateCustomerLedger({
      entries: [
        { entryDate: '2026-10-01', liters: 10, price: 50, total: 500 },
        { entryDate: '2026-11-01', liters: 6, price: 50, total: 300 },
      ],
      payments: [{ year: 2026, month: 10, receivedAmount: 500 }],
      targetYear: 2026,
      targetMonth: 11,
    });
    expect(baseline.grossPastDue).toBe(0);
    expect(baseline.netBalanceDue).toBe(300);

    // Edit payment: Oct payment increased to 700 -> creates 200 advance.
    // Nov bill 300 - 200 advance = 100 due.
    const paymentEdited = calculateCustomerLedger({
      entries: [
        { entryDate: '2026-10-01', liters: 10, price: 50, total: 500 },
        { entryDate: '2026-11-01', liters: 6, price: 50, total: 300 },
      ],
      payments: [{ year: 2026, month: 10, receivedAmount: 700 }],
      targetYear: 2026,
      targetMonth: 11,
    });
    expect(paymentEdited.grossPastAdvance).toBe(200);
    expect(paymentEdited.netBalanceDue).toBe(100);

    // Delete payment: Oct payment deleted (0 received).
    // Oct leaves 500 due. Nov bill 300 + 500 past due = 800 total due!
    const paymentDeleted = calculateCustomerLedger({
      entries: [
        { entryDate: '2026-10-01', liters: 10, price: 50, total: 500 },
        { entryDate: '2026-11-01', liters: 6, price: 50, total: 300 },
      ],
      payments: [],
      targetYear: 2026,
      targetMonth: 11,
    });
    expect(paymentDeleted.grossPastDue).toBe(500);
    expect(paymentDeleted.netBalanceDue).toBe(800);
  });

  it('Edge Case 15: Advance carried forward to the next month', () => {
    const ledger = calculateCustomerLedger({
      entries: [{ entryDate: '2026-09-01', liters: 1, price: 100, total: 100 }],
      payments: [{ year: 2026, month: 9, receivedAmount: 500 }],
      targetYear: 2026,
      targetMonth: 10,
    });
    expect(ledger.grossPastDue).toBe(0);
    expect(ledger.grossPastAdvance).toBe(400);
    expect(ledger.netAdvance).toBe(400);
    expect(ledger.netBalanceDue).toBe(0);
  });

  it('Edge Case 16: Customer with zero outstanding due and remaining advance', () => {
    const result = calculateBillingPeriod({
      entries: [{ liters: 2, price: 50 }], // 100
      availableAdvance: 350,
      paymentsReceived: 0,
    });
    expect(result.payableBeforeAdvance).toBe(100);
    expect(result.advanceApplied).toBe(100);
    expect(result.remainingDue).toBe(0);
    expect(result.remainingAdvance).toBe(250);
  });

  describe('Bug 2: Decimal Precision & Rate Calculations (57.25)', () => {
    it('accurately computes 57.25 milk rate for various quantities', () => {
      // 1 liter @ 57.25 = 57.25
      expect(calculateEntryTotal(1.0, 57.25)).toBe(57.25);

      // 2.5 liters @ 57.25 = 143.125 -> 143.13
      expect(calculateEntryTotal(2.5, 57.25)).toBe(143.13);

      // 30 liters @ 57.25 = 1717.50
      expect(calculateEntryTotal(30.0, 57.25)).toBe(1717.5);

      // 0.75 liters @ 57.25 = 42.9375 -> 42.94
      expect(calculateEntryTotal(0.75, 57.25)).toBe(42.94);
    });

    it('avoids floating point drift in monthly billing with 57.25 rate', () => {
      // 30 days of 1.5 L @ 57.25: each daily entry is 1.5 * 57.25 = 85.875 -> rounded to 85.88
      // 30 days * 85.88 = 2576.40
      const entries = Array.from({ length: 30 }, (_, i) => ({
        liters: 1.5,
        price: 57.25,
        entryDate: `2026-11-${String(i + 1).padStart(2, '0')}`,
      }));

      const summary = calculateBillingPeriod({
        entries,
        previousBalance: 0,
        paymentsReceived: 0,
      });

      expect(summary.totalQuantity).toBe(45.0);
      expect(summary.billingPeriodAmount).toBe(2576.4);
      expect(summary.remainingDue).toBe(2576.4);
    });
  });
});
