---
name: whatsapp-dairy-notifications
description: >-
  Runbook for WhatsApp Cloud API integration in the Milk Management system. Use when modifying or adding
  WhatsApp notifications, daily milk collection receipts, monthly bill templates, phone normalization,
  bulk batch dispatch, webhook handling, or Vitest WhatsApp mocks.
---

# WhatsApp Dairy Notifications Skill

This skill standardizes the WhatsApp Cloud API integration for automated dairy receipts, billing, and farmer/customer alerts.

## Key Service Architecture

The WhatsApp service is located at:
`d:\Recap_Milk_MAnagement\Milk_Management_Admin_Panel\backend\src\whatsapp\whatsapp.service.ts`

### Environment Configuration Required
```env
WHATSAPP_API_TOKEN=<Meta_User_or_System_User_Token>
WHATSAPP_PHONE_NUMBER_ID=<Meta_Phone_Number_ID>
WHATSAPP_BUSINESS_ACCOUNT_ID=<Meta_WABA_ID>
WHATSAPP_WEBHOOK_VERIFY_TOKEN=<Custom_Verify_Token>
```

---

## Phone Number Sanitization Rules

Always sanitize recipient phone numbers before calling the Meta API:
1. Strip all non-digit characters (`+`, spaces, dashes, parentheses).
2. If phone has 10 digits (standard Indian mobile e.g. `9876543210`), prepend country code `91` -> `919876543210`.
3. If phone starts with `0`, strip leading zero before prepending country code.
4. Target format: E.164 without `+` prefix (Meta format: `919104152524`).

```typescript
export function sanitizePhoneNumber(phone: string, defaultCountryCode = '91'): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${defaultCountryCode}${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `${defaultCountryCode}${digits.slice(1)}`;
  }
  return digits;
}
```

---

## Message Formats & Templates

### 1. Daily Milk Delivery Receipt (Direct Text / Template)
Format for daily collection confirmation:
```text
🥛 *Dairy Collection Receipt*
Date: {date} ({session})
Customer: {customerName} (ID: {uniqueNumber})
--------------------------------
Quantity: {liters} L
Rate: ₹{ratePerLiter} / L
Amount: ₹{totalAmount}
--------------------------------
Thank you for your business!
```

### 2. Monthly Settlement / Bill Summary
```text
📊 *Monthly Milk Bill - {monthName}*
Customer: {customerName} (ID: {uniqueNumber})
--------------------------------
Total Days: {totalDays}
Total Milk: {totalLiters} L
Average Rate: ₹{ratePerLiter} / L
Monthly Total: ₹{monthlyAmount}
Previous Dues: ₹{previousDue}
*Net Payable: ₹{netPayable}*
--------------------------------
Please settle the bill before {dueDate}.
```

---

## Bulk Dispatch & Rate Limiting

- When sending bills to hundreds of customers at month-end:
  - Batch in chunks of **20 to 50 messages** with a 200–500ms delay between chunks to avoid Meta API tier rate limits.
  - Record per-recipient status (`sent`, `failed`, `errorMsg`) in `BulkMessageResult`.
  - Always catch Axios errors and avoid failing the entire batch if one phone number is invalid.

---

## Webhook Verification Best Practices
- Verify `hub.mode === 'subscribe'` and `hub.verify_token === configService.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN')`.
- Return `hub.challenge` with HTTP 200 immediately.
- Handle delivery status updates (`delivered`, `read`, `failed`) asynchronously.
