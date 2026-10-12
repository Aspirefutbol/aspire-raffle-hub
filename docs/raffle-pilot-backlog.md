# Aspire FC raffle pilot backlog

## Priority and scope

The immediate priority is an Aspire FC raffle pilot, with a **4–5 week planning
target**. This is a target for sequencing and operator review, not a delivery
guarantee. Launch depends on the remaining operational workflows, regression
results, and jurisdiction/compliance validation.

The current Phase 1 slice supplies the raffle foundation: campaign enrollment,
assigned ticket inventory, manual offline sales, scoped progress, and approved
reversals/corrections. Complete and review that slice before expanding it. The
latest approved raffle scope supersedes the older “Phase 1 has no tickets or
sales” descriptions in the historical architecture/build-plan documents.

No other fundraiser type is part of this pilot implementation. Preserve the
shared organization, roster, authorization, and append-only ledger foundations;
record future shared capabilities in the backlog without building them now.

## First-slice acceptance

These are acceptance criteria for the current implementation, **not a complete
pilot launch checklist**. Mark them accepted only after the corresponding
database, application, and regression checks have passed and the operator has
reviewed the workflow.

- Create/configure a raffle campaign in an organization, enforce lifecycle and
  activation readiness, and enroll existing roster players without copying or
  altering the master roster. Campaign team/household attribution remains a
  snapshot of enrollment.
- Give a family access to its linked players. Team captains see assigned-team
  progress; a member holding both family and captain roles may sell only for its
  authorized family players unless it independently has organization-wide sale
  authority. Every write and read retains server checks and database enforcement.
- Generate unique campaign ticket numbers and allocate stock to participants.
  Issue only from assigned stock; retry and concurrent requests cannot create
  duplicate sales, duplicate tickets, or overselling.
- Record a manual cash/check sale with buyer details, quantity, exact campaign
  price, and a caller-bound idempotency key. A successful transaction records the
  sale, money-collection event, and ticket issuance atomically. An invalid or
  unauthorized request leaves no partial financial or inventory writes.
- Show organization, team, player, and family totals within the caller's scope.
  Net collection totals subtract approved reversals; these totals do not prove
  that the organization has received, deposited, or reconciled the money.
- Reverse a sale only with the required ticket-void and adjustment-approval
  permissions and a reason. Preserve the original facts, append a compensating
  money event, and permanently void its tickets. A linked correction uses fresh
  assigned tickets. New ticket-changing reversals stop once the drawing is
  recorded; retries of an already committed reversal remain safe.
- Preserve existing ledger hashes, tenant isolation, audit attribution, and
  immutable history. Verify real concurrent sales/reversals/closure and the full
  applicable regression suite; document failures or remaining limits explicitly.

## Minimum pilot launch path

The operator must be able to complete this path end to end:

**Organization → Campaign → Teams/Players → Family access → Ticket allocation →
Sale → Money status → Totals → Reversal/Correction → Drawing export →
Reconciliation → Audit**

The order describes the operational path; reconciliation may also run during
sales and before the drawing. Closing sales, exporting eligible tickets, and
reconciling funds are separate operations.

| Step | Minimum launch acceptance | Relationship to the first slice |
|---|---|---|
| Organization | Operator identity, legal profile, support contact, and jurisdiction are verified. | Existing settings/readiness foundation; operator validation required. |
| Campaign | Dates, ticket price, goals, rules/prizes, lifecycle, and sales cutoff are reviewed. | Setup/lifecycle foundation; full raffle rules and compliance review remain launch work. |
| Teams/Players | Current roster is reviewed and the intended players are enrolled with stable campaign attribution. | Existing roster plus current enrollment slice. |
| Family access | Intended sellers can sign in and see/sell for the correct family players; invitation/access issues have an operator resolution path. | Existing member/family access plus current scoped sale checks; pilot rehearsal required. |
| Ticket allocation | Initial stock is assigned, remaining stock is visible, and operators can safely supply additional stock when needed. | Current inventory transactions; confirm the operator workflow is sufficient without a full inventory-management UI. |
| Sale | A real offline collection can be recorded once and produces the correct issued ticket numbers. | Current manual-sale slice; ticket delivery/receipt expectations still need operator agreement. |
| Money status | Seller collections, organization receipts, outstanding balances, and check exceptions are distinguishable. | **Required next slice:** collection events alone do not provide these statuses. |
| Totals | Net totals and ticket counts reconcile across organization/team/player scopes without exposing unrelated data. | Current scoped progress slice; later receipt/balance totals must use their own canonical events. |
| Reversal/Correction | Authorized operators can explain and correct a mistake without deleting history, recycling ticket numbers, or changing drawing eligibility afterward. | Current pre-drawing reversal/correction slice; post-drawing financial-only exceptions require a separate workflow. |
| Drawing export | Sales are closed and eligible issued tickets can be exported as a reproducible, auditable snapshot, excluding voided tickets. | **Required next slice:** define/export the draw snapshot and agree the operator's drawing/recordkeeping process. |
| Reconciliation | Turn-ins, partial receipts, checks, deposits/batches, and approved discrepancies have a tested operational path. | **Required next slice:** scope the minimum pilot workflows and implement their append-only money records. |
| Audit | Operators can trace a sale, its tickets, collection, correction, drawing snapshot, and reconciliation; verification/export and incident procedures work. | Existing audit/hash foundations plus exports and operating procedures needed for the pilot. |

## Required next slices, in launch priority

1. **Money status and reconciliation.** Agree the definitions of collected,
   received, outstanding, and deposited money; who may receive/approve it; and
   how cash, partial turn-ins, and uncleared/returned checks are handled. Build
   only the pilot's necessary screens and transactional ledger operations.
   Reconciliation status must not silently invalidate an issued raffle ticket.
2. **Drawing export and closure.** Define the eligible-ticket snapshot, required
   export fields, buyer-data access, reproducibility, and the operator's drawing
   evidence. Prevent sales after the cutoff and ticket-changing corrections
   after drawing finalization. Confirm whether winner certification/prize
   records are required in the app or in the approved operator process for this
   pilot; do not treat a CSV alone as a complete drawing workflow.
3. **Operator launch rehearsal and audit handoff.** Run the entire launch path
   with representative admin, finance, captain, and family accounts. Verify
   invitations, replenishment, receipts/ticket delivery expectations, cutoff,
   corrections, export, reconciliation, audit checks, backups, and support
   ownership. Resolve any missing mandatory workflow before launch.

These are required launch gaps, not optional polish. Any new implementation
scope should have concrete acceptance criteria and review before it is started.

## Planning target and production gate

Use the 4–5 week target to order work: first-slice acceptance, money and
reconciliation, drawing export, then a complete pilot rehearsal and remediation.
Keep the schedule adjustable as operator decisions and verified gaps become
clear; passing the first-slice tests does not establish production readiness.

Before production claims or live raffle operation, the operator and appropriate
jurisdiction/compliance reviewer must validate eligibility to operate the raffle,
rules/prizes and disclosures, ticket pricing/numbering, permitted payment and
delivery methods, sales dates, drawing procedures, and required records. The
software's readiness checks support that review; they are not a legal approval.
Texas CREA mode retains offline collection and no online raffle-ticket checkout.

## Future backlog: Shared Campaign Boost Engine — do not implement

Record a shared, configurable boost engine for later review. Potential controls:

- Premium units.
- Contribution multipliers.
- Sponsor matches.
- Promotional windows.
- Milestone unlocks.

Enable each capability selectively by campaign type and jurisdiction, with
explicit rules, permissions, limits, and auditable accounting. Define precisely
whether a boost changes a contribution, a sponsor obligation, or progress
reporting; do not make those concepts interchangeable with ticket issuance.

For raffles, boosts must **not alter odds, ticket quantities, ticket prices, or
ticket eligibility rules** unless an explicitly approved jurisdiction/compliance
decision permits the particular change and its implementation is separately
approved. No boost implementation, raffle-rule change, or other fundraiser type
expansion is authorized by this backlog item or included in the current pilot
slice.
