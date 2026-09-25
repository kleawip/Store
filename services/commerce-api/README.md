# Kleawip commerce API

Owner: Claude Code (backend). The contract is in `docs/api/API_CONTRACT.md` and the shared Zod types are in `packages/contract`.

Status: **scaffold with demo data only.** Implemented: `GET /health`, `GET /v1/store/categories` and `GET /v1/store/products` (filter, search, cursor paging). Nothing is purchasable: every product returns `priceStatus: "pending"` and `availability: "not_for_sale"` until the client approves SKUs and prices.

## Requirements

- Node.js 22+
- PostgreSQL 16. Locally this is Postgres.app on `localhost:5432`, with databases `kleawip_dev` and `kleawip_test`.

## Commands (run from `WEBSITE DATA/project`)

```bash
npm install                       # installs packages/* and services/* (not apps/storefront)
cp services/commerce-api/.env.example services/commerce-api/.env
npm run db:migrate                # applies database/migrations to DATABASE_URL
npm run db:seed:demo              # replaces catalogue rows with the demo fixture (refuses in production)
npm run api:dev                   # http://127.0.0.1:4000 with reload
npm run api:typecheck
npm run api:test                  # resets and migrates kleawip_test, then runs every test
```

After you change `src/db/schema.ts`, run `npm run db:generate`. This writes a new SQL migration to `database/migrations/`; review it before applying.

## Demo data

`database/seeds/demo/catalogue.json` was copied from the storefront preview catalogue on 25 September 2026. Every row is `isDemo: true`. It has no prices, SKUs or stock, and its alt text is placeholder. It is not client-approved data.

## Known issue

`npm audit` reports moderate advisories in `esbuild`, which comes in through `drizzle-kit`. That is a dev-only migration generator and is never deployed. The only fix npm offers is a breaking downgrade, so re-check when `drizzle-kit` releases an update.
