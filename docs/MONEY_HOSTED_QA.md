# Hosted QA — Money Custody & Reconciliation

Use this checklist on the existing Netlify staging branch deployment for PR #2.

## Target

- Netlify project: `aspire-raffle-hub-staging`
- Branch: `feat/phase-1-fundraising-slice`
- Admin entry: `/o/aspire/campaigns`
- Family entry: `/o/aspire/fundraising`
- Captain entry: `/o/aspire/team-fundraising`

Do not merge PR #2 during this QA.

## Pre-flight

- Confirm branch deployment is serving the current feature-branch code.
- Confirm staging Supabase includes migration `20261016000100_money_custody`.
- Use QA/staging data only.
- Keep Seller Sharing out of scope.

## Scenario A — partial cash turn-in

1. Use a campaign with at least two recorded offline sales for the same collecting seller/family account.
2. Open **Campaign → Money & reconciliation** as an authorized admin.
3. Confirm before turn-in:
   - expected > 0
   - received = 0 for the test amount
   - outstanding = expected
4. Record a cash turn-in for less than the seller's total outstanding balance.
5. Verify:
   - received increases by the turn-in amount
   - outstanding decreases by the same amount
   - recorded sales and issued tickets do not change
   - immutable money history shows one receipt event
   - seller/team/player/campaign balances agree
6. Retry the exact same submission if the UI exposes preserved retry behavior.
7. Verify no duplicate receipt is created.

## Scenario B — complete the remaining balance

1. Record a second cash turn-in for the remaining outstanding amount.
2. Verify:
   - outstanding becomes $0 for the test seller account
   - received equals expected, subject to any approved adjustments
   - reconciled matches cash received
   - ticket counts remain unchanged

## Scenario C — check lifecycle

1. Create or use a recorded sale with check as the seller's collection method.
2. Record a check turn-in.
3. Verify the amount appears as **uncleared** and is not treated as reconciled cash.
4. Record **check cleared**.
5. Verify the uncleared amount clears and reconciled money updates.
6. On a separate check receipt, record **check returned**.
7. Verify:
   - received/held balance is reduced according to the custody model
   - an exception is opened
   - outstanding obligation reappears where appropriate
   - the raffle ticket is NOT silently voided
   - the original receipt/check event remains in immutable history

## Scenario D — reversal after receipt

1. Record money received for a sale.
2. Reverse the underlying sale using the existing approved sale-reversal flow.
3. Verify:
   - original physical receipt remains
   - sale expected balance changes
   - any resulting credit/overpayment is visible
   - no history is deleted or rewritten
   - ticket reversal behavior follows existing ticket rules only

## Scenario E — correction/credit transfer

1. Create a linked correction sale from a reversed sale.
2. Use the explicit credit-transfer operation to move eligible held receipt value to the replacement sale.
3. Verify:
   - no new cash receipt is manufactured
   - source and destination sale references remain visible in immutable history
   - balances net correctly
   - new/corrected ticket numbers remain independent of the money transfer

## Scenario F — refund / approved adjustment

1. Record an explicit refund against held receipt value.
2. Verify received money decreases while the refund remains visible as an immutable financial event.
3. Record an approved positive adjustment/relief where appropriate.
4. Verify:
   - outstanding liability decreases
   - no fake receipt is created
   - adjustment amount is reported separately from received cash/check money

## Scenario G — deposits

1. Record a deposit for eligible cash or a cleared check.
2. Verify:
   - deposited total increases
   - deposit reference is retained
   - deposit does not change ticket validity
   - later refund/bounce does not rewrite historical deposit evidence

## Scope and privacy checks

### Family
- Family cannot open the admin Money & reconciliation route.
- Family only sees linked-player balance summaries.
- Family cannot see:
  - raw receipt IDs
  - private notes/reasons
  - other seller accounts
  - buyer contacts
  - admin money controls

### Captain / team manager
- Captain sees only assigned-team money summaries.
- Captain cannot access admin reconciliation operations.
- Captain cannot see unrelated families or private receipt history.

## Pass criteria

Hosted Money QA passes only if all are true:

- sale recording remains separate from organization receipt
- partial/multi-sale turn-ins reconcile correctly
- exact retries do not duplicate money events
- checks have explicit pending/cleared/returned states
- returned checks create financial exceptions without silently voiding tickets
- reversal-after-receipt preserves physical receipt facts
- correction credit transfer moves custody allocation without creating new cash
- refunds/adjustments/deposits are explicit append-only events
- player/team/seller/campaign totals agree
- family/captain views are scoped and redacted
- no ticket, drawing, tenant, or audit integrity regression is observed

## Stop gate

After the checklist is completed, record findings in `docs/PROJECT_STATE.md` and stop for approval.

Do **not** begin Seller Sharing / Delivery until hosted Money QA is explicitly accepted.
