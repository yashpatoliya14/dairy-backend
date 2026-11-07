---
name: mikroorm-nestjs-craft
description: >-
  Specialized engineering standards and runbook for NestJS backend with MikroORM PostgreSQL. Use when
  creating, editing, or refactoring backend controllers, services, entities, DTOs, migrations,
  database transactions, and Vitest test suites.
---

# NestJS + MikroORM PostgreSQL Craftsmanship Guide

This skill guides backend architecture, data integrity, transactional safety, and testing for the Milk Management Backend.

## Entity & Repository Patterns

### 1. Multi-Tenant Scoping
Every customer, distributor setting, and milk entry belongs to a specific user/distributor.
- **Never perform unbounded queries**: Always filter by `distributor` or `user` ID to maintain tenant isolation.
```typescript
const customer = await this.customers.findOne({
  cid: customerId,
  distributor: distributor.did,
});
if (!customer) {
  throw new NotFoundException('Customer not found for distributor');
}
```

### 2. Transactional Safety for Shift Entries
When logging bulk milk collections during morning/evening shifts:
- Always wrap batch insertions in an `em.transactional()` block so that a failure on customer #40 doesn't leave customers #1–39 in a half-committed state.

```typescript
const em = this.entries.getEntityManager();
await em.transactional(async (forkedEm) => {
  for (const item of bulkEntries) {
    const entry = forkedEm.create(MilkEntry, {
      eid: randomUUID(),
      customer: item.customer,
      distributor: distributor,
      user: user,
      entryDate: item.entryDate,
      liters: item.liters,
      price: item.price,
      total: calculateMilkTotal(item.liters, item.price),
    });
    forkedEm.persist(entry);
  }
  await forkedEm.flush();
});
```

### 3. Graceful Unique Constraint Conflict Handling
The entity defines:
`@Unique({ properties: ['customer', 'entryDate'] })`

If an entry already exists for a customer on that date:
- Catch `UniqueConstraintViolationException` from `@mikro-orm/core`.
- Return HTTP 409 Conflict with a helpful message: `"Milk entry already recorded for this customer on date"`.

---

## DTO & Input Validation Standards

1. Use `class-validator` and `class-transformer` decorators on every DTO.
2. Trim whitespace on string inputs (`@Transform(({ value }) => typeof value === 'string' ? value.trim() : value)`).
3. Validate positive numbers for `liters` and `price` (`@IsPositive()`, `@IsNumber()`).
4. Validate phone numbers with regex matching standard E.164 or 10-digit formats.

---

## Migrations Workflow

1. Update or create the entity in `src/entities/`.
2. Generate migration:
   ```bash
   npm run migration:create
   # or npx mikro-orm migration:create
   ```
3. Inspect the generated migration in `src/migrations/`.
4. Run migrations:
   ```bash
   npm run migration:up
   ```

---

## Vitest Testing Guidelines

- Keep unit tests fast and mock MikroORM entity repositories.
- Use `mockReturnValue` / `mockResolvedValue` for repository find, persist, flush.
- Test both the happy path and edge cases (e.g. duplicate dates, non-existent customer, zero liters).
