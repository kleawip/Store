# Kleawip commerce API

Owner: Claude Code (backend). The contract is in `docs/api/API_CONTRACT.md` and the shared Zod types are in `packages/contract`.

Status: **Milestone 1 backend in progress, demo data only.**
- Storefront reads: categories, product list (search, facets, paging), product detail, and search suggestions.
- Staff auth: session cookie, CSRF check, roles, lockout.
- Admin: products, options, variants (own or shared stock), publishing with a checklist, inventory adjustments with a movement ledger, and a timeline.

See `docs/api/API_CONTRACT.md` §4 and §5.1. Demo products have no variants, so the storefront shows everything as not for sale until real SKUs and prices are entered.

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
npm run staff:create -w @kleawip/commerce-api -- --email you@example.com --name "Your Name" --role owner
                                  # prints a one-time temporary password; there is no public sign-up
npm run api:typecheck
npm run api:test                  # resets and migrates kleawip_test, then runs every test
```

After you change `src/db/schema.ts`, run `npm run db:generate`. This writes a new SQL migration to `database/migrations/`; review it before applying.

## Demo data

`database/seeds/demo/catalogue.json` was copied from the storefront preview catalogue on 25 September 2026. Every row is `isDemo: true`. It has no prices, SKUs or stock, and its alt text is placeholder. It is not client-approved data.

## Known issue

`npm audit` reports moderate advisories in `esbuild`, which comes in through `drizzle-kit`. That is a dev-only migration generator and is never deployed. The only fix npm offers is a breaking downgrade, so re-check when `drizzle-kit` releases an update.
