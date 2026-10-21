# Money Custody & Reconciliation

This slice adds physical cash/check custody to the existing raffle branch.
Recorded sales and issued tickets are not organization receipts. No online
payment, banking integration, automatic ticket void, random drawing, or Seller
Sharing is introduced.

## Accounting definitions

All amounts are integer cents. `money_custody_events` and
`money_custody_allocations` are append-only and writable only through
`record_money_custody`. Each operation also appends an anchored `money_events`
record and trigger-generated audit facts; existing ledger payloads and original
sales/reversals/drawing rows are unchanged.

- **Recorded sales:** gross original sale face value, including later reversals.
- **Expected:** sale face value excluding approved sale reversals.
- **Received:** immutable organization receipt allocations, less actual refunds
  and returned checks. Transfers move the existing receipt's allocation and have
  zero net cash effect. A sale reversal does not remove a receipt.
- **Outstanding:** per-sale `max(expected - received - approved relief, 0)`.
  Display sums retain unresolved obligations even when another sale has a credit.
- **Credit:** per-sale `max(received + approved relief - expected, 0)`. Only
  actually held receipt funds can be refunded/transferred. Approved relief is
  not cash.
- **Uncleared:** net received allocations belonging to pending check receipts.
- **Reconciled funds:** received less uncleared checks; this is not a claim of
  bank settlement or proof of deposit.
- **Exceptions:** open returned-check amounts plus other explicitly opened
  financial exception amounts. A resolution does not itself receive money or
  waive an obligation. Resolve only after outstanding funds are settled or
  relieved through an approved adjustment.
- **Deposited:** historical deposit evidence. Later refunds/bounces do not
  rewrite it; it is not a bank balance. Operators must retain external deposit,
  check-return, and refund evidence separately.

Balances are derived per player, collecting seller, team, and campaign. A
replacement/correction follows its immutable original-sale lineage to retain
the original collecting seller's custody account, even when an administrator
records the replacement. It never assigns the family's cash debt to the admin
merely because that admin corrected the entry. Original `created_by` attribution
is preserved in the sale itself.

## Transactions and workflow

1. Open **Campaign → Money & reconciliation**. Choose the collecting seller
   account. A turn-in may cover multiple sales/players for that account and may
   be partial. If a household has multiple collecting accounts, record each
   account's turn-in separately to preserve custody attribution.
2. Record cash or an uncleared check, amount, reference, and a reason/variance
   note. Receipt allocations use deterministic partial FIFO (`sold_at`, sale
   UUID). Receipt value cannot exceed the account's net outstanding balance;
   allocate existing credits explicitly before collecting more money.
3. Record a check's clearance or return explicitly. A cleared check may later
   bounce. A returned check cannot be marked cleared again: record replacement
   funds separately and explicitly resolve the exception. Ticket eligibility
   does not change, including after the drawing population is frozen.
4. Record deposits only for cash or cleared checks. Partial deposits are
   supported; already deposited funds cannot be deposited again. Retain the
   external batch/reference. This records evidence, not a bank API transaction.
5. A sale reversal after receipt creates an overpayment/credit. An approver may
   transfer existing receipt credit to another outstanding obligation in the
   same collecting account or explicitly record an actual refund. A correction
   credit never manufactures another cash receipt. Refunds alone do not cancel
   sale obligations; any liability relief is a separate approved adjustment.
6. Positive adjustments relieve outstanding liability; negative adjustments
   undo only previously approved relief. They are not receipts. Record other
   financial exceptions against a specific sale, with amount/reason, and resolve
   them explicitly. Returned-check and other exceptions remain distinct facts.

Every operation locks the campaign before inspecting balances, serializing with
sales, reversals, drawing operations, and other custody writes. It locks and
rechecks active membership/role authority. Idempotency is bound to organization,
authenticated actor, key, and request fingerprint. Exact retries return the
original result; changed payloads cannot reuse a key. The form freezes uncertain
submissions and reuses the same payload/key after a lost response.

## Authorization and read projections

- `reconciliation.manage`: receive, check outcomes, exceptions, deposits.
- `adjustments.approve`: refunds, credit transfers, and signed liability relief.
  The actor/approver comes from SQL authentication, not a submitted user ID.
- `campaign_money(..., 'admin')`: existing reconciliation, adjustment, or audit
  authority. This includes private receipt/event/reference history.
- Explicit `family` and `team` projections use the same current guardian/player
  and assigned-team predicates as fundraising. They contain balance summaries,
  not raw events, buyer contacts, private notes, receipt IDs, or other sellers.
  New raw custody tables have no family/captain policy. No role grants changed.

Family/team detail pages include a read-only Money status panel. The dedicated
admin money page is unavailable to those roles even if they know its URL.

## Validation and operation

`supabase/tests/money_custody.test.sql` runs transactional isolated fixtures for
tenant denial, current scopes, raw-write denial, retries, partial multi-sale FIFO,
cash/check states, late returns after deposit, exceptions, correction credits,
refunds/relief, operator-entered corrections, aggregates, immutable records, ledger
hashes, and a returned check after an immutable drawing freeze.

`npm run test:money-concurrency` uses real overlapping PostgreSQL sessions and
lock barriers: duplicate receipt retries, competing receipts, receipt/reversal,
returned-check races, and competing refunds/credit transfers. Original sales and
drawing concurrency runners remain enabled. All runners accept only a local Unix
Docker endpoint; this supports the v2 isolated daemon and rejects remote Docker.

`e2e/money.spec.ts` exercises the admin form, a committed response lost in transit
and safely retried, checks, partial turn-ins, correction credit/refund/adjustment,
deposits, and redacted family/team pages at 360px. The original browser suite and
Mailpit invitation acceptance remain enabled.

For full regression, follow `docs/deployment.md`, including fresh seed data after
the concurrency fixtures. Preserve any local work before a reset. No hosted
database is reset or seeded. This slice does not assert production pilot launch
readiness; operator/compliance review, physical evidence, and launch rehearsal
remain separate gates.

Local acceptance on October 14, 2026 (Next 16.3.8, local Supabase 2.118.0):

| Check | Result |
|---|---|
| Fresh migration application and generated types | Passed; exact type match |
| pgTAP/RLS | 809 assertions passed, including 120 custody assertions |
| Lint, typecheck, unit tests | Passed; 157 tests across 18 files, no skips |
| Real overlapping transaction groups | 13 passed: 4 sales, 4 drawing, 5 custody |
| Production build | Passed |
| Full desktop/phone browser suite | 27 passed, no skips or flaky retries; real Mailpit acceptance retained |
| Audit export and continuity | Verified before/after browser mutations |

The browser denial check verifies the rendered not-found boundary and absence of
financial data/forms. Next's streamed not-found response can already have HTTP
200 headers; transport status alone is not the financial authorization check.

## Hosted QA

Keep PR #2 draft and unmerged. Push only
`feat/phase-1-fundraising-slice`. Use the existing Netlify project
`aspire-raffle-hub-staging` and its branch deployment:
`https://feat/phase-1-fundraising-slice--aspire-raffle-hub-staging.netlify.app`.
The money route is `/o/aspire/campaigns/<campaign-id>/money`; existing admin,
family, and captain entry routes are unchanged. Apply the new migration to the
existing QA Supabase project before exercising custody UI there.

Refreshing hosted QA requires the existing Netlify credential binding
(`NETLIFY_AUTH_TOKEN`) and hosted database migration access (for example
`STAGING_DB_URL`, or the existing Supabase access/project/password bindings).
No such hosted bindings were present when this v2 task started. Git push uses
the existing platform Git authentication independently of API token presence.
If hosted access remains absent, report the successful push SHA and exact
missing bindings; do not create a replacement site or merge the PR.
