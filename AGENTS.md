<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Raffle Hub — project notes for agents

- Read `docs/PROJECT_STATE.md` first for the current branch, verified baseline, next approved action, QA gate, and deferred scope. Then read `docs/architecture.md`; `docs/Raffle-Hub-Developer-Blueprint.pdf` is the product spec.
- Authorization is enforced in Postgres (RLS + `has_org_permission`) **and** in server actions (`orgAction` in `lib/actions.ts`). Keep both when adding features.
- Multi-record writes go in Postgres functions (`supabase/migrations/*`), called via `rpc()`; supabase-js has no client transactions.
- Audit events are written by DB triggers. Don't write `audit_events` from app code.
- Never hard-delete roster or fundraising rows. Archive roster/campaign records (`archived_at`); retain immutable financial facts and use reversal/correction events.
- The service-role key is used only by `scripts/seed-dev.mjs` (local), `scripts/audit-checkpoint.mjs` (CI/trusted machine) and `lib/supabase/admin.ts` (server-only: exact email lookup + invitation emails). Never use it for app data reads/writes.
- Scoped roles: captains/families read via `roster.read_assigned_teams` / `roster.read_own_family` + scope tables; never widen them to `roster.read`. Platform admins are SQL-only (`docs/platform-admins.md`).
- Protected org fields (slug, status, jurisdiction_profile, platform_config) are platform-admin only, via `platform_update_organization`.
- Campaign status changes only through `transition_campaign`; ledger tables (`campaign_events`, `ticket_events`, `money_events`, `audit_events`) are append-only and hash-chained.
- Phase 1 raffle transactions and scoped projections live in the `20261014000100`–`20261014000400` migrations and `lib/fundraising/*`. Use enrollment, inventory, sale, and reversal RPCs; never write their tables directly. Preserve immutable sale/allocation/reversal facts and existing hashed ledger row shapes.
- Fundraising views select explicit `admin`, `family`, or `team` projections. Current guardian/team scope is authoritative; enrollment snapshots preserve attribution only. Progress projections omit buyer contacts and private notes.
- Issuance requires `tickets.issue` plus organization sale authority (`organization.manage`) or the specific participant's current family scope. Captain/read/campaign permissions must not broaden combined-family selling scope. Reversal requires both `tickets.void` and `adjustments.approve`, with the approving actor derived in SQL.
- Keep caller-bound sale idempotency, campaign ticket uniqueness, approved locked-price integer cents (including package snapshots and exact per-ticket allocations), atomic ledger writes, and hash verification. Corrections append a reversal association and fresh replacement sale; voided ticket numbers are never reused.
- Money custody lives in `20261016000100_money_custody.sql` and `lib/money/*`: separate immutable receipt/allocation and financial correction events. Preserve original collecting-seller attribution through correction lineage, use explicit credit transfers/refunds, and never couple check/reconciliation status to ticket validity. See `docs/money-custody.md`.
- Seller Sharing lives in `20261017000100_seller_sharing.sql`, its association-guard migration, and `lib/sharing/*`. Public tokens are hashed; requests/status history never mutate sale, ticket, custody or drawing facts. Family inbox projection is explicit (default `family`); admin support must explicitly select `admin`. Preserve current guardian/membership checks, durable request limits, generic public responses and append-only history. See `docs/seller-sharing-operations.md`.
- Members hold multiple roles (`organization_member_roles`); check permissions, never role names. Keep `lib/permissions/index.ts` in sync (tests enforce it).
- Before pushing: `npm run check`, `npx supabase test db`, and `npm run test:e2e` against a seeded local stack (see `docs/deployment.md`).
- Schema change → new migration → `npx supabase db reset` → `npm run db:types` → `npx supabase test db`.
- The approved slices are raffle-only, with manual offline cash/check sales, money custody/reconciliation, and guarded drawing exports. Launch rehearsal, other fundraiser types, and campaign boosts remain separate work; see `docs/raffle-pilot-backlog.md`. Do not infer pilot production readiness from these tests.

## Claude / Codex collaboration and issue handoff

**Single source of truth:** This file applies to both agents; `CLAUDE.md` imports it. Preserve all project-specific rules above. Follow this protocol in addition to repository tests and security boundaries.

### Routing labels and ownership
- `needs-codex`: Codex owns the next investigation, code/test task, or evidence review.
- `needs-claude`: Claude owns the next investigation, code/test task, or evidence review.
- Use **one routing label at a time**, not both. A handoff is complete only after a durable GitHub issue/PR comment names the new owner and next action; then remove the previous label and apply the new label. If label changes aren't possible, leave an explicit blocker comment instead of pretending assignment occurred.
- Labels do **not** grant approval to implement sensitive security changes, merge, promote, deploy, access production, or change business rules.

### Before taking a task
1. Read the issue, current comments, target PR and `docs/PROJECT_STATE.md`; independently verify repository, base/head branch and exact **full** commit SHAs. Check whether the previous agent's change is local-only, pushed, draft, CI-validated or staged. Never accept screenshots or summaries as proof of another workspace's commits.
2. Review open overlapping branches/PRs. Work on a dedicated isolated branch; never concurrently mutate another agent's branch or integrate unreviewed patches.
3. Verify current exact-head CI and, for any release/staging claim, Hosted QA smoke and the matching published READY Netlify deployment. Separate baseline evidence from candidate evidence.
4. Before editing, define scope, forbidden changes, acceptance checks and approval status. Stop and request human/security authorization where required.

### Required handoff comment
Use the issue template `.github/ISSUE_TEMPLATE/codex-handoff.md` to start and this format for every transfer:
- **From → To / routing label:** Codex or Claude and `needs-codex` or `needs-claude`.
- **Objective, issue/PR URLs and exact refs:** repository, base branch/full SHA, work branch/full SHA, whether pushed and draft.
- **Files and diff:** exact changed paths, additive/deleted scope, dependencies, conflicts and any unpushed patch/bundle with checksum.
- **Evidence:** commands, run IDs/links, fresh DB reset/migrations, pgTAP/RLS/security/concurrency/audit, lint/types/unit/build, browser phone-width/accessibility, result and whether first attempt/retries occurred; hosted smoke/deploy only when actually verified.
- **Risk/approval:** unresolved failures, threat model findings, product/legal/security boundaries, independently approved versus proposed.
- **Next agent action and stop conditions:** exact investigation/patch/review requested, what not to change, what would constitute a finished handback.

When blocked, document what you verified, what's missing and how to reproduce it. Do not auto-rotate links, retry uncertain destructive actions, weaken failing tests, or present existing unsafe behavior as a fix. No private secrets, raw seller tokens, service-role keys, real supporter/family data or billing details in issues, patches, logs or handoffs.

### Completion rule
After passing isolated CI, keep PR draft until the required director/security review. Any separately authorized NONPRODUCTION promotion requires exact-head normal CI, Hosted QA (login and public-privacy smoke), and matching published READY staging before reporting staged. PR #2 remains unmerged unless specifically approved. A working live staging baseline does not automatically validate an isolated candidate.
