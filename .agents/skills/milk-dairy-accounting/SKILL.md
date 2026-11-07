---
name: milk-dairy-accounting
description: >-
  Expert domain runbook for milk collection calculations, dairy accounting, rate chart formulas,
  shift ledger aggregation, and precision-safe financial computations. Use whenever writing,
  auditing, or modifying milk entry calculations, customer billing, distributor summaries, or pricing logic
  across NestJS backend, React frontend, and Flutter mobile app.
---

# Milk & Dairy Accounting Domain Guide

This skill guides calculations, ledger management, shift aggregation, and financial rounding for the Dairy & Milk Management ecosystem.

## Core Dairy Calculations & Formulas

### 1. Fixed Rate per Liter Calculation
Used in the current `MilkEntry` entity:
$$\text{Total} = \text{round}_2(\text{Liters} \times \text{Price})$$

- **Liters**: Decimal precision $(10, 2)$, e.g., $1.50$ liters.
- **Price**: Rate per liter in local currency $(10, 2)$, e.g., ₹$60.00$.
- **Total**: Computed total $(12, 2)$, e.g., ₹$90.00$.

### 2. Quality-Based Pricing (FAT & SNF Matrix)
When milk quality testing is used:
- **CLR to SNF Conversion Formula**:
  $$\text{SNF} = \frac{\text{CLR}}{4} + (0.25 \times \text{FAT}) + 0.36$$
  *(Where $\text{CLR}$ is Corrected Lactometer Reading at 20°C or 29°C calibrated).*
- **Total Solids (TS) Method**:
  $$\text{Total Solids} = \text{FAT} + \text{SNF}$$
- **Fat-Based Pricing**:
  $$\text{Rate per Liter} = \text{FAT} \times \text{Fat Rate per Point} + \text{SNF} \times \text{SNF Rate per Point}$$

---

## Financial Precision & Rounding Rules

> [!CRITICAL]
> **Never rely on naive JavaScript/Dart floating point math for money!**
> `0.1 + 0.2 === 0.30000000000000004` will corrupt distributor ledgers over time.

### In TypeScript / NestJS (Backend & Frontend):
```typescript
// Safe 2-decimal financial rounding helper
export function roundToCurrency(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

// Compute Milk Entry Total
export function calculateMilkTotal(liters: number, pricePerLiter: number): number {
  const rawTotal = (liters * 1000 * pricePerLiter) / 1000;
  return roundToCurrency(rawTotal);
}
```

### In Dart (Flutter Mobile App):
```dart
double roundCurrency(double amount) {
  return double.parse(amount.toStringAsFixed(2));
}

double calculateEntryTotal(double liters, double price) {
  return roundCurrency(liters * price);
}
```

---

## Ledger & Shift Reconciliation

### 1. Shift Partitioning
- Dairy operations strictly segment daily entries into **Morning (M)** and **Evening (E)** shifts.
- When generating reports, allow aggregation by:
  - Date Range (e.g., 1st to 15th, 16th to end of month for bi-monthly dairy payout cycles).
  - Customer ID (`cid`) within a Distributor ID (`did`).

### 2. Customer Statement Ledger Formula
$$\text{Closing Balance} = \text{Opening Balance} + \sum (\text{Milk Deliveries}) - \sum (\text{Cash / Bank Payments})$$

### 3. Distributor Aggregates
- **Total Volume (Liters)**: Sum of all customer entries in date window.
- **Total Payout (Currency)**: Sum of all customer totals in date window.
- **Average Price / Liter**: $\frac{\text{Total Payout}}{\text{Total Liters}}$.

---

## Validation Checklist for Changes
1. **Zero & Negative Value Guard**: Liters and Price must strictly be $> 0$. Prevent negative submissions at controller validation pipe level (`@IsPositive()`).
2. **Entity Consistency**: Ensure `MilkEntry.total` matches `MilkEntry.liters * MilkEntry.price`.
3. **Database Constraints**: Verify unique constraints (`@Unique(['customer', 'entryDate'])`) are handled with graceful conflict reporting (HTTP 409 Conflict instead of unhandled 500 server crashes).
