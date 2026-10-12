<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Raffle Hub — project notes for agents

- Read `docs/architecture.md` first; `docs/Raffle-Hub-Developer-Blueprint.pdf` is the product spec.
- Authorization is enforced in Postgres (RLS + `has_org_permission`) **and** in server actions (`orgAction` in `lib/actions.ts`). Keep both when adding features.
- Multi-record writes go in Postgres functions (`supabase/migrations/*`), called via `rpc()`; supabase-js has no client transactions.
- Audit events are written by DB triggers. Don't write `audit_events` from app code.
- Never hard-delete roster or fundraising rows; archive (`archived_at`).
- The service-role key is used only by `scripts/seed-dev.mjs` (local), `scripts/audit-checkpoint.mjs` (CI/trusted machine) and `lib/supabase/admin.ts` (server-only: exact email lookup + invitation emails). Never use it for app data reads/writes.
- Scoped roles: captains/families read via `roster.read_assigned_teams` / `roster.read_own_family` + scope tables; never widen them to `roster.read`. Platform admins are SQL-only (`docs/platform-admins.md`).
- Protected org fields (slug, status, jurisdiction_profile, platform_config) are platform-admin only, via `platform_update_organization`.
- Campaign status changes only through `transition_campaign`; ledger tables (`campaign_events`, `ticket_events`, `money_events`, `audit_events`) are append-only and hash-chained.
- Members hold multiple roles (`organization_member_roles`); check permissions, never role names. Keep `lib/permissions/index.ts` in sync (tests enforce it).
- Before pushing: `npm run check`, `npx supabase test db`, and `npm run test:e2e` against a seeded local stack (see `docs/deployment.md`).
- Schema change → new migration → `npx supabase db reset` → `npm run db:types` → `npx supabase test db`.
- Phase 1 deliberately has no tickets, sales, payments or checkout (Texas CREA offline-payment model).
