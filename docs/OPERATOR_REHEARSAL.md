# Aspire Full Operator Rehearsal

## Purpose

Prove that an Aspire operator can run one raffle campaign end to end in hosted staging using the same product paths intended for the pilot.

Use synthetic data only. This rehearsal is operational acceptance, not legal approval for a live raffle.

## Ground rules

- Hosted staging only.
- PR #2 stays draft and unmerged.
- Use the application UI for operator actions whenever the purpose is to validate the operator workflow.
- Use direct database inspection only to verify outcomes, isolation, immutable history, hashes, and audit evidence.
- Do not bypass a broken UI step just to make the rehearsal pass; record it as a blocker first.
- Preserve accepted Money Custody, Seller Sharing, Learning Hub, authorization, RLS, tenant isolation, ticket, drawing, idempotency, and audit behavior.
- Texas pilot mode remains offline cash/check; no online raffle-ticket checkout.
- Drawing remains physical/external; the application does not randomly choose a winner.

## Rehearsal fixture

Create a new clearly synthetic campaign named:

**OPERATOR REHEARSAL — Aspire Pilot**

Recommended fixture:

- Ticket price: $5.00
- One test team with at least two enrolled players
- Small allocation: 3–5 tickets per player
- Synthetic buyer/supporter names only
- Cash plus one check scenario
- Short staged sales/drawing dates appropriate for the rehearsal. If the entire rehearsal must finish in one session, use a compressed valid window: sales close shortly after setup and disclosed draw shortly after close. Never bypass the locked draw time later.

Do not reuse the prior QA campaign as the primary rehearsal campaign; a fresh campaign is required to prove setup and lifecycle behavior.

## Acceptance path

### 1. Campaign setup

Operator creates the draft and completes required configuration.

Verify:

- campaign name and description
- ticket price and prefix
- sales window and drawing time
- support contact
- rules/disclosures
- activation readiness
- locked disclosures after activation

Evidence:

- hosted screenshot
- campaign ID
- audit event(s)

### 2. Enrollment and ticket inventory

Operator enrolls players and prepares inventory.

Verify:

- intended players only
- team attribution
- participant goals
- ticket generation
- allocation counts
- no duplicate ticket numbers

Evidence:

- participant list
- ticket spans
- database uniqueness check

### 3. Seller Sharing

Family creates a seller link and opens the public supporter page.

Verify:

- public campaign-only identity
- no player/team/household/balance leakage
- request-only language
- no online payment or automatic sale
- QR/share controls
- request lands in private seller inbox

Evidence:

- public page screenshot
- request status
- no sale/money event created by request

### 4. Family sale

Family follows up offline and records one sale.

Verify:

- full face-value amount
- issued ticket number(s)
- family totals update
- supporter request can link to the recorded sale and complete

Evidence:

- ticket receipt
- sale ID
- request completion link

### 5. Captain monitoring

Assigned captain reviews team fundraising.

Verify:

- assigned team only
- progress/totals update
- no family seller authority gained through captain role
- no private supporter contact data exposed

Evidence:

- hosted captain screenshot
- scoped projection check

### 6. Money turn-in and reconciliation

Admin/finance records physical money received.

Include:

- partial cash turn-in
- remaining amount due
- one check receipt
- check clearance or returned-check scenario
- deposit evidence where appropriate

Verify:

- expected / received / still due / reconciled
- ticket validity remains separate from money custody
- immutable money history

Evidence:

- money dashboard
- event IDs
- balances before/after

### 7. Reversal and linked correction

Reverse one sale and record a linked correction.

Verify:

- original sale retained
- original ticket number(s) voided and never reused
- replacement receives fresh ticket number(s)
- money already held is handled through credit/refund/adjustment workflow rather than a fake second receipt

Evidence:

- original and correction sale IDs
- ticket status history
- money event linkage

### 8. Close sales

Operator closes the campaign.

Verify:

- new sales stop
- existing history remains
- money reconciliation remains independent

Evidence:

- lifecycle status
- attempted post-close sale is blocked

### 9. Drawing freeze

Operator reviews readiness and freezes the drawing population.

Verify:

- immutable snapshot created
- eligible ticket count
- manifest hash
- ticket-changing actions blocked while frozen

Evidence:

- snapshot ID/version
- manifest hash
- integrity verification

### 10. Drawing export

Authorized operator exports the frozen population.

Verify:

- current snapshot only
- private buyer export remains protected
- CSV/JSON export succeeds
- export history/checksum evidence recorded

Evidence:

- export event
- checksum/hash
- retained synthetic files if needed

### 11. External/physical result

Use one eligible synthetic ticket as the externally selected result.

Verify:

- winning number exists in frozen snapshot
- actual draw time/location/operator/witnesses recorded
- evidence reference captured
- result hash recorded

Evidence:

- result ID/hash
- hosted result screen

### 12. Certification and DRAWN lifecycle

Authorized certifier reviews and certifies the current snapshot/results.

Verify:

- snapshot integrity green
- ordered result hash recorded
- certifying actor recorded
- campaign can move to DRAWN only after certification

Evidence:

- certification event
- final lifecycle status

### 13. Final reconciliation and audit

Review the complete campaign after drawing.

Verify:

- final seller/team/campaign money balances
- outstanding/exception amounts understood
- deposits/refunds/credits/adjustments retained
- ticket counts reconcile
- audit chain verifies
- no mutation erased historical facts

Evidence:

- final money projection
- final ticket totals
- audit continuity result

## Learning Hub during rehearsal

At least three times during the rehearsal, the operator should use the Admin Learning Hub rather than external instructions:

1. campaign setup/readiness
2. money/reconciliation
3. drawing/freeze/certification

Record any question the operator asks that the Learning Hub cannot answer clearly. These become FAQ/content improvements after the pilot gate.

## Go-live blocker log

Classify every issue into one category.

### Product

Broken, confusing, missing, or unsafe product behavior.

### Operations

Process ownership, handoffs, cash/check handling, record retention, or support workflow gaps.

### Compliance/legal

Entity eligibility, rules, prizes, disclosures, sales/payment/delivery methods, dates, drawing procedure, or recordkeeping items requiring approval outside the application.

### Training

Admin, captain, family, or seller guidance that is unclear or missing.

### Infrastructure

Supabase, Netlify, GitHub Actions, secrets, domains, email, backups, monitoring, or production-environment readiness.

For each blocker record:

- severity: blocker / high / medium / low
- owner
- exact reproduction or evidence
- required resolution
- whether it blocks controlled pilot or only broader rollout

## Exit criteria

The operator rehearsal is accepted when:

- every step above passes in hosted staging
- no unresolved product or infrastructure blocker remains for a controlled pilot
- legal/compliance production gates are explicitly listed and owned
- Learning Hub gaps from the rehearsal are recorded
- PR #2 remains draft/unmerged until explicit approval
