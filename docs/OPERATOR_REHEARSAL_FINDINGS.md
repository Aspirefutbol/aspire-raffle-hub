# Aspire Operator Rehearsal — Findings Log

_Last updated: 2026-10-16_

This file records what the hosted Aspire operator rehearsal has actually proven, the friction discovered during real operator use, and what still remains before a controlled pilot.

Primary synthetic campaign:

- Name: **OPERATOR REHEARSAL — Aspire Pilot**
- Campaign ID: `5a892877-1b83-4a3b-94d3-7a6e3aa2fb12`
- Current lifecycle: **ACTIVE**
- Ticket price: **$5.00**
- Ticket prefix: **OR1**
- Participants: **3 active**
- Inventory current state: **9 ALLOCATED / 2 ISSUED / 1 VOIDED**
- Active recorded sales: **2 / $10.00 total**

## Passed rehearsal steps

### Campaign setup, readiness, enrollment, activation, inventory

Passed through the hosted UI.

Verified:

- fresh rehearsal campaign created
- correct 2026–27 season selected
- activation readiness completed
- U13 Boys enrollment succeeded with 3 synthetic players
- campaign moved to ACTIVE
- inventory prepared at 4 tickets per player / 12 total
- ticket inventory uniqueness and allocation behavior remained intact

Observed friction:

- First enrollment attempt showed a transient network/uncertain-result message after a recent deploy. No participant rows were committed. A normal page refresh and retry succeeded.
- Treat as **Infrastructure / low** unless repeated in production-like pilot testing.

### Seller Sharing and public privacy

Passed through hosted UI.

Verified:

- family seller link created
- Copy / SMS / Email / WhatsApp / QR sharing available
- signed-out public supporter page exposed campaign-level information only
- no player, team, household, ticket-number, balance, money, or audit information was visible publicly
- supporter request remained nonbinding
- public request did not automatically create a sale
- private request arrived in the seller inbox
- request progressed from new → contacted → completed
- completed request linked to recorded sale `82bacaf2-df17-4cd5-a0f0-01a5d8bf5e9a`

Known follow-up from earlier Seller Sharing acceptance:

- After reload, the seller control can read `Share fundraiser` even when replacing an existing one-time token. Consider clearer copy such as `Create / replace seller link`.
- Category: **Product / low**.
- Does not block controlled pilot.

### Family sale and captain monitoring

Passed through hosted UI.

Verified:

- first sale: 1 ticket / $5 cash / ticket `OR1-000009`
- second sale: 1 ticket / $5 check / ticket `OR1-000010`
- total recorded sales reached $10 / 2 tickets
- captain/team view showed assigned-team totals
- captain view did not expose private supporter request/contact data
- captain role did not gain seller-wide authority

### Money custody and reconciliation

Complete for the rehearsal reconciliation path and passing.

Verified through hosted UI and ledger:

1. Partial cash turn-in:
   - $2.50 cash
   - reason: `Operator rehearsal partial cash turn-in`
   - ledger event: TURN_IN

2. Check turn-in:
   - $5.00 check
   - reference: `Rehearsal Check 001`
   - reason: `Operator rehearsal check turn-in`
   - ledger event: TURN_IN

3. Returned check:
   - reason: `Operator rehearsal returned check`
   - ledger recorded returned-check / exception behavior
   - check did not automatically void the issued raffle ticket

Observed balances after returned-check scenario:

- Recorded sales: $10.00
- Money received: $2.50
- Money still due: $7.50
- Uncleared checks: $0.00
- Check issues: $5.00
- Reconciled money: $2.50

Then completed through hosted operator actions and verified in the ledger:

4. Replacement cash for the returned check:
   - $5.00 cash receipt
   - reason: `Operator rehearsal replacement cash for returned check`

5. Final cash settlement:
   - $2.50 cash receipt
   - reason: `Operator rehearsal final cash settlement`

6. Returned-check exception resolved:
   - reason: `Operator rehearsal returned check resolved after replacement cash`

7. Sale reversal + linked correction:
   - original sale: `2f65268d-9fdf-4349-bdf0-d18bd8cba424`
   - original ticket: `OR1-000010` → VOIDED
   - correction sale: `ef5ad4c8-ce5b-4f0b-a4e4-c6f0c02c5701`
   - fresh replacement ticket: `OR1-000011` → ISSUED
   - already-held money transferred by two explicit $2.50 credits; no second receipt created

Final verified reconciliation after the correction:

- Active recorded sales: $10.00 / 2 sales
- Money expected: $10.00
- Money received: $10.00
- Money still due: $0.00
- Uncleared checks: $0.00
- Check issues: $0.00
- Ticket inventory: 9 ALLOCATED / 2 ISSUED / 1 VOIDED
- Audit, campaign, ticket, and money hash chains all verify with no bad position

## UX findings and fixes made during rehearsal

### 1. Money action area was hard to find

Operator feedback:

> “I had a hard time finding ‘record money movement’.”

Resolution implemented:

- prominent **Record money** shortcut near the page header
- section renamed to **Record money received / adjustments**
- selector renamed from **Money operation** to **Choose action**
- `Record turn-in` renamed to **Record turn-in (full or partial)**
- contextual explanation changes with the selected action

Status: **Fixed, validated/deployed before next rehearsal step.**

### 2. Partial turn-in behavior was not discoverable

Operator feedback:

> “There is not partial cash turn in or I cannot find it.”

Resolution implemented:

- action explicitly labeled **Record turn-in (full or partial)**
- help text explains that the operator enters the amount actually received; no separate partial-payment mode is required
- Learning Hub updated to match the new UI terminology

Status: **Fixed. Learning Hub alignment validation pending latest CI/deploy.**

### 3. Critical workflow panels did not stand out enough

Operator feedback:

> Important tabs such as “Record money received / adjustments” should stand out more.

Resolution implemented:

A reusable highlighted **Action center** treatment was added to:

- Record money received / adjustments
- Campaign activation readiness
- Drawing readiness / frozen population

Treatment includes:

- light brand-tinted header
- stronger brand border/ring
- action icon
- clearer hierarchy from reporting cards
- explicit “Action center” language

Status: **Implemented and deployed green on commit `db21faba27aba949529bf86c4d4e760606835dcf`.**

## Learning Hub findings

Learning Hub acceptance passed before the full rehearsal.

During the rehearsal, money workflow guidance was updated again so the articles now reflect:

- Record money shortcut
- highlighted action center
- Choose action
- Record turn-in (full or partial)
- returned-check workflow

This is the desired operating pattern: rehearsal questions should feed directly back into the in-product guide content.

## Rehearsal fixture timing note

The current rehearsal campaign has a disclosed drawing time of **2026-10-18 11:24 AM America/Chicago**.

The drawing transaction correctly enforces that an external/physical result:

- uses the current frozen snapshot
- occurs after the snapshot freeze
- occurs at or after the campaign’s disclosed drawing time
- cannot be recorded with a future timestamp

Therefore the current campaign cannot complete the hands-on external result/certification step before the disclosed Oct. 18 drawing time. This is **expected integrity behavior, not a product defect**.

For future same-session operator rehearsals, use a compressed but valid synthetic schedule (for example, a sales close shortly after setup and a disclosed draw shortly after close) so the operator can exercise close → freeze → export → external result → certification without bypassing locked disclosures.

Until Oct. 18, this rehearsal can still complete money resolution, reversal/correction, sales close when appropriate, drawing-readiness review, freeze, and export. Do not alter the locked draw date directly in the database merely to make the rehearsal finish early.

## Current next rehearsal steps

The rehearsal is now complete through reversal/correction and clean money reconciliation.

Timing gates for the locked rehearsal disclosures:

- Sales close: **2026-10-17 11:24 AM America/Chicago**
- Disclosed drawing time: **2026-10-18 11:24 AM America/Chicago**

Do not alter these locked timestamps just to advance the rehearsal.

1. At or after the disclosed sales-close time, close sales through the hosted operator UI.
2. Verify a post-close sale is blocked.
3. Freeze drawing population.
4. Export frozen population.
5. At or after the disclosed drawing time, record the synthetic external/physical result.
6. Certify drawing.
7. Move campaign to DRAWN.
8. Complete final money/ticket reconciliation and audit verification.

## Current go-live blocker log

### Product

**Medium — Money action discoverability**  
Resolved in rehearsal. Must remain green in final regression and hosted review.

**Low — Seller link replacement wording**  
One-time link behavior is correct, but returning users can misread `Share fundraiser` as preserving the old token. Copy polish recommended before broad rollout.

### Operations

No controlled-pilot blocker identified yet.

Still to decide before live use:

- who physically receives team/family cash and checks
- custody handoff frequency
- where deposit evidence is retained
- who resolves returned checks
- who owns drawing evidence retention

### Compliance/legal

**Production gate — unresolved outside the application.**

Before any live raffle:

- confirm eligible legal entity / raffle authority
- approve official rules and prize disclosures
- approve ticket price/numbering/payment/delivery method
- approve sales dates/cutoff/drawing method
- approve recordkeeping and operator responsibilities

This remains a live-operation blocker, not a staging/product blocker.

### Training

No major blocker. Learning Hub is reducing operator ambiguity as intended.

Continue capturing operator questions during the remaining rehearsal and convert them into guide/FAQ improvements.

### Infrastructure

No current blocker.

Current staging uses:

- Supabase staging
- Netlify staging
- GitHub Actions
- draft/unmerged PR #2

Final production review must still confirm production secrets, backups/monitoring, email/domain configuration, and production deployment plan.

## Exit status

The rehearsal is **not yet accepted**.

The system has successfully passed returned-check handling, full money resolution, sale reversal, linked correction, fresh-ticket issuance, credit transfer, and hash-chain verification. The remaining acceptance work is time-gated: close sales and post-close blocking after Oct. 17 at 11:24 AM CDT, then drawing freeze/export and the external result/certification flow at or after Oct. 18 at 11:24 AM CDT.
