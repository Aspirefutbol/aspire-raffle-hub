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

## Claude ↔ Codex handoff protocol

This protocol applies to all work in this repository. It supplements—not overrides—the Next.js and Raffle Hub safeguards above.

### Ownership and routing

- Use **one owner per task and one isolated working branch**. Never let Claude and Codex concurrently modify the same branch or unreviewed files.
- Create a GitHub issue using **Codex / Claude handoff** for every cross-agent transfer; the issue is the durable source of truth, not a private chat or sandbox.
- Apply `needs-codex` when action or independent review is requested from Codex; apply `needs-claude` when action or corrections are requested from Claude. Remove the former label when replacing it with the latter (and vice versa); never leave both as ambiguous ownership unless the issue explicitly names separate scoped workstreams.
- The receiving agent must acknowledge scope and verify the **remote branch, exact base/head SHA, and current test evidence** before writing code. Stale green CI on another SHA is not acceptance.

### Required handoff packet

Record in the issue: objective and acceptance criteria; current owner and next owner; repository and branch; exact base/head/tree SHA; PR links; files/commits/patches/bundles available to the receiver; completed work and explicit non-goals; commands run with pass/fail/skip counts; CI run URLs tied to the tested SHA; deployment URL and SHA if applicable; blockers, risks, pending approvals, and the single next action. Attach or link a **complete** patch, clean source archive and full logs when private sandbox artifacts would otherwise be inaccessible. Never claim the receiving agent can access another agent's local workspace.

### Execution and approval gates

1. **Inspect** the issue, `AGENTS.md`, relevant architecture/security docs, branch history, and requested files. Confirm branch drift and permissions. Stop on unexpected drift; don't silently rebase.
2. **Work in isolation**. No unapproved pushes to `main`, `feat/phase-1-fundraising-slice`, or `feat/calendar-fundraiser-aspire-south`; prefer a draft PR into the approved target. Use synthetic data only unless separately approved.
3. **Validate** the changed head with applicable lint, types, unit tests, build, migrations-from-scratch, pgTAP/RLS, concurrency and E2E. State exactly what did not run and why. For PR CI distinguish head SHA from GitHub's tested merge SHA/tree.
4. **Hand back** evidence in the issue and transfer the routing label. On failure, provide logs and artifacts rather than broadening scope or making security-sensitive fixes without approval.
5. **Wait for director/security approval** before merging, deploying, migrating a hosted database, changing auth/RLS/webhook identities or secrets, enabling live Stripe/email, introducing real donor/child data, or incurring spending. A passing test does not itself authorize these actions.

### Aspire South boundaries

- Keep Draft PR #19 separate from PR #15's personal-link/security decisions. Batch 1's notification outbox contract is not a deployed sending system.
- Batch 2 SQL, worker/provider identities, public personal links, sender/DNS settings, live payments, real donor emails, and hosted migrations require distinct explicit approval.
- A synthetic preview deployment is different from a production deployment. Record whether either was triggered or explicitly prohibited.
