# Raffle Hub Project State

_Last updated: 2026-10-15_

This file is the changing execution state for the Aspire Raffle Hub pilot. Read it together with `AGENTS.md`, `docs/architecture.md`, `docs/raffle-pilot-backlog.md`, `docs/money-custody.md`, `docs/drawing-operations.md`, `docs/MONEY_HOSTED_QA.md`, `docs/MONEY_HOSTED_QA_RESULTS.md`, `docs/MONEY_OPERATOR_UI_REVIEW.md`, `docs/SELLER_SHARING.md`, and `docs/ADMIN_LEARNING_HUB.md`.

## Source of truth

- Repository: `Aspirefutbol/aspire-raffle-hub`
- Active implementation branch: `feat/phase-1-fundraising-slice`
- Current branch head: `c947f7d1bdaa96a801ee981af552ae5aacbe7f81`
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

## Current approved action

**Implement Seller Sharing + Parent/Player Seller Toolkit.**

Approved blueprint: `docs/SELLER_SHARING.md`.

### Required behavior

- Opaque, non-sequential seller links.
- Copy link, SMS/text, email, WhatsApp, and QR sharing.
- Public supporter page is request/interest only.
- No online raffle payment.
- No public ticket reservation.
- No public ticket issuance.
- No automatic sale creation.
- Authorized seller follows up, receives approved offline payment, and records the sale through the authenticated seller workflow.
- Private request inbox scoped to the authorized linked family/seller.
- Request states such as new, contacted, completed, declined, and expired.
- Minimum public identity by default; do not expose private roster, household, buyer, money, ticket, or audit data.
- Abuse controls, request validation, rate limiting, and safe token rotation/revocation.
- Parent/player Seller Toolkit with selling steps, scripts, integrity reminders, and offline-payment guidance.

### Implementation sequence

1. Schema/RPC/RLS and abuse-control tests.
2. Opaque seller-link lifecycle and scoped request inbox.
3. Public request-only page.
4. Family copy/SMS/email/WhatsApp/QR controls.
5. Request-to-record-sale handoff guidance.
6. Parent/player Seller Toolkit.
7. Desktop, 360px mobile, privacy, tenant-isolation, retry, and regression tests.
8. Commit/push, hosted QA deploy, and stop for operator review.

Preserve all existing authorization, tenant isolation, immutable ledgers, ticket inventory, drawing integrity, money custody, idempotency, and audit behavior.

## Following approved slices

### Admin Learning Hub

Blueprint: `docs/ADMIN_LEARNING_HUB.md`.

First slice should include:

- admin-only Learning Hub navigation
- searchable operating guides and FAQ
- launch-critical guides for campaign setup, inventory, sales, reversals/corrections, money/reconciliation, checks/exceptions, deposits/refunds/adjustments, drawing, roles/scopes, and troubleshooting
- contextual help links from important operating screens
- version-controlled, product-grounded content
- no mutation capability from help content

Keep this separate from the Parent/Player Seller Toolkit.

### Aspire operator rehearsal

Run the complete hosted staging path:

campaign setup → enrollment → ticket allocation → family sharing/selling → captain monitoring → sale → money turn-in/reconciliation → reversal/correction → close sales → freeze/export drawing population → external/physical draw → result/certification → final reconciliation → audit verification.

Produce a go-live blocker list categorized as:

- Product
- Operations
- Compliance/legal
- Training
- Infrastructure

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
