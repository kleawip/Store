# ADR 0001: Backend stack and core conventions

- **Status:** Proposed. Awaiting owner approval (Open request #3 in `docs/coordination/HANDOFF_LOG.md`). Everything below is already implemented, so approving it records reality, and rejecting it would mean rework.
- **Date:** 25 September 2026
- **Deciders:** project owner (MarketiX Studio); proposed by Claude Code (backend)
- **Context documents:** `IMPLEMENTATION_PLAN.md` §4 (architecture "proposed until an ADR is approved"), `docs/api/API_CONTRACT.md`

## Context

Kleawip needs a custom, **single-tenant** commerce backend: one brand, INR, India. It will be hosted on Railway alongside a Vercel storefront, and it has to be maintainable by a small team using AI coding assistants. Money, stock and orders must be exact and auditable.

## Decision

| Concern | Choice | Why this over the alternatives |
| --- | --- | --- |
| Language | TypeScript (Node.js 22 LTS) | Same language as the Next.js storefront and admin, so request and response types are shared (`packages/contract`) instead of duplicated. Python/Django or Go would split the codebase. |
| HTTP framework | Fastify 5 | Fast, small and plugin-based (cookies, CORS, helmet, rate limits, multipart). NestJS adds heavy structure a single-tenant app doesn't need. Express lacks built-in async error handling and schema hooks. |
| Validation and contract | Zod 4 in `packages/contract` | One definition gives both runtime validation (API) and compile-time types (both apps). |
| Database | PostgreSQL 16 | Transactions, row locks (`SELECT … FOR UPDATE`) for stock, CHECK constraints for money and stock rules, and JSONB for audit. Available on Railway. |
| Data access | Drizzle ORM + generated SQL migrations | Typed queries that stay close to SQL, and plain reviewable migration files in `database/migrations`. Prisma's runtime and query engine are heavier and hide SQL. |
| Tests | Vitest against a **real** Postgres (`kleawip_test`) | Constraints and locks are part of the correctness story; mocks would hide them. |
| Images | `sharp`: decode, re-encode to WebP, strip metadata | The upload's bytes decide its type, and GPS/EXIF is removed. Storage sits behind a `MediaStorage` interface; the production provider (S3/R2) is a Phase 0 decision. |
| Auth (staff) | Server sessions: an httpOnly cookie holding a random token, stored only as a SHA-256 hash; scrypt passwords; CSRF header; lockout plus per-IP rate limits; invite links | Revocable instantly (disable or role change ends sessions), which JWTs can't do. No third-party identity provider is needed for a handful of staff. |

## Conventions that follow from this

1. **Money is an integer number of paise.** A `null` price means "not approved yet", and it's never guessed. GST is stored in basis points.
2. **A SKU is the unit of sale and of stock.** A pack either shares single-unit stock (`inventory_units_per_sale = pack size`) or has its own pre-packed stock. The client decides per product.
3. **Stock can never go negative.** A database CHECK enforces `available = on_hand − committed − unavailable ≥ 0`. Every change writes an `inventory_movements` row.
4. **Every admin write is audited in the same transaction** (`audit_events`), with the actor, before/after values and optional staff comments.
5. **Public reads only ever return published records.** Drafts never leak into search, collections or the home page.
6. **Nothing becomes a customer-facing claim without approval.** Offer wording is blocked until the offer engine exists, badges are null, and there are no fabricated reviews.
7. **Single-tenant by design.** There are no store, market, currency, plan or app-platform tables.

## Consequences

- **Positive:**
  - Shared types catch frontend/backend drift at compile time.
  - Money and stock rules are enforced twice, in code and in the database.
  - It's cheap to run on one Railway service plus Postgres.
- **Negative:**
  - The team must know TypeScript and SQL.
  - Drizzle is younger than Prisma.
  - Server sessions need a database round-trip per admin request. That's acceptable at staff scale.
- **Revisit if:**
  - Kleawip needs multi-region hosting;
  - background jobs outgrow a Postgres-backed queue (add Redis then);
  - staff sign-in must move to Google Workspace SSO.
