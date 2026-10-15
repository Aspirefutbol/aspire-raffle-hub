# Money Hosted QA — Automated Staging Results

_Date: 2026-10-15_

These checks were run against the existing Aspire Raffle Hub staging Supabase project and current hosted feature-branch deployment. Database mutation scenarios were wrapped in explicit transactions and rolled back unless explicitly noted as a hands-on operator UI test. Follow-up queries confirmed rollback QA custody events did not persist.

## Hosted deployment

- Hosted QA deploy workflow: passed.
- Netlify staging site: refreshed from current feature-branch head.
- Deployment target: existing `aspire-raffle-hub-staging` site.
- No merge to `main`.
- PR #2 remains draft/unmerged.

## Staging campaign

Campaign used for QA:

- `QA ONLY — Aspire PR #2`
- status: ACTIVE
- ticket price: $5.00

## Passed hosted backend checks

### Partial receipt / balances

A rollback-only $2.50 cash receipt against $10.00 expected:

- received: $0.00 → $2.50
- outstanding: $10.00 → $7.50
- reconciled: $0.00 → $2.50
- recorded sales unchanged
- ticket counts unchanged

### Exact retry / idempotency

The exact same receipt payload and idempotency key were submitted twice inside one transaction.

Result:

- only one custody event existed
- received increased only once
- retry did not duplicate money

After rollback:

- zero QA receipt events persisted
- live received balance remained unchanged

### Family / captain scope

Using the current combined family/captain QA member:

- family projection returned exactly one linked participant
- team projection returned three assigned-team participants
- family event history returned zero private events
- team event history returned zero private events
- direct money mutation as family/captain was denied because the user lacks `reconciliation.manage`

### Check cleared

A rollback-only $5.00 check turn-in was recorded and then explicitly cleared.

Result:

- received: $5.00
- uncleared: $0.00 after clearance
- reconciled: $5.00
- exactly two custody events existed: receipt + check-cleared

### Returned check

A rollback-only $5.00 check receipt was recorded and then returned.

Result:

- received returned to $0.00
- outstanding returned to the original obligation
- exception balance became $5.00
- issued raffle-ticket count did not change because of the returned check

This confirms the hosted system keeps check outcome separate from ticket validity.

### Deposit evidence

A rollback-only $5.00 cash receipt was recorded and then deposited.

Result:

- received: $5.00
- reconciled: $5.00
- deposited: $5.00
- outstanding reduced only by the actual receipt
- deposit remained a distinct historical fact

### Reversal after receipt

A rollback-only $5.00 receipt was recorded against an existing sale and the underlying sale was then reversed.

Result:

- original receipt remained present
- campaign received stayed $5.00
- a $5.00 credit/overpayment appeared
- expected balance decreased
- ticket reversal followed the existing ticket reversal flow
- custody history was not erased

### Correction + credit transfer

A rollback-only correction scenario:

1. generated and allocated one fresh replacement ticket
2. recorded a $5.00 cash receipt against the original sale
3. reversed the original sale
4. created a linked correction sale using a fresh ticket number
5. transferred the held receipt credit from the reversed sale to the replacement sale

Result:

- exactly one physical receipt existed
- exactly one credit-transfer event existed
- no second cash receipt was manufactured
- replacement sale used a fresh ticket number
- received balance remained $5.00
- source and replacement money obligations netted correctly

## Hands-on operator UI validation

### Partial cash turn-in — PASSED

On the hosted Netlify staging UI, the admin reviewer recorded a real QA $2.50 cash turn-in.

Before:

- recorded sales: $20.00
- expected: $10.00
- organization receipts: $0.00
- outstanding: $10.00
- reconciled: $0.00

After submission:

- recorded sales remained $20.00
- expected remained $10.00
- organization receipts became $2.50
- outstanding became $7.50
- reconciled became $2.50
- uncleared checks remained $0.00
- exceptions remained $0.00
- credits, adjustments, and deposits remained $0.00

This matches the verified hosted accounting model and confirms the primary admin turn-in path works end to end through the rendered UI.

### Immutable history — PASSED

The hosted UI shows the persisted $2.50 cash turn-in in **Immutable money history** with:

- event type: receipt
- amount: $2.50
- payment method: cash
- operator attribution
- operator reason: `Operator UI review — partial cash turn-in`
- timestamp
- immutable event identifier
- actor identifier

The same page also shows the team and player roll-ups reconciling correctly:

- U13 Boys: $10.00 expected · $2.50 received · $7.50 outstanding · $2.50 reconciled
- Liam Smith carries the $10.00 expected / $2.50 received obligation
- Isaac Martinez and Mateo Garcia remain at $0.00

This confirms the persisted UI receipt is visible for audit and the player/team balance projections reconcile with campaign totals.

### UX observations

The money dashboard is structurally clear and the balances are readable. Some labels remain accounting-heavy for general operators:

- `Organization receipts (net)`
- `Approved liability relief`
- `Unallocated credits`

These should be supported by contextual help / Learning Hub definitions and may warrant simpler display labels before production.

## Rollback verification

Follow-up hosted queries confirmed:

- zero automated `hosted-%` QA custody events persisted
- rollback-only correction ticket inventory did not remain in hosted staging
- live campaign balances were unaffected by automated rollback checks

The hands-on $2.50 operator UI receipt is intentionally persisted as QA evidence.

### Family scope rendered UI — PASSED

The hosted family view for the combined family/captain QA account shows:

- exactly one participating linked player: **Liam Smith**
- family fundraiser card for Liam only
- campaign status / ticket price / sales close date
- amount raised and tickets sold
- personal fundraising goal
- available ticket count / assigned ticket span
- no admin Money & reconciliation controls
- no private receipt history
- no raw receipt identifiers
- no private money notes

This matches the verified family projection and confirms rendered family scope remains restricted.

### Captain/team rendered UI — PASSED

The hosted Team fundraising view for the combined family/captain QA account shows:

- only the assigned team: **U13 Boys**
- assigned-team raised total
- team ticket count
- participating-player count
- team goal progress
- low/zero-progress follow-up summary
- no admin Money & reconciliation controls
- no private receipt history
- no raw receipt identifiers
- no unrelated-team data

This matches the verified team projection and confirms rendered captain scope remains restricted.

### Mobile captain/team view — PASSED

Safari Responsive Design Mode at approximately 393 × 852 shows the Team fundraising view without visible horizontal overflow. The mobile header collapses to a hamburger menu, summary cards remain readable, team progress fits within the viewport, and the assigned-team data remains usable at phone width.

### Mobile admin Money view — PASSED

Safari Responsive Design Mode at approximately 393 × 852 shows the Money & reconciliation dashboard without visible horizontal overflow. The balance cards render in a readable two-column mobile grid, values remain legible, the explanatory note wraps correctly, and the page header/navigation remain usable at phone width.

The live mobile values matched the persisted QA state:

- recorded sales: $20.00
- expected: $10.00
- organization receipts: $2.50
- outstanding: $7.50
- reconciled: $2.50
- uncleared checks: $0.00
- open check exceptions: $0.00
- unallocated credits: $0.00
- approved liability relief: $0.00
- recorded deposits: $0.00

## Remaining hosted QA

Still required before Money QA acceptance:

- operator review of money operation labels/options
- safe-retry wording review if that state naturally appears
- final terminology/clarity approval

Do not start Seller Sharing until this final UI/operator review is accepted.
