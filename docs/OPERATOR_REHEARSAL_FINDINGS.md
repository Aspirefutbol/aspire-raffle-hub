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
- Inventory current state: **10 ALLOCATED / 2 ISSUED**
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

Partially complete and passing so far.

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

## Current next rehearsal steps

Resume after the latest Learning Hub wording update is green/deployed.

1. Refresh Money & reconciliation and visually confirm the highlighted action center.
2. Record replacement cash for the returned check.
3. Resolve the check issue.
4. Complete any remaining outstanding seller balance needed for clean reconciliation.
5. Reverse one sale.
6. Record a linked correction using fresh ticket number(s).
7. Handle already-held money through credit/refund/adjustment rather than a second receipt.
8. Close sales.
9. Verify post-close sale is blocked.
10. Freeze drawing population.
11. Export frozen population.
12. Record synthetic external/physical result.
13. Certify drawing.
14. Move campaign to DRAWN.
15. Final money/ticket reconciliation and audit verification.

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

The system has successfully passed the path through returned-check handling. Remaining acceptance work is reversal/correction, close sales, drawing lifecycle, final reconciliation, and audit verification.
