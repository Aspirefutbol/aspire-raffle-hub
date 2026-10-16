# Raffle Hub Project State

_Last updated: 2026-10-16_

This file is the changing execution state for the Aspire Raffle Hub pilot. Read it together with `AGENTS.md`, `docs/architecture.md`, `docs/raffle-pilot-backlog.md`, `docs/money-custody.md`, `docs/drawing-operations.md`, `docs/MONEY_HOSTED_QA.md`, `docs/MONEY_HOSTED_QA_RESULTS.md`, `docs/MONEY_OPERATOR_UI_REVIEW.md`, `docs/SELLER_SHARING.md`, and `docs/ADMIN_LEARNING_HUB.md`.

## Source of truth

- Repository: `Aspirefutbol/aspire-raffle-hub`
- Active implementation branch: `feat/phase-1-fundraising-slice`
- Verified implementation baseline: `bfb681f73bd5cf6b270bbbb69accda0a0e7bdb78`
- Seller Sharing implementation commit: see feature branch history and task delivery report; never infer hosted state from local files.
- Draft PR: #2 — keep DRAFT and UNMERGED until the remaining implementation slices and full Aspire operator rehearsal are complete.
- Default branch: `main`
- Hosted QA site: `https://aspire-raffle-hub-staging.netlify.app`
- Staging Supabase project: `Aspire Raffle Hub Staging` (`ixhpidqhqzbpfbklofrs`)

Do not rely on unpushed state from older Codex environments. Verify remote HEAD before implementation.

## Completed and verified slices

### Phase 0 foundation

- Multi-tenant organizations.
- Members/roles and scoped permissions.
- Teams, players, households, guardians.
- RLS and server-side authorization.
- Audit hash chains and external checkpoint continuity.
- Admin/family/captain scoped access.

### Core raffle transactions

- Campaign setup/readiness and lifecycle.
- Participant enrollment.
- Ticket generation and allocation.
- Offline cash/check sale recording.
- Family seller view and assigned-team captain view.
- Player → team → campaign totals.
- Caller-bound idempotent/safe retry.
- Sale reversal without deleting history.
- Linked correction sale using fresh ticket numbers.
- Voided ticket numbers are never reused.
- Hosted QA verified admin sale, family scope, captain scope, multi-ticket sale, retry, reversal, and correction history.

### Drawing integrity

- Immutable drawing snapshots and entries.
- Freeze/reopen workflow.
- Verified private drawing export.
- External/physical drawing model for the Aspire pilot.
- Result/certification structure.
- Concurrency protections for freeze, reversal, reopening, result, and certification.
- No in-platform random winner generator for the pilot.

### Money Custody & Reconciliation — ACCEPTED

Implementation and hosted QA are complete.

Verified capabilities:

- Recorded sales remain separate from money received by the organization.
- Immutable physical receipts and deterministic receipt-to-sale allocations.
- Partial and multi-sale turn-ins.
- Explicit check pending/cleared/returned outcomes.
- Returned-check exceptions do not silently void raffle tickets.
- Refunds, credits, approved balance adjustments, and deposits are explicit events.
- Reversal after receipt preserves physical receipt facts and creates credit/overpayment where appropriate.
- Linked correction + credit transfer moves existing held funds without manufacturing another receipt.
- Admin, family, and captain projections remain scoped and redacted.
- Desktop and mobile money workflows are usable without horizontal overflow.
- Money terminology was simplified after operator review.

Hosted/operator QA completed:

- real $2.50 partial cash turn-in through the hosted UI
- expected / received / money-still-due / reconciled balances updated correctly
- immutable money history displayed the receipt, actor, reason, timestamp, and event ID
- player/team/campaign roll-ups reconciled
- family view showed only the linked player and no private money details
- captain view showed only the assigned team and no admin reconciliation controls
- mobile admin dashboard and money form passed phone-width review
- hosted rollback checks passed for idempotency, check clearance, returned checks, deposits, reversal after receipt, and correction credit transfer
- automated hosted QA mutations were rolled back; only the intentional $2.50 operator receipt remains as QA evidence

Validation at acceptance:

- 809 pgTAP assertions
- 157 unit tests
- 13 real concurrency groups
- 27 browser tests
- lint, typecheck, generated-types parity, production build, audit continuity, database/E2E CI, and hosted deploy all green

### Seller Sharing + Parent/Player Seller Toolkit — ACCEPTED

Hosted/operator QA is complete for the Aspire staging fixture.

Verified capabilities:

- Family can create an opaque one-time seller link and share by copy, SMS, email, WhatsApp, and QR.
- Public supporter page exposes campaign information only; no player, team, household, ticket-number, balance, buyer, money, or audit data was observed.
- Public interest request remained nonbinding and created no sale or money-custody event.
- Family private inbox showed the synthetic supporter request and allowed status progression to contacted.
- One synthetic offline $5 cash sale issued ticket `QA2-000013` and the sale reference linked back to the request, which then reached completed status.
- Replacing the seller link revoked the prior active link while preserving request history; staging showed one active and one revoked link after rotation.
- QR generation rendered successfully and encoded the new replacement seller URL.
- Hosted mobile review at 393×852 showed a usable responsive supporter page with no horizontal overflow or private player/team information visible.
- Full CI and Hosted QA Deploy are green on commit `0c30a9c17f45e89755b449f9a39c529ca3fbc932`.

Known follow-up UX refinement: after a browser reload, the seller control returns to `Share fundraiser` because tokens are intentionally shown once and not persisted. Consider clearer copy such as `Create / replace seller link` in a later polish pass so families understand that generating a new link revokes the prior one.

### Admin Learning Hub — ACCEPTED

Hosted/operator acceptance review is complete.

Verified capabilities:

- Admin-only Learning Hub navigation appears in the hosted operator workspace.
- Search for natural operator language such as `check bounced` returns the relevant returned-check guide.
- Launch-critical articles are readable, scannable, and linked to related guides.
- Contextual help from Campaigns routes directly to the correct campaign-preparation article.
- Family/seller navigation does not expose the Admin Learning Hub.
- Automated validation is green: lint, typecheck, unit tests, production build, fresh migrations, pgTAP, generated types, fundraising/drawing/money/Seller Sharing concurrency suites, audit continuity, and 29/29 Playwright browser tests.
- Hosted QA Deploy is green and staging is ready.

## Current approved action

**Aspire full operator rehearsal.**

Run the complete hosted staging path:

campaign setup → enrollment → ticket allocation → family sharing/selling → captain monitoring → sale → money turn-in/reconciliation → reversal/correction → close sales → freeze/export drawing population → external/physical draw → result/certification → final reconciliation → audit verification.

Use synthetic data only. Preserve the current accepted Money Custody, Seller Sharing, Learning Hub, authorization, tenant isolation, immutable ledger, ticket inventory, drawing integrity, idempotency, and audit behavior.

### Rehearsal progress

Primary campaign: `OPERATOR REHEARSAL — Aspire Pilot`  
Campaign ID: `5a892877-1b83-4a3b-94d3-7a6e3aa2fb12`

Passed so far:

- fresh campaign setup/readiness
- U13 Boys enrollment: 3 players
- ACTIVE lifecycle
- 12-ticket inventory preparation
- Seller Sharing public privacy and request-only behavior
- supporter request → contacted → offline sale → completed request
- family cash sale and normal check sale
- captain/team monitoring and privacy
- partial $2.50 cash turn-in
- $5 check turn-in
- returned-check handling without automatic ticket invalidation
- operator UX fixes for money-action discoverability
- highlighted Action center treatment for Money, Campaign readiness, and Drawing

Current database state before continuing:

- campaign lifecycle: ACTIVE
- tickets: 10 ALLOCATED / 2 ISSUED
- active recorded sales: 2 / $10 total
- completed supporter request linked to sale `82bacaf2-df17-4cd5-a0f0-01a5d8bf5e9a`
- money history includes $2.50 cash turn-in, $5 check turn-in, and returned-check exception

Current next step after latest validation/deploy:

1. visually confirm the highlighted Money action center
2. record replacement cash for the returned check
3. resolve the check issue
4. run sale reversal + linked correction with fresh ticket number(s)
5. continue through close, drawing, certification, final reconciliation, and audit verification

Detailed live findings: `docs/OPERATOR_REHEARSAL_FINDINGS.md`.

### Rehearsal UX changes already made

- top-level **Record money** shortcut
- **Record money received / adjustments** action-center heading
- **Choose action** selector
- **Record turn-in (full or partial)** wording
- contextual action help
- reusable highlighted workflow panel for Money, Campaign readiness, and Drawing
- Learning Hub money articles aligned with the updated terminology

Produce a final go-live blocker list categorized as Product, Operations, Compliance/legal, Training, and Infrastructure.

Keep PR #2 draft/unmerged until explicit approval.

## Production gate

The Aspire raffle target is a planning target, not a production-readiness claim.

Before live operation, confirm:

- legal entity eligibility under applicable Texas raffle rules
- approved rules, prizes, and disclosures
- approved ticket pricing/numbering and payment/delivery methods
- approved sales dates, cutoff, and drawing procedure
- required recordkeeping and operator responsibilities

Texas pilot mode remains offline cash/check; no online raffle-ticket checkout.

## Deferred — do not implement yet

- Shared Campaign Boost Engine
- Marketplace / Experience Marketplace
- Sponsor-a-Day migration
- Puzzle
- Fill the Field
- 100 Board
- Journey / Build It
- Sponsorship CRM
- Other fundraiser experiences
- In-platform random winner generator

The future Boost Engine must not alter raffle odds, ticket quantities, ticket price, or eligibility without separate approved jurisdiction/compliance work.

## Project isolation

This repository is Raffle Hub only.

Do not implement Aspire One or Aspire Coaching Studio work here. Do not copy instructions from those projects unless the user explicitly approves a cross-project change.

## Agent operating rule

For future implementation tasks:

1. Read `AGENTS.md`.
2. Read this file.
3. Verify remote HEAD and PR state.
4. Execute only the Current approved action above.
5. Preserve all authorization, RLS, immutable ledger, idempotency, ticket, drawing, money, and audit guarantees.
6. Keep PR #2 draft/unmerged unless the user explicitly approves a merge.
7. Stop at the next QA/approval gate and report the exact commit SHA, tests, hosted state, and known gaps.
