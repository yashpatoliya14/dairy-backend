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
}

export interface BillingSummaryParams {
  entries: ShiftMilkRecord[];
  previousBalance?: number;
  paymentsReceived?: number;
  adjustmentsOrCharges?: number;
  discounts?: number;
}

export interface BillingPeriodResult {
  totalQuantity: number;
  billingPeriodAmount: number;
  previousBalance: number;
  charges: number;
  discounts: number;
  payments: number;
  netPayable: number;
  remainingBalance: number;
}

export function calculateBillingPeriodSummary(params: BillingSummaryParams): BillingPeriodResult {
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

  const previousBalance = roundToCurrency(Number(params.previousBalance) || 0);
  const charges = roundToCurrency(Number(params.adjustmentsOrCharges) || 0);
  const discounts = roundToCurrency(Number(params.discounts) || 0);
  const payments = roundToCurrency(Number(params.paymentsReceived) || 0);

  // Net Payable = Billing Period Amount + Previous Outstanding + Charges - Discounts - Payments
  const netPayable = roundToCurrency(billingPeriodAmount + previousBalance + charges - discounts - payments);
  const remainingBalance = netPayable;

  return {
    totalQuantity,
    billingPeriodAmount,
    previousBalance,
    charges,
    discounts,
    payments,
    netPayable,
    remainingBalance,
  };
}
