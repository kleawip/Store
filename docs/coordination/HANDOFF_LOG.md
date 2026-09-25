# Codex ↔ Claude Code handoff log

Codex (frontend) and Claude Code (backend) talk through two channels:

1. **Mailbox: direct messages, delivered automatically.** Each message is a Markdown file in `docs/coordination/messages/`. A `SessionStart` and `UserPromptSubmit` hook in both agents (`.claude/settings.json`, `.codex/hooks.json`) runs `tools/agent-mail/mail.mjs hook`. When the owner sends either agent a prompt, that agent automatically receives any unread messages from the other.
   - Send: `node tools/agent-mail/mail.mjs send --from codex --to claude --subject "..." --body "..."` (use `--from claude --to codex` from the other side, add `--reply-to <id>` when answering, or pipe a long body on stdin). The tool refuses messages that look like they contain a secret.
   - Read: `node tools/agent-mail/mail.mjs inbox --for codex` shows unread messages; `list --for codex` shows everything.
   - The owner can post to either agent with `--from owner --to codex|claude|all`, or just read the files.
2. **This file: the durable record.** The Open requests table and the session log below. Mailbox messages are for conversation. Anything that is agreed, or still waiting on someone, is recorded here as well.

Neither agent can wake the other up. A message is delivered the next time the owner prompts the receiving agent.

## Protocol — both agents follow this every session

1. **At the start of every session**, read the **Open requests** table, the latest 5 log entries and any mailbox messages the hook delivered, before touching anything.
2. **Stay inside your own paths** (see below). If you need a change in the other side's path, do **not** make it yourself. Add an Open request instead.
3. **To change a shared file**, add an Open request first. Make the change only after the other side (or the project owner) has answered "agreed" in the table. The one exception: each side may append its own dated line to the progress log in `FRONTEND_BACKEND_TASKS.md` and to this file's log.
4. **Before you finish a session**, run your own side's checks. Then append one log entry that says what changed, which files, the test results, and what you need from the other side.
5. **Never** put secrets, API keys, customer data or credentials here, in Graphify, or anywhere else in the repo.
6. The project owner has final say. When an instruction from the owner conflicts with this file, follow the owner and record that you did.

### Path ownership

| Path | Owner | Other side may |
| --- | --- | --- |
| `apps/storefront/**` | Codex | read only |
| `apps/admin/**` (when created) | Codex | read only |
| `services/**`, `database/**` | Claude Code | read only |
| `packages/contract/**`, `docs/api/API_CONTRACT.md` | **Shared** | change only after an agreed Open request |
| `FRONTEND_BACKEND_TASKS.md`, `IMPLEMENTATION_PLAN.md`, `AGENTS.md`, `CLAUDE.md`, `docs/PROJECT_BUILD_STATUS.md` | **Shared** | append to the progress logs freely; any other edit needs an agreed Open request |
| `docs/design/**`, `docs/phase-1/**` | Codex | read only |
| `docs/research/**`, `docs/decisions/**` (backend ADRs) | Claude Code | read only |
| `docs/coordination/**`, `tools/agent-mail/**` | **Shared** | send/append freely; changes to the tool need an agreed Open request |
| `graphify-out/**` | Either | run `graphify update .` after your own changes |

### Checks each side runs before handing off

- **Codex:** in `apps/storefront`, `npm run typecheck && npm test && npm run build`.
- **Claude Code:** from the project root, `npm run api:typecheck && npm run api:test`.
- **Contract change:** both sides' checks must pass. `packages/contract` is the single source of the request and response types.

## Open requests

| # | From → To | Request | Status |
| --- | --- | --- | --- |
| 1 | Claude → Codex | Review `docs/api/API_CONTRACT.md`, especially §4 and §11, against the storefront's needs, and list missing or awkward fields. | Open |
| 2 | Claude → Codex | Decide where the admin frontend lives: `apps/admin` (separate app, recommended) or a protected area inside the storefront. | Open |
| 3 | Claude → Owner | Approve or reject the proposed backend stack (API_CONTRACT §1): TypeScript, Fastify, Postgres, Drizzle, Zod. | Open |
| 4 | Claude → Owner | Put the project under git (see the note below). | **Done 25 Sep**: local repo only, no remote yet |

## Log (newest last)

### 2026-09-25 — Claude Code
- **Changed:**
  - Added `docs/api/API_CONTRACT.md` (v1 proposal, including §11 answering `docs/phase-0/FRONTEND_DATA_HANDOFF.md`).
  - Added `packages/contract`, `services/commerce-api`, `database/migrations/0000_init.sql` and `database/seeds/demo/catalogue.json`.
  - Added the root `package.json` (npm workspaces for `packages/*` and `services/*` only; `apps/storefront` is **not** a workspace member and keeps its own install) and a root `.gitignore`.
  - Added this file, the mailbox tool `tools/agent-mail/mail.mjs`, and `SessionStart`/`UserPromptSubmit` hooks for it in `.claude/settings.json` and `.codex/hooks.json`. The existing graphify hooks are unchanged.
  - Added a progress line to `FRONTEND_BACKEND_TASKS.md`.
  - Added a short Coordination section to `AGENTS.md` and `CLAUDE.md` pointing both agents here.
- **Tests:** `npm run api:typecheck` clean; `npm run api:test` 14/14 passing on Postgres 16 (`kleawip_test`).
- **Did not touch:** `apps/storefront`.
- **For Codex:** until you have reviewed the contract, keep building against the current local fixtures. When you are ready to try the API: from the project root run `npm install`, then `npm run db:migrate && npm run db:seed:demo && npm run api:dev`, then open `http://127.0.0.1:4000/v1/store/products`. CORS already allows `http://localhost:3000`.

### 2026-09-25 (later): Claude Code
- **Changed:** catalogue domain schema (migration `0001`): option groups/values, variants (SKU, price/MRP in paise, GST basis points, HSN, pack quantity, **inventory units per sale** for shared vs pre-packed stock), inventory items (on hand / committed / unavailable / incoming, DB-enforced non-negative available), inventory movement ledger, collections, audit events. Pure availability rules in `services/commerce-api/src/domain/availability.ts`. New endpoint `GET /v1/store/products/{slug}`; the product list now derives `priceFrom`/`availability` from variants. Added `docs/api/ADMIN_SCREENS_BRIEF.md` and `docs/research/SHOPIFY_ADMIN_REFERENCE.md`.
- **Tests:** typecheck clean; 43/43 passing (unit rules + Postgres integration, including duplicate SKU / duplicate combination / MRP < price / negative available all rejected by the database).
- **Demo data:** the seeded catalogue still has **no variants**, so every product stays `not_for_sale` with pending prices. The priced `DEMO-SKU-A/B/C` fixture exists **only inside tests** (`test/fixtures.ts`).
- **For Codex:** `ProductDetail` Zod type is exported from `packages/contract`. Try `GET /v1/store/products/twisted-loop-1200` after `npm run db:migrate && npm run db:seed:demo && npm run api:dev`.
- **Next (backend):** staff auth + roles, then admin catalogue write APIs with audit.

## Git rules

`WEBSITE DATA/project` is a **local** git repository on branch `main`. There is no remote yet; the client's GitHub account will be added later and the full history pushed then.

- Commit only your own work, with a prefix: `frontend: …` (Codex), `backend: …` (Claude Code), `docs: …` / `chore: …` for shared files.
- Stage specific paths (`git add apps/storefront` or `git add services database`). Never `git add -A` while the other agent may have uncommitted work in progress.
- Commit after your checks pass, then append your log entry. Never rewrite history (`reset --hard`, `rebase`, `push --force`) and never discard the other agent's uncommitted changes. Ask through the mailbox instead.
- `.env` files, `node_modules`, build output and `tmp/` are ignored. Never commit secrets.
