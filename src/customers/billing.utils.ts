// Decimal-safe dairy billing & milk accounting utility

export function roundToCurrency(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function calculateEntryTotal(liters: number, pricePerLiter: number): number {
  if (liters <= 0 || pricePerLiter <= 0) return 0;
  // Guard against float precision drift before rounding
  const raw = (liters * 1000 * pricePerLiter) / 1000;
  return roundToCurrency(raw);
}

export interface ShiftMilkRecord {
  liters: number;
  price: number;
  shift?: 'morning' | 'evening' | 'full';
  total?: number;
  date?: string | Date;
}

export interface BillingSummaryParams {
  entries: ShiftMilkRecord[];
  previousBalance?: number;
  previousDue?: number;
  openingDue?: number;
  availableAdvance?: number;
  paymentsReceived?: number;
  adjustmentsOrCharges?: number;
  discounts?: number;
}

export interface BillingPeriodResult {
  totalQuantity: number;
  billingPeriodAmount: number;
  previousBalance: number;
  previousDue: number;
  availableAdvance: number;
  charges: number;
  discounts: number;
  payableBeforeAdvance: number;
  advanceApplied: number;
  dueAfterAdvance: number;
  payments: number;
  paymentsReceived: number;
  paymentsAppliedToDue: number;
  remainingDue: number;
  remainingAdvance: number;
  excessPayment: number;
  netPayable: number;
  remainingBalance: number;
}

/**
 * Single-period calculation implementing Master Prompt accounting rules:
 * Rule 1: Payable Before Advance = Previous Due + Current Bill Total + Charges - Discounts
 *         Advance Applied = MIN(Available Advance, Payable Before Advance)
 *         Remaining Due = Payable Before Advance - Advance Applied
 * Rule 2: Customer payment reduces due first; excess payment converts into advance balance
 * Rule 3: Unused advance is retained and carried forward
 */
export function calculateBillingPeriod(params: BillingSummaryParams): BillingPeriodResult {
  let totalQuantity = 0;
  let billingPeriodAmount = 0;

  for (const entry of params.entries) {
    const liters = Math.max(0, Number(entry.liters) || 0);
    const price = Math.max(0, Number(entry.price) || 0);
    const lineTotal =
      entry.total !== undefined ? roundToCurrency(Number(entry.total)) : calculateEntryTotal(liters, price);

    totalQuantity += liters;
    billingPeriodAmount += lineTotal;
  }

  totalQuantity = roundToCurrency(totalQuantity);
  billingPeriodAmount = roundToCurrency(billingPeriodAmount);

  const rawPrevBalance = Number(
    params.previousDue ?? (params as any).openingDue ?? params.previousBalance
  ) || 0;
  let previousDue = 0;
  let availableAdvance = Math.max(0, Number(params.availableAdvance) || 0);

  if (rawPrevBalance > 0) {
    previousDue = roundToCurrency(rawPrevBalance);
  } else if (rawPrevBalance < 0 && availableAdvance === 0) {
    // Legacy convention where negative previousBalance indicated advance credit
    availableAdvance = roundToCurrency(Math.abs(rawPrevBalance));
  }

  const charges = roundToCurrency(Math.max(0, Number(params.adjustmentsOrCharges) || 0));
  const discounts = roundToCurrency(Math.max(0, Number(params.discounts) || 0));
  const paymentsReceived = roundToCurrency(Math.max(0, Number(params.paymentsReceived) || 0));

  // Rule 1: Net payable before applying available advance
  const grossPayable = roundToCurrency(billingPeriodAmount + previousDue + charges - discounts);
  const payableBeforeAdvance = Math.max(0, grossPayable);

  // Advance Applied = min(Available Advance, Payable Before Advance)
  const advanceApplied = roundToCurrency(Math.min(availableAdvance, payableBeforeAdvance));

  // Due After Advance = Payable Before Advance - Advance Applied (never negative)
  const dueAfterAdvance = roundToCurrency(Math.max(0, payableBeforeAdvance - advanceApplied));

  // Advance remaining after applying to bill
  const unusedAdvance = roundToCurrency(Math.max(0, availableAdvance - advanceApplied));

  // Rule 2: Payment applied to outstanding due first
  const paymentsAppliedToDue = roundToCurrency(Math.min(paymentsReceived, dueAfterAdvance));
  const remainingDue = roundToCurrency(Math.max(0, dueAfterAdvance - paymentsAppliedToDue));

  // Excess payment converts into advance balance
  const excessPayment = roundToCurrency(Math.max(0, paymentsReceived - dueAfterAdvance));
  const remainingAdvance = roundToCurrency(unusedAdvance + excessPayment);

  return {
    totalQuantity,
    billingPeriodAmount,
    previousBalance: previousDue,
    previousDue,
    availableAdvance,
    charges,
    discounts,
    payableBeforeAdvance,
    advanceApplied,
    dueAfterAdvance,
    payments: paymentsReceived,
    paymentsReceived,
    paymentsAppliedToDue,
    remainingDue,
    remainingAdvance,
    excessPayment,
    netPayable: remainingDue,
    remainingBalance: remainingDue > 0 ? remainingDue : (remainingAdvance > 0 ? -remainingAdvance : 0),
  };
}

/**
 * Authoritative central billing calculation function.
 * Alias for calculateBillingPeriod for backwards compatibility.
 */
export function calculateBillingPeriodSummary(params: BillingSummaryParams): BillingPeriodResult {
  return calculateBillingPeriod(params);
}

export interface RawMilkRecord {
  entryDate: Date | string;
  liters: number | string;
  price: number | string;
  total?: number | string | null;
}

export interface RawPaymentRecord {
  year: number;
  month: number;
  billAmount?: number | string;
  receivedAmount: number | string;
  note?: string | null;
  receivedDate?: Date | string | null;
}

export interface CustomerLedgerSummary {
  year: number;
  month: number;
  totalQuantity: number;
  thisMonthBill: number;
  thisMonthPaid: number;
  thisMonthDue: number;
  activeDays: number;
  grossPastDue: number;
  grossPastAdvance: number;
  pastMonthsDue: number;
  pastMonthsAdvance: number;
  pastMonthsBreakdown: string[];
  netBalanceDue: number;
  netAdvance: number;
  advanceApplied: number;
  payableBeforeAdvance: number;
  paymentNote: string;
  paymentDate: string | null;
  hasPayment: boolean;
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Chronological ledger calculator across all billing months for a customer.
 * Rolls forward opening dues, available advances, deliveries, and payments
 * to strictly adhere to Rule 1, 2, 3, 4, 5.
 */
export function calculateCustomerLedger(params: {
  entries: RawMilkRecord[];
  payments: RawPaymentRecord[];
  targetYear: number;
  targetMonth: number;
  defaultPrice?: number;
}): CustomerLedgerSummary {
  const { entries, payments, targetYear, targetMonth, defaultPrice = 0 } = params;

  // 1. Group milk entries by 'YYYY-MM'
  const entriesByMonth = new Map<string, ShiftMilkRecord[]>();
  for (const entry of entries) {
    const rawDate = entry.entryDate;
    const dateStr =
      typeof rawDate === 'string'
        ? rawDate.slice(0, 10)
        : rawDate instanceof Date && !Number.isNaN(rawDate.getTime())
          ? rawDate.toISOString().slice(0, 10)
          : String(rawDate ?? '').slice(0, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
    const monthKey = dateStr.slice(0, 7);

    const liters = Math.max(0, Number(entry.liters) || 0);
    const price = Math.max(0, Number(entry.price) || defaultPrice);
    const lineTotal =
      entry.total != null && Number(entry.total) >= 0
        ? roundToCurrency(Number(entry.total))
        : calculateEntryTotal(liters, price);

    if (!entriesByMonth.has(monthKey)) entriesByMonth.set(monthKey, []);
    entriesByMonth.get(monthKey)!.push({
      liters,
      price,
      total: lineTotal,
      date: dateStr,
    });
  }

  // 2. Group payments by 'YYYY-MM'
  const paymentsByMonth = new Map<string, RawPaymentRecord>();
  for (const p of payments) {
    const key = `${p.year}-${String(p.month).padStart(2, '0')}`;
    paymentsByMonth.set(key, p);
  }

  // 3. Find all distinct months from earliest up to targetYear-targetMonth
  const targetKey = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
  const allMonthKeys = new Set<string>();
  allMonthKeys.add(targetKey);

  for (const k of entriesByMonth.keys()) {
    if (k <= targetKey) allMonthKeys.add(k);
  }
  for (const k of paymentsByMonth.keys()) {
    if (k <= targetKey) allMonthKeys.add(k);
  }

  const sortedMonths = Array.from(allMonthKeys).sort();

  let rollingDue = 0;
  let rollingAdvance = 0;
  const pastMonthsBreakdown: string[] = [];

  let targetSummary: CustomerLedgerSummary | null = null;

  for (const monthKey of sortedMonths) {
    const [yStr, mStr] = monthKey.split('-');
    const curY = Number.parseInt(yStr, 10);
    const curM = Number.parseInt(mStr, 10);
    const isTarget = monthKey === targetKey;

    const monthEntries = entriesByMonth.get(monthKey) ?? [];
    const payment = paymentsByMonth.get(monthKey);
    const paymentReceived = payment ? Math.max(0, Number(payment.receivedAmount) || 0) : 0;

    const openingDueForMonth = rollingDue;
    const openingAdvanceForMonth = rollingAdvance;

    const result = calculateBillingPeriod({
      entries: monthEntries,
      openingDue: openingDueForMonth,
      availableAdvance: openingAdvanceForMonth,
      paymentsReceived: paymentReceived,
    });

    if (!isTarget) {
      const monthDiff = roundToCurrency(result.billingPeriodAmount - paymentReceived);
      const mName = MONTH_NAMES[curM - 1] ?? monthKey;
      if (monthDiff > 0) {
        pastMonthsBreakdown.push(`${mName} ${curY}: ₹${monthDiff.toFixed(2)} bill`);
      } else if (monthDiff < 0) {
        pastMonthsBreakdown.push(`${mName} ${curY}: +₹${Math.abs(monthDiff).toFixed(2)} paid`);
      }
    }

    rollingDue = result.remainingDue;
    rollingAdvance = result.remainingAdvance;

    if (isTarget) {
      let activeDays = 0;
      for (const e of monthEntries) {
        if (e.liters > 0) activeDays++;
      }

      // Past months remaining due after advance applied to it
      const pastDueAfterAdvance = Math.max(0, openingDueForMonth - result.advanceApplied);
      const paymentTowardsPast = Math.min(paymentReceived, pastDueAfterAdvance);
      const remainingPastDue = roundToCurrency(Math.max(0, pastDueAfterAdvance - paymentTowardsPast));

      // Current month due
      const curMonthPayable = result.billingPeriodAmount;
      const advanceLeftForCur = Math.max(0, result.advanceApplied - openingDueForMonth);
      const curDueAfterAdvance = Math.max(0, curMonthPayable - advanceLeftForCur);
      const paymentLeftForCur = Math.max(0, paymentReceived - pastDueAfterAdvance);
      const thisMonthDue = roundToCurrency(Math.max(0, curDueAfterAdvance - paymentLeftForCur));

      const paymentNote = payment?.note ?? '';
      const rawDate = payment?.receivedDate;
      const paymentDate = rawDate
        ? rawDate instanceof Date
          ? rawDate.toISOString()
          : String(rawDate)
        : null;

      targetSummary = {
        year: targetYear,
        month: targetMonth,
        totalQuantity: result.totalQuantity,
        thisMonthBill: result.billingPeriodAmount,
        thisMonthPaid: roundToCurrency(paymentReceived),
        thisMonthDue,
        activeDays,
        grossPastDue: openingDueForMonth,
        grossPastAdvance: openingAdvanceForMonth,
        pastMonthsDue: remainingPastDue,
        pastMonthsAdvance: openingAdvanceForMonth,
        pastMonthsBreakdown,
        netBalanceDue: result.remainingDue,
        netAdvance: result.remainingAdvance,
        advanceApplied: result.advanceApplied,
        payableBeforeAdvance: result.payableBeforeAdvance,
        paymentNote,
        paymentDate,
        hasPayment: Boolean(payment),
      };
    }
  }

  if (!targetSummary) {
    targetSummary = {
      year: targetYear,
      month: targetMonth,
      totalQuantity: 0,
      thisMonthBill: 0,
      thisMonthPaid: 0,
      thisMonthDue: 0,
      activeDays: 0,
      grossPastDue: rollingDue,
      grossPastAdvance: rollingAdvance,
      pastMonthsDue: rollingDue,
      pastMonthsAdvance: rollingAdvance,
      pastMonthsBreakdown,
      netBalanceDue: rollingDue,
      netAdvance: rollingAdvance,
      advanceApplied: 0,
      payableBeforeAdvance: rollingDue,
      paymentNote: '',
      paymentDate: null,
      hasPayment: false,
    };
  }

  return targetSummary;
}
