# Phase 1 raffle slice

This feature branch builds on dependency commit
`6d659899a27a597847e18cdc2283c7c674188ca1`, fetched from
`origin/chore/next-16-3-8`. It supplies the first Aspire raffle acceptance slice;
it is not the complete production launch path. Nothing is merged into `main`.

## Schema and transaction boundaries

| Migration | Changes |
|---|---|
| `20261014000100_fundraising_foundation.sql` | Campaign player/team goal defaults; campaign team goals; participant enrollment/withdrawal; private ticket counters; assigned inventory; immutable allocations, sale, and reversal tables; scoped composite foreign keys and transaction guards. |
| `20261014000200_fundraising_sales.sql` | User-bound idempotent cash/check issuance and approved reversal/correction transactions, inventory locks, current membership/guardian locks, money and ticket events. |
| `20261014000300_fundraising_views.sql` | Actor-bound family/team reads, scoped SELECT policies, redacted progress and campaign list projections. |
| `20261014000400_correction_progress.sql` | Correction/replacement associations within the same authorized participant subset. |

Authenticated mutation RPCs are `enroll_campaign_players`,
`withdraw_campaign_participant`, `generate_campaign_tickets`,
`allocate_campaign_tickets`, `prepare_campaign_inventory`,
`set_campaign_participant_goal`, `set_campaign_team_goal`,
`record_campaign_sale`, and `reverse_campaign_sale`. Read RPCs are
`fundraising_campaigns` and `campaign_progress`.

Clients cannot directly mutate inventory, enrollment, sales, reversals, or team
goals. Sale issuance atomically consumes assigned stock, stores immutable buyer
and seller facts, appends the collection and ticket events, and writes activity
through database triggers. An exact caller/key/payload retry returns the original
sale and ticket numbers. A changed payload cannot reuse that key.

Reversal requires both `tickets.void` and `adjustments.approve`. It appends a
negative money event and permanently voids the original tickets. A correction
references the approved reversed sale and uses fresh assigned tickets. Original
sale, collection, and issuance rows remain intact. New reversals are allowed only
while ACTIVE or CLOSED; replaying a committed reversal remains safe afterward.

Existing hash-chain payload columns and verification functions are unchanged.
The new money participant foreign key enforces new writes without rewriting or
rejecting historical prepared ledger rows (`NOT VALID` on legacy rows).

## Scope and screens

No role or permission grants were added. Family reads and sale authority use
the current guardian/player links; enrollment snapshots preserve attribution
and never grant continuing access. Assigned-team reads use current team scope.
Combined family/captain or family/campaign-reader roles cannot sell for unrelated
players. Buyer contacts are excluded from team/progress projections.

| Route | Experience |
|---|---|
| `/o/aspire/campaigns` | Admin campaign list and draft creation. |
| `/o/aspire/campaigns/<campaign-id>` | Setup/readiness, enrollment, player/team goals, inventory, filtered net totals, sellers, recent sales, reversals/corrections. |
| `/o/aspire/fundraising` | Mobile family cards for participating linked players only. |
| `/o/aspire/fundraising/<campaign-id>` | Linked-player goals, progress, assigned stock, and offline sale receipt. |
| `/o/aspire/team-fundraising` | Assigned-team campaign list. |
| `/o/aspire/team-fundraising/<campaign-id>` | Assigned-team goals, roster totals, and zero/low-progress follow-up. |

The broadened workspace shell has page-level guards before old admin dashboard,
settings, and reports queries. Family and team modes stay explicit even for
members with multiple roles. Sale forms preserve the exact submission for an
uncertain response; definite transaction rejection allows editing. Active
campaign edits respect existing ticket/legal field locks.

## Acceptance and remaining launch work

The acceptance flow is admin draft creation → Team A enrollment → activation
and assigned stock → Family A sees Player A only → offline sale → issued ticket
receipt → player/team/campaign net totals → approved reversal and linked
correction → ledger/audit verification. Desktop and 360px phone tests use normal
signed-in user clients; database and concurrency tests also prove denial paths.

“Raised” means recorded collections minus reversals. It does not mean received,
cleared, deposited, or reconciled money. Cash/check are the only implemented
payment methods; online raffle checkout is absent. Share links remain a visible
placeholder.

Money custody/turn-ins, reconciliation, a frozen drawing export, ticket delivery,
and the complete operator rehearsal remain required launch work. See
[the Aspire pilot backlog](./raffle-pilot-backlog.md), including the deferred
Shared Campaign Boost Engine. Do not implement other fundraiser types before
the raffle pilot is operational.

## Verified regression results

Validated against a freshly reset and seeded local Supabase stack on October 12,
2026. All 15 migrations applied; generated TypeScript types matched exactly.

| Check | Result |
|---|---|
| Lint and typecheck | Passed. |
| Unit tests, including live permission catalog parity | 85 passed across 14 files; original 69 retained. |
| pgTAP | 471 passed: original 197 plus 274 fundraising assertions. |
| Concurrent transactions | Four groups passed with real overlapping sessions: same-key issuance, stock contention, reversal, and closure; scoped totals and all ledger/audit chains verified. |
| Production build | Passed with Next 16.3.8. |
| Browser acceptance | 21 passed, zero skipped/flaky: original 19 plus desktop raffle and 360px family acceptance. Real Mailpit invitation acceptance ran. |
| External audit checkpoints | Before/after verification and continuity passed after all browser mutations. |

The desktop test creates the campaign through the UI, enrolls U13 Boys, and
proves that the combined captain/family account sees only Liam Smith in family
mode while team mode includes the team roster. It records a $10 cash sale,
verifies exact issued ticket numbers and all totals, then reverses and replaces
the sale without altering original money/ticket facts. The phone test also proves
safe editing after a definite timestamp rejection, zero partial writes, exact
receipts, preserved touch targets, and no horizontal overflow.

Concurrency fixtures use the seeded accounts in separate organizations. Reset
and seed again before the full browser suite; otherwise the original tests'
exact account-scope expectations include those extra fixtures. Phone screenshots
use viewport capture: Chromium full-page capture can reset touch emulation.
Every touch/input and overflow assertion remains enabled.

Screenshots are generated under `test-results/` for prepared/admin correction
history, family progress and ticket receipts, team progress, and the phone sale
form. Local validation does not establish hosted deployment or production
readiness. Phase 0 remains green, and the residual `braces@3.0.3` development
advisory remains accepted/monitored in [dependency security](./dependency-security.md).
