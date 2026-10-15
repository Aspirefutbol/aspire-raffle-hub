# Money Hosted QA — Automated Staging Results

_Date: 2026-10-15_

These checks were run against the existing Aspire Raffle Hub staging Supabase project and current hosted feature-branch deployment. Database mutation scenarios were wrapped in explicit transactions and rolled back. Follow-up queries confirmed no hosted QA custody events persisted.

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

Pre-existing campaign data remained intact after rollback checks.

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

## Rollback verification

Follow-up hosted queries confirmed:

- zero `hosted-%` QA custody events persisted
- rollback-only correction ticket inventory did not remain in hosted staging
- live campaign money balances were unchanged by these automated checks

## Remaining hosted QA

The backend/accounting logic is now strongly validated on the real hosted staging database.

Still required before Money QA acceptance:

- hands-on admin UI walkthrough on Netlify staging
- confirm form labels and operation choices are understandable
- confirm expected/received/outstanding/reconciled values visually match backend behavior
- confirm family/captain UI remains redacted in the rendered app
- mobile-width usability check
- verify safe retry UX in the hosted UI
- operator review of terminology and workflow clarity

Do not start Seller Sharing until this final UI/operator review is accepted.
