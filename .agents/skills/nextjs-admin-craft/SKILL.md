---
name: nextjs-admin-craft
description: >-
  Engineering runbook for Next.js App Router admin dashboards, portal websites, and SSR/SSG workflows.
  Use when building, refactoring, or optimizing Next.js code, Server Components, Server Actions,
  API Route Handlers, Radix/Shadcn UI tables, forms, and Vercel deployments in the Milk Management project.
---

# Next.js App Router & Admin Panel Craftsmanship Guide

This skill guides development, state management, data fetching, and performance optimization for Next.js applications (`Milk_Management_Website` and Next.js admin dashboards).

## Architecture & App Router Structure

Follow the Next.js 14/15 App Router architecture:
```text
app/
├── (auth)/             # Route group: login, signup, password reset
│   ├── login/page.tsx
│   └── layout.tsx
├── (dashboard)/        # Route group: protected admin portal
│   ├── layout.tsx      # Sidebar, top navigation, distributor session provider
│   ├── page.tsx        # Dashboard metrics overview (Total Milk, Today Payout, Customer Count)
│   ├── entries/        # Daily milk collection entry table & batch form
│   ├── customers/      # Customer register, search, and rate overrides
│   └── billing/        # Monthly settlement statements & WhatsApp trigger
├── api/                # Route handlers (webhooks, PDF generators, public endpoints)
│   └── whatsapp/route.ts
├── layout.tsx          # Root layout with fonts, theme, global toast providers
└── globals.css         # Tailwind directives & CSS variables
```

---

## Server vs. Client Component Rules

To maximize performance and minimize JavaScript bundle size:

1. **Default to Server Components (RSC)**:
   - Data fetching from NestJS backend or direct database queries should happen directly in Server Components using async/await.
   - Keep secret API keys, tokens, and heavy parsers on the server.
2. **Use `'use client'` strictly for interactivity**:
   - Interactive UI elements: forms with real-time validation, modals/dialogs, dropdowns (Radix UI), search input with debounce, and tab switchers.
   - Keep client component leaves as small as possible at the bottom of the tree.

---

## Server Actions for Form Submissions

Use Next.js Server Actions for data mutations (adding a milk entry, creating a customer):

```typescript
// app/actions/milk-entries.ts
'use server';

import { revalidatePath } from 'next/cache';

export async function recordMilkEntry(prevState: any, formData: FormData) {
  const customerId = formData.get('customerId') as string;
  const liters = parseFloat(formData.get('liters') as string);
  const price = parseFloat(formData.get('price') as string);

  if (isNaN(liters) || liters <= 0 || isNaN(price) || price <= 0) {
    return { error: 'Invalid liters or price amount' };
  }

  const response = await fetch(`${process.env.BACKEND_API_URL}/customers/${customerId}/entries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}`,
    },
    body: JSON.stringify({ liters, price, entryDate: new Date().toISOString() }),
  });

  if (!response.ok) {
    return { error: 'Failed to record entry in backend' };
  }

  revalidatePath('/entries');
  return { success: true };
}
```

---

## Data Fetching & Caching Conventions

1. **Tag-based Revalidation**:
   - Tag fetches with cache keys (`tags: ['customers', distributorId]`).
   - Trigger `revalidateTag('customers')` on customer create/update.
2. **Handling Dynamic Pages**:
   - Pages requiring fresh shift data must use `export const dynamic = 'force-dynamic'` or `revalidate = 0`.
3. **Environment Variables**:
   - Prefix public client-side variables with `NEXT_PUBLIC_` (e.g. `NEXT_PUBLIC_API_URL`).
   - Server-only secrets (`JWT_SECRET`, `WHATSAPP_TOKEN`) must NEVER have `NEXT_PUBLIC_`.

---

## UI Components & Radix / Tailwind Best Practices
- Combine Radix UI primitives with Tailwind via `class-variance-authority` (cva) and `clsx`/`tailwind-merge` (`cn` helper).
- Ensure mobile responsiveness for dairy operators accessing the admin panel on tablets or smartphones.
