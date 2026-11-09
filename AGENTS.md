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

## Claude ↔ Codex handoff protocol

This shared protocol covers Raffle and Aspire South work in this repository. It supplements the branch-specific Next.js and project safeguards above; it does not change the approved product scope or make one application branch a merge target for another.

### One durable issue and one owner

- Use one canonical GitHub issue per task, created with **Codex / Claude handoff**. Keep ownership, approvals, full evidence and later handback comments on that issue; link every related draft PR back to it. A PR-only comment or private chat is not a substitute.
- Keep exactly **one routing label** on the canonical issue: `needs-codex` for Codex's next action or `needs-claude` for Claude's. For parallel work, create separately scoped, cross-linked issues with separate owners and isolated branches; never apply both routing labels to one issue.
- Before changing ownership, post the complete handoff comment below, naming the next owner and one immediate next action. Then remove the previous routing label and apply the new one. If a label is unavailable or a change fails, record the blocker and do not claim routing succeeded.
- The receiving agent must acknowledge scope on the issue and independently verify the current remote refs, accessible artifacts and test evidence before editing.
- Never let agents concurrently modify the same branch or unreviewed files. Check for an active writer and overlapping PRs before taking ownership. Do not overwrite another writer's work or silently rebase after branch drift.
- Routing labels, passing tests and a draft PR grant no new authority to merge, promote, deploy, change security/business rules or use real data.

### Inspect before writing

1. Read this file, the canonical issue and its latest comments, related PRs, relevant architecture/security docs, and `docs/PROJECT_STATE.md` if it exists on the selected branch. Confirm repository permissions before taking ownership or editing. Verify current facts against the remote; historical next actions are not new authorization.
2. Verify the repository, intended target/base branch and full SHA, work branch and full HEAD SHA, tree SHA, overlapping work and approval boundaries. Stop on unexpected drift and reconcile explicitly; do not silently retarget a PR or combine application histories to resolve a documentation overlap.
3. Distinguish local-only, pushed, draft, CI-validated, reviewed, promoted, staged and deployed states. Inspect the actual commits/files; a screenshot or another agent's summary does not prove workspace access or remote publication.
4. Use one isolated branch per owner/task. No unapproved pushes to `main`, `feat/phase-1-fundraising-slice` or `feat/calendar-fundraiser-aspire-south`. Keep reviewable changes in a draft PR against the approved target and use synthetic data only unless separately authorized.

### Required handoff comment

Use these sections for the initial issue and every transfer; write **not run**, **not applicable** or **unverified**, with a reason, rather than omitting evidence.

- **From → To / routing:** current owner, next owner, single routing label and receiving-owner acknowledgement/date.
- **Goal and boundaries:** objective, acceptance criteria, requested investigation/implementation/review, completed work, explicit non-goals and prohibited actions.
- **Exact refs and state:** repository, canonical issue and related PR URLs, target/base branch and full SHA, work branch/full HEAD SHA, source tree SHA, verified work state, dependencies, overlaps and conflicts.
- **Files and artifacts:** exact changed paths and diff, commits and dependency order, original patch SHA/checksum, an accessible complete patch (or equivalent bundle), a clean source archive and full sanitized reports/logs when private sandbox artifacts would otherwise be inaccessible. Never assume access to another agent's local workspace.
- **Local validation:** commands, environment, synthetic fixtures, PASS/FAIL/SKIP counts, first attempt/retries, and applicable lint/types/unit/build, fresh DB reset/migrations, pgTAP/RLS/security, concurrency, audit, browser/E2E and 320/360/390px accessibility evidence.
- **Remote CI:** current run IDs/URLs, head SHA, GitHub-tested merge SHA/tree where PR-triggered, individual jobs and final conclusions. Separate baseline evidence from candidate evidence; historical green CI does not validate a new head.
- **Hosted evidence, only if authorized and verified:** preview/staging/production classification, URL, deployment ID and source SHA, published READY state, Hosted QA login/public-privacy smoke and remaining gaps. Record automatic previews separately from an explicit deployment, including whether deployment was prohibited.
- **Risk and approvals:** failures and reproduction steps, missing logs/uninspected claims, threat-model findings, director and independent-security review status, exact action approved by whom with a source link, pending approvals and stop conditions.
- **Next action and handback:** one immediate action, checks that must pass, what must not change, expected return evidence and next owner.

Keep credentials, private secrets, raw seller tokens, service-role keys, real donor/supporter/family/child data and billing details out of issues, patches, archives and logs. Redact sensitive values without removing diagnostic evidence.

### Validation, handback and approval gates

- Preserve the branch's existing checks. Validate the changed head with all applicable repository checks and preserve full logs, failures and retry history. State exactly what was not independently inspected or run and why.
- When blocked, report the exact action/target, completed checks, missing evidence, reason, reproduction steps and safe independent work. Do not retry uncertain destructive actions, silently rotate seller links, weaken assertions or present existing unsafe behavior as a fix.
- Post the full handback on the canonical issue before transferring its label. Keep the PR draft until the required director/security review; do not claim silent background execution. Notify the director on verified milestones or actionable blockers.
- Wait for the required explicit director and independent-security approval before merging/promoting, deploying, hosted migrations, auth/RLS/webhook/provider-identity changes, encryption/key or rate-limit trust-boundary changes, credential/secrets changes, live Stripe/email, sender/DNS changes, real donor/child/family/payment data, spending or changed business rules.
- A synthetic preview is distinct from staging and production. Existing automation may create a preview after a push; report that fact and its verified identity, but do not infer production readiness or permission for another deployment.

### Raffle safeguards

These safeguards apply to approved raffle slices on their own branch; they do not add sales or payments to the foundation-only `main` baseline.

- Preserve public REQUEST-only supporter pages, nonbinding interest rather than checkout/reservation/automatic sales, approved offline cash/check workflows, multi-guardian/tenant/captain isolation, immutable ledgers and the physical/external drawing.
- The Phase 1 integration branch and protected staging are not general merge targets. Consult that branch's project-state and operations docs plus live GitHub/Netlify evidence before a separately authorized promotion.
- Before an approved NONPRODUCTION promotion, require the exact reviewed diff, fresh DB/RLS/security/concurrency/audit, lint/types/unit/build and retry-free browser acceptance. After promotion, require exact-head normal CI, Hosted QA login/public-privacy smoke and the matching published READY staging deployment before reporting staged. A live staging baseline does not validate an isolated candidate.
- PR #2 remains unmerged without specific approval. No production Supabase for development or synthetic verification, no production deployment or real family/payment data without the existing explicit approvals.

### Aspire South safeguards

- Keep Draft PR #19 separate from PR #15's personal-link/security decisions. Batch 1's notification outbox contract is not a deployed sending system.
- Batch 2 SQL, worker/provider identities, public personal links, sender/DNS settings, live payments, real donor emails and hosted migrations require distinct explicit approval.
- Preserve protected production and Aspire South branches. Shared handoff documentation does not approve feature integration, an application-branch merge, deployment or expansion of either project's scope.
