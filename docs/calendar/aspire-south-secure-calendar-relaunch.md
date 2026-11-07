# Aspire South Calendar Fundraiser — Secure EN/ES Relaunch

Status: implementation branch created; no production deployment or live-data changes approved by this document.

## Product direction

Add Calendar Fundraiser as a module inside the existing multi-tenant Aspire fundraising platform rather than reviving the legacy Apps Script/Sheet implementation.

First affiliate tenant: **Aspire South**.

The module must support:
- Aspire-level platform oversight.
- Strict organization/tenant isolation.
- Aspire South admin access only to Aspire South data.
- Parent/guardian-owned seller access for youth players.
- Public donor access only to explicitly public campaign data.
- Full English/Spanish UI parity.
- Mobile-first donor and seller flows.
- Stripe-backed payment confirmation with server-side verification.
- Auditability of privileged actions.

## Required user journeys

### Public donor
1. Open player/team/campaign sharing link.
2. Switch EN/ES at any point without losing current state.
3. View fundraiser explanation, player/team identity, goal/progress, and calendar availability.
4. Choose one or more eligible calendar days.
5. Enter minimal contact/receipt information.
6. Pay through the approved payment flow.
7. See confirmation only after server-side payment verification.
8. Receive confirmation/receipt without exposing private seller or donor data.

### Parent / guardian / seller
1. Authenticate to an adult-owned account.
2. See only authorized children/players and their campaign pages.
3. View progress and transaction summaries appropriate to their role.
4. Copy/share a revocable seller URL and QR code.
5. Recover an existing authorized sharing link only through the separately approved secure-link design.
6. Never receive access to organization-wide financial or donor data.

### Aspire South admin
1. Authenticate with Aspire South scoped permissions.
2. Manage Aspire South teams, players, households, campaigns, goals, and calendar configuration.
3. View Aspire South campaign reporting and reconciliation.
4. Export only Aspire South data.
5. Never access another organization by changing a URL, ID, API call, or client state.

### Aspire director / platform admin
1. Manage affiliate organizations and campaign configuration.
2. View cross-tenant platform health through explicitly privileged server-side paths.
3. Audit changes, refunds, permission edits, campaign edits, and manual adjustments.

## EN/ES requirements

Language selector must be visible on every public and authenticated fundraiser surface.

Spanish is first-class content, not browser translation.

Translate:
- campaign landing content
- calendar statuses
- player/team progress labels
- checkout instructions
- validation errors
- pending/payment states
- confirmation states
- share text
- parent/seller instructions
- admin fundraiser labels
- receipt/confirmation copy controlled by the application

Every new user-facing string must enter the translation dictionary at implementation time.

Acceptance rule: no production release with missing Spanish strings or raw translation keys.

## Security release gates

### Tenant isolation
- Every organization-owned fundraiser row includes organization scope.
- RLS enabled on every exposed-schema table.
- Authorization requires ownership/membership predicates; `TO authenticated` alone is never sufficient.
- Cross-tenant negative tests are mandatory for SELECT, INSERT, UPDATE, DELETE and RPC paths.
- Client-provided organization IDs are never trusted without server/database authorization.

### API exposure
- New tables are not assumed to be exposed to the Data API.
- Grant API access only when required.
- Public donor reads expose only explicitly public fields.
- Service/secret keys remain server-only and are never prefixed `NEXT_PUBLIC_`.

### Auth
- Authorization claims must not depend on user-editable `user_metadata`.
- Role/organization authority must come from trusted membership data and/or app metadata with database verification where needed.
- Adult/guardian ownership is required for youth seller accounts.
- Sensitive operations must tolerate stale JWT claims safely.

### Payments
- Stripe webhook/event verification is authoritative for successful payment state.
- Browser redirects never mark a reservation paid.
- Webhook handling is idempotent.
- Duplicate event processing cannot double-credit a player or duplicate a transaction.
- Refund/chargeback state changes are auditable.
- No raw card data is stored in Aspire systems.

### Calendar reservations
- Reservation creation must be atomic.
- Exclusive calendar inventory cannot be double-sold under concurrency.
- Pending reservations expire safely.
- Expired/released inventory cannot corrupt paid reservations.
- Price/amount is computed server-side from trusted campaign configuration.

### Sharing links
- Links use high-entropy non-sequential identifiers.
- Links are revocable.
- Recovery follows the separately reviewed PR #15 security design; this branch does not bypass that approval gate.
- Public links disclose only the minimum player/campaign information approved for fundraising.

### Data minimization
- Store only donor/contact fields required for receipts, reconciliation, support, and legal/accounting needs.
- Donor email/phone is never exposed publicly.
- Admin exports are role- and tenant-scoped.

### Audit
Audit at minimum:
- campaign creation/update
- membership/role change
- seller-link issue/revoke/recover
- manual reservation edit
- payment reconciliation adjustment
- refund action
- export action where practical

### Validation & abuse protection
- Server-side schema validation for all mutation inputs.
- Rate limiting/abuse controls on public reservation/payment initiation and recovery endpoints.
- Generic error responses where detailed errors could reveal account or tenant existence.

## Initial data model direction

Prefer extending the existing organization/roster model rather than duplicating it.

Likely fundraiser entities:
- fundraiser_campaigns
- calendar_campaign_settings
- calendar_slots
- calendar_reservations
- fundraising_sellers / campaign_seller_assignments
- payment_transactions
- payment_events
- seller_share_links
- fundraiser_audit_events (or extend existing audit mechanism)

Exact schema requires migration review before implementation.

## Test gates

No Aspire South live data until all pass:
- tenant isolation database tests
- donor anonymous-access tests
- parent/guardian authorization tests
- Aspire South admin authorization tests
- platform-admin tests
- reservation concurrency test
- pending-expiration test
- webhook signature/idempotency tests
- duplicate payment event test
- refund/reconciliation test
- seller-link revoke/recovery test
- EN/ES route/state persistence tests
- no-secret-in-client-build check
- lint/typecheck/unit tests
- database security/advisor review
- staging E2E on phone + iPad + desktop

## Deployment rules

1. Synthetic data only during first build.
2. Separate staging deployment from production.
3. No live Stripe credentials until security review gate is cleared.
4. No production migration without reviewed migration SQL and rollback/forward plan.
5. Existing raffle launch work must remain isolated from this branch.
6. Existing PR #15 secure-link work remains independent and requires its own director/security approval.

## First build slice

Build in this order:
1. EN/ES framework + fundraiser navigation shell.
2. Aspire South synthetic organization/campaign.
3. Public calendar read model.
4. Atomic reservation model.
5. Parent/seller scoped dashboard.
6. Secure checkout initiation + webhook ledger.
7. Aspire South admin reporting.
8. Share link + QR flow, respecting PR #15 approval boundary.
9. Full security/E2E gate.

## Definition of ready for Marc/director review

A staging URL may be called "director ready" only when:
- Aspire South can be selected as its own tenant.
- donor flow works end-to-end with test payments.
- Spanish and English are complete for the review path.
- parent cannot access another parent's data.
- Aspire South admin cannot access another organization's data.
- calendar inventory cannot double-sell in concurrency tests.
- no client bundle contains privileged keys.
- required security and automated checks pass.


## Stripe TEST checkout safety contract (November 6 implementation)

The isolated test integration now uses card-only Checkout while the settlement
path handles synchronous `checkout.session.completed` events with
`payment_status=paid`. Do not add delayed-payment methods until a reviewed
`async_payment_succeeded` / `async_payment_failed` state machine is implemented.

Trusted server orchestration must invoke
`startAttachedStripeTestCalendarCheckout` with an authorized, locked
`calendar_private.attach_test_checkout` callback. A TEST URL may only leave
the server after the callback confirms the same reservation and session in
`CHECKOUT_PENDING`. If attachment fails, the helper requests Stripe's
`/expire` endpoint for the orphan and verifies the returned session is TEST,
expired, unpaid, and linked to the exact reservation. If cleanup cannot be
confirmed, it fails closed and requires manual investigation. It never releases
a calendar date itself; only the separately verified private expiry transaction
may do so.

The reservation read and attach callback must come from a reviewed server
boundary with adult authorization, tenant isolation, and least-privilege DB
access. Neither this helper nor its tests grant browser access, deploy Stripe
secrets, or satisfy the PR #15 seller-link approval gate.

Before connecting a donor-facing checkout route, add integration tests for
attachment failure, orphan cleanup failure, delayed webhook replay, and
concurrent reservations using actual TEST-mode infrastructure. Never infer
payment from success or cancellation redirects.

## Private paid-only progress read model (November 6)

`calendar_private.read_paid_progress(org_id, campaign_id, participant_id)`
is a protected, read-only database function for a future authorized
parent/director dashboard. It checks an adult session, verifies the exact
campaign-participant-tenant relationship and the existing
`can_manage_seller_participant` permission. It has **no grant** to
`anon`, `authenticated` or `service_role` through the Data API.

It counts **only PAID reservations** (not provisional holds, abandoned
Stripe sessions, expired holds or repeated Stripe event receipts). It returns
sorted sponsored day numbers, sponsor count, base calendar cents, additional
impact cents and total paid cents. It exposes no donor name, email, checkout
session, or webhook identifiers. The pgTAP test suite proves 3x separation,
player isolation, duplicate-event non-duplication, and denial of cross-tenant
and mismatched campaign reads. This is not yet wired to a public route.

## Director visual evidence before staging is available

On a successful complete GitHub CI run, the E2E suite now uploads an
`aspire-south-director-synthetic-preview` artifact containing four
screenshots: desktop English base calendar, desktop English 5x selection,
Spanish phone 5x selection, and Spanish phone review. These images use only
fictional participant and supporter data. They are **visual review evidence**
and not a functioning staging deployment or proof that reservation/Stripe
checkout has been connected to the public page.

Do not repoint the existing shared Netlify staging environment or run these
unapproved calendar migrations against production merely to obtain a review
URL. A separate branch-specific Netlify deploy path (or approved isolated
project with synthetic/test-only environment) is still needed for a clickable
preview. The current Netlify connector can inspect but does not expose a
publishing action. PR #15 review remains independent.

## Private scoped inventory snapshot (November 6)

`calendar_private.read_inventory(org_id, campaign_id, participant_id)` now
supports a future adult-authenticated campaign dashboard with five numbered-day
groups: paid, checkout pending, actively held, refunded, and unavailable.
The function requires an authorized adult with live permission to manage that
participant, verifies campaign/tenant relationships, excludes donor names,
emails, and payment identifiers, and has **no Data API grants**. It is not a
public availability endpoint and must not be exposed as one.

Unstarted HELD reservations whose 15-minute window has passed are excluded
from unavailable days; the next authorized reservation transaction reaps these
holds under lock. CHECKOUT_PENDING inventory deliberately remains unavailable
past its local expiry until a separate trusted Stripe TEST verification confirms
the checkout is terminally expired and unpaid. Paid and refunded days stay
claimed. The backing partial UNIQUE index remains authoritative for exclusive
day ownership regardless of an availability snapshot becoming stale.

The private pgTAP tests also check no API grants, adult/tenant isolation,
per-player inventory, redaction of supporter/payment details, and expired
unstarted holds. This work does not alter PR #15, create a public donor route,
or connect live player data.

## Positive sponsored-day visual treatment (November 7 synthetic branch)

The isolated **fictional** Aspire South preview now renders paid fixture days with
a positive green Sponsored/Patrocinado state, checkmark and retained base day
price. A multiplier above 1× receives an additional impact badge (including
4× Champion/Campeón and 5× Legacy/Legado), never a second claim on that day.
No supporter name, email, receipt, payment reference or personal identifier
is published in a sponsored tile.

The progress header shows both financial progress against the configured
campaign goal and the separate **distinct-day** count out of 31. Milestone
copy is bilingual at 8, 16 and 24 paid days; the full completion treatment
appears only at 31 distinct confirmed paid days. The preview has a clearly
labeled **synthetic scenario switch** for director testing of a fully funded
calendar. It resets unsent supporter information and selections; it performs
no payment, reservation, webhook, or persistence operation.

The server-only `parsePrivateCalendarReadModels` adapter now projects
`sponsoredDayCount`, `dayCompletionPercent` and `calendarComplete` from
private PAID days **only**. CHECKOUT_PENDING, HELD and REFUNDED inventory is
never counted as sponsored. The protected SQL backing functions and grants
have not changed. The public preview continues to use only fictional
fixtures; it is *not* wired to the authenticated private progress model.

Before launching this visual treatment for live donors, a security-reviewed
server-to-public read adapter must derive exact paid-day multipliers from a
trusted, tenant-authorized, verified-payment read (or omit multiplier badges).
Never derive "paid" from a browser redirect, client input, localStorage or
pending checkout record. Preserve exclusivity for completed/refunded days and
protect donor identity in every public response. This draft is not a live
checkout, does not authorize PR #15 sharing-link recovery, and must not be
merged or deployed to production without separate director/security approval.
