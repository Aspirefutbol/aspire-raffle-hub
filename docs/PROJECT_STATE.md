# Raffle Hub Project State

_Last updated: 2026-10-15_

This file is the changing execution state for the Aspire Raffle Hub pilot. Read it together with `AGENTS.md`, `docs/architecture.md`, `docs/raffle-pilot-backlog.md`, `docs/money-custody.md`, `docs/drawing-operations.md`, `docs/MONEY_HOSTED_QA.md`, `docs/MONEY_HOSTED_QA_RESULTS.md`, and `docs/ADMIN_LEARNING_HUB.md`.

## Source of truth

- Repository: `Aspirefutbol/aspire-raffle-hub`
- Active implementation branch: `feat/phase-1-fundraising-slice`
- Draft PR: #2 — keep DRAFT and UNMERGED until hosted QA and operator rehearsal are complete.
- Default branch: `main`
- Latest verified implementation baseline: `cddd4f36c57cc5ba6ddf0ad7a0fa1930ed2ec737`
- Baseline commit message: `feat: add append-only money custody and reconciliation`

Do not rely on unpushed state from older Codex environments. Verify remote HEAD before implementation.

## Completed and verified slices

### Phase 0 foundation
- Multi-tenant organizations.
- Members/roles and scoped permissions.
- Teams, players, households, guardians.
- RLS and server-side authorization.
- Audit hash chains and external checkpoint continuity.
- Admin/family/captain scoped access.

### Phase 1 core raffle transaction slice
- Campaign setup/readiness.
- Participant enrollment.
- Ticket generation and allocation.
- Offline cash/check sale recording.
- Family seller view and assigned-team captain view.
- Player → team → campaign totals.
- Caller-bound idempotent/safe retry.
- Sale reversal without deleting history.
- Linked correction sale using fresh ticket numbers.
- Voided ticket numbers are never reused.
- Hosted QA manually verified admin sale, family scoping, multi-ticket sale, safe retry, captain roll-up, reversal, and correction history.

### Drawing integrity slice
- Immutable drawing snapshots and snapshot entries.
- Freeze/reopen workflow.
- Verified private drawing export.
- External/physical drawing model for the Aspire pilot.
- Result/certification structure.
- Concurrency protections for freeze/reversal/reopen/result/certification.
- No in-platform random winner generator for the pilot.

### Money Custody & Reconciliation slice
Implementation is pushed and CI-green at the verified baseline above.

Includes:
- Immutable physical receipts and receipt-to-sale FIFO allocations.
- Separation of recorded sale from organization receipt.
- Partial and multi-sale turn-ins.
- Check lifecycle/outcomes and returned-check exceptions.
- Refunds, credits, approved adjustments, and deposits as explicit events.
- Reversal-after-receipt behavior without erasing physical receipt facts.
- Correction credit-transfer behavior.
- Scoped balance UI for admin/family/team contexts.

Reported validation at implementation handoff:
- 809 database assertions.
- 157 unit tests.
- 13 concurrency groups.
- 27 browser tests.
- Lint, typecheck, production build, generated-type comparison, and audit continuity passed.
- GitHub CI passed for both application and database/E2E jobs.

## Current QA gate

The coding portion of Money Custody & Reconciliation is complete.

**Next approved action:** complete the final hands-on UI/operator review for Money Custody & Reconciliation on hosted staging.

Do not start Seller Sharing until money hosted QA is reviewed and accepted.

### Hosted QA preparation status
- Staging Supabase project: `Aspire Raffle Hub Staging` (`ixhpidqhqzbpfbklofrs`).
- Staging Supabase status: healthy.
- Staging migration `20261016000100_money_custody`: applied.
- Migration history is aligned with the repository migration version.
- Netlify hosted QA deployment workflow: passed.
- Existing staging site refreshed from the current feature branch.
- GitHub CI on the money implementation passed for both application and database/E2E jobs.
- Operator checklist: `docs/MONEY_HOSTED_QA.md`.
- Automated hosted results: `docs/MONEY_HOSTED_QA_RESULTS.md`.
- Netlify project remains the existing `aspire-raffle-hub-staging`; do not create a replacement site.

### Hosted QA backend/accounting checks already passed

Rollback-only checks against the real hosted staging database verified:

- partial cash receipt updates received/outstanding correctly
- exact retry creates only one custody event
- family projection remains linked-player scoped
- team/captain projection remains assigned-team scoped
- family/captain private money-event history remains redacted
- family/captain direct money mutation is denied
- check clearance updates uncleared/reconciled correctly
- returned checks reopen obligation/exception without silently voiding tickets
- deposit evidence is distinct from receipt state
- reversal-after-receipt preserves the physical receipt and creates overpayment credit
- linked correction + explicit credit transfer moves held funds without manufacturing a second receipt
- correction uses a fresh ticket number
- all automated hosted QA mutations were rolled back and no `hosted-%` custody events persisted

### Hosted QA target
- Netlify project: `aspire-raffle-hub-staging`
- Primary staging URL: `https://aspire-raffle-hub-staging.netlify.app`
- Admin route: `/o/aspire/campaigns`
- Family route: `/o/aspire/fundraising`
- Captain route: `/o/aspire/team-fundraising`

## Remaining Money QA acceptance

Use `docs/MONEY_HOSTED_QA.md` and `docs/MONEY_HOSTED_QA_RESULTS.md`.

Still required before Money QA is accepted:

- hands-on admin UI walkthrough on hosted staging
- confirm Money & reconciliation labels and operation choices are understandable
- visually confirm expected / received / outstanding / reconciled / exceptions
- verify safe-retry UX in the hosted form
- verify family/captain rendered views remain redacted
- verify mobile-width usability
- operator review of terminology and workflow clarity

Stop after this final UI/operator review and record findings before starting the next gated slice.

## Next slices after money QA

### 1. Seller Sharing / Delivery
Not started.

Approved direction:
- Replace seller-link placeholder with opaque seller links.
- Copy link, SMS/text, email, WhatsApp, and QR sharing.
- Public page is request/interest only for the Aspire pilot.
- No online raffle payment.
- No ticket reservation or issuance from the public page.
- Authorized seller completes the sale after approved offline payment.
- Minimum public participant information; default to campaign identity unless consent allows participant alias/name.
- Add lightweight parent/player “How to Sell” guidance and Seller Toolkit foundation.

### 2. Admin Learning Hub
Approved direction captured in `docs/ADMIN_LEARNING_HUB.md`.

The first Learning Hub slice should provide:
- Admin-only in-app Learning Hub navigation.
- Searchable operating guides and FAQ.
- Launch-critical guides for campaign setup, roster/inventory, sales, reversals/corrections, money/reconciliation, checks/exceptions, deposits/refunds/adjustments, drawing freeze/export/result/certification, roles/scopes, and troubleshooting.
- Contextual help links from important operating screens.
- Version-controlled content grounded in actual product terminology and pilot rules.
- No mutation capability from help content.

Do not let Learning Hub work delay the current Money hosted QA gate. Build the shell/content after Money QA, then include it in the Aspire operator rehearsal. Keep this separate from the Parent/Player Seller Toolkit.

### 3. Aspire Operator Rehearsal
Run the complete hosted staging rehearsal:
campaign setup → roster/enrollment → ticket allocation → family selling → captain monitoring → cash/check recording → turn-in/reconciliation → reversals/corrections → close sales → freeze/export drawing population → external/physical draw → result/certification → final reconciliation → audit verification.

Produce a go-live blocker list categorized as:
- Product
- Operations
- Compliance/legal
- Training
- Infrastructure

## Production gate

The 4–5 week Aspire raffle target is a planning target, not a production-readiness claim.

Before live operation, confirm:
- The legal entity operating the raffle is eligible under the applicable Texas raffle rules.
- Raffle rules/prizes/disclosures are approved.
- Ticket pricing/numbering and permitted payment/delivery methods are approved.
- Sales dates/cutoff and drawing procedure are approved.
- Required recordkeeping and operator responsibilities are confirmed.

Texas pilot mode remains offline cash/check; no online raffle-ticket checkout.

## Deferred — do not implement yet

- Shared Campaign Boost Engine.
- Marketplace / Experience Marketplace.
- Sponsor-a-Day migration.
- Puzzle.
- Fill the Field.
- 100 Board.
- Journey / Build It.
- Sponsorship CRM.
- Other fundraiser experiences.
- In-platform random winner generator.

The Boost Engine remains a future shared capability for premium units, contribution multipliers, sponsor matches, promotional windows, and milestone unlocks. For raffles it must not alter odds, ticket quantities, price, or eligibility without separate approved jurisdiction/compliance work.

## Project isolation

This repository is Raffle Hub only.

Do not implement Aspire One or Aspire Coaching Studio work here.
Do not copy instructions from those projects unless the user explicitly approves a cross-project change.

## Agent operating rule

For future implementation tasks:
1. Read `AGENTS.md`.
2. Read this file.
3. Verify remote HEAD and PR state.
4. Execute **only** the “Next approved action” above.
5. Preserve all authorization, RLS, immutable ledger, idempotency, ticket, drawing, and audit guarantees.
6. Keep PR #2 draft/unmerged unless the user explicitly approves a merge.
7. Stop at the next QA/approval gate and report the exact commit SHA, tests, hosted state, and known gaps.
