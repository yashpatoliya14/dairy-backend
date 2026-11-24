# Changelog

All notable changes to the Milk Management System backend will be documented in this file.

## [1.0.24] - 2026-11-24

### Critical Bug Fix Release — Billing, Precision & WhatsApp Consolidation

#### Bug 1: Correct Bill, Advance, Payment & Due Calculations
- Implemented single source of truth customer ledger calculation in `billing.utils.ts` adhering to accounting rules:
  - `Payable Before Advance = Previous Due + Current Bill Total`
  - `Advance Applied = MIN(Available Advance, Payable Before Advance)`
  - `Remaining Due = Payable Before Advance - Advance Applied` (strictly $\ge 0$, never negative)
  - Excess customer payments convert into `remainingAdvance` and roll forward chronologically.
- Refactored `getMonthlyBillsSummary` in `customers.service.ts` to process full customer transaction history chronologically, removing the 3-month truncation and 50-paise rounding heuristics.
- Added 16 mandatory automated edge-case tests in `billing-calculations.spec.ts`.

#### Bug 2: Decimal Precision & Rate Arithmetic Hardening (57.25)
- Standardized all monetary calculations and rounding boundaries across services and utilities using `roundToCurrency()` (`Math.round((amount + Number.EPSILON) * 100) / 100`).
- Prevented IEEE 754 floating-point drift across milk rates, quantities, and totals.
- Created safe, transactional database data-fix and migration script `src/migrations/data-fix-5730-to-5725.sql` with preview queries and rollback guidance.

#### Bug 3: Consolidate Daily WhatsApp Message Templates
- Consolidated all daily message sending paths (`sendDailyEntry`, `sendDailyEntryBulk`, `sendBillMessage`, `sendMilkEntryMessage`) onto the Meta-approved 9-parameter template: `daily_milk_delivery_update` (`en`).
- Centralized message generation into `buildDailyMilkDeliveryParameters` and `buildDailyMilkDeliveryTextMessage`.
- Connected daily WhatsApp notifications directly to the customer ledger service so accurate month-to-date bills and outstanding dues are included in every notification.
- Configured `WHATSAPP_DAILY_TEMPLATE_NAME=daily_milk_delivery_update` in `.env`.
