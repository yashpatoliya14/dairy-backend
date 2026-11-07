---
name: milk-report-export
description: >-
  Guide for generating dairy collection reports, shift summary exports, CSV downloads,
  PDF invoices, and ESC/POS thermal receipt formatting for milk collection centers.
  Use when building report tables, export endpoints, PDF bill generation, or thermal printing logic.
---

# Dairy Report & Export Generation Skill

This skill guides report aggregation, CSV/PDF export, and thermal receipt printing across the Milk Management platform.

## Report Types & Requirements

1. **Daily Shift Summary (Morning / Evening)**:
   - Date, Session, Total Customers, Total Liters Collected, Average Rate/Liter, Gross Amount.
2. **Customer Monthly Passbook / Statement**:
   - Date-by-date rows (Date, Morning Liters, Evening Liters, Total Liters, Rate, Amount).
   - Summary footer: Total Liters, Total Bill, Advance/Dues, Net Payable.
3. **Distributor Ledger Export**:
   - Master list of all customer totals for bi-monthly or monthly payout cycles.

---

## CSV Export Pattern (Backend or Frontend)

Keep CSV generation lightweight without heavy dependencies:

```typescript
export interface MilkEntryRow {
  date: string;
  customerNumber: string;
  customerName: string;
  liters: number;
  price: number;
  total: number;
}

export function generateMilkEntriesCsv(rows: MilkEntryRow[]): string {
  const headers = ['Date', 'Customer ID', 'Customer Name', 'Liters (L)', 'Rate (Rs)', 'Total (Rs)'];
  const csvLines = [headers.join(',')];

  for (const row of rows) {
    const escapedName = `"${row.customerName.replace(/"/g, '""')}"`;
    csvLines.push([
      row.date,
      row.customerNumber,
      escapedName,
      row.liters.toFixed(2),
      row.price.toFixed(2),
      row.total.toFixed(2),
    ].join(','));
  }

  return csvLines.join('\n');
}
```

---

## Thermal Receipt Formatting (58mm / 80mm)

For Bluetooth or USB thermal receipt printers in dairy collection centers:
- Width: **32 characters** (58mm) or **48 characters** (80mm).
- Monospace formatting with fixed-width column padding:

```text
================================
     SHREE DAIRY COLLECTION     
================================
Date: 24/10/2026   Shift: MORNING
C-No: 042          Ramesh Patel
--------------------------------
Qty (Liters) :            12.50 L
Rate / Liter :          ₹ 62.00
--------------------------------
TOTAL AMOUNT :         ₹ 775.00
--------------------------------
Thank you! Visit again.
================================
```

---

## PDF Invoice Generation Best Practices
- In Next.js / React: Use lightweight print CSS (`@media print`) or browser `window.print()` with a dedicated print layout (`/billing/[id]/print`).
- Avoid bundling heavy PDF rasterizers in client bundles; prefer clean HTML print stylesheets or lightweight serverless PDF generation.
