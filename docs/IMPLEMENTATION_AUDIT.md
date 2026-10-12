# Raffle Hub — Implementation Audit vs. 360° Developer & Engineering Blueprint v1.2 UX

**Audited:** branch `claude/sharp-ramanujan-r3cjav` at `2c8fc2d` (PR [#1](https://github.com/Aspirefutbol/aspire-raffle-hub/pull/1)), 2026-10-11.
**Method:** I read every migration, server action, query module, page and shared component (144 tracked files), searched the code, and ran the app against a local Supabase stack. Each finding cites the file it comes from. "Production-ready" means it works end to end, is enforced server-side and in the database, and was verified locally (lint, typecheck, build, 42 unit tests, 32 pgTAP tests, browser QA). **Nothing has been run against a hosted Supabase project, and the repo has no CI** (no `.github/`).

**Headline:** Phase 1 delivered the platform foundation:
- tenancy, authentication, authorization and audit;
- the master roster and the import wizard.

That is roughly the blueprint's "Phase 0 — Foundation" (§28), minus campaign creation and in-app user management. **None of the raffle product itself exists yet:**
- campaigns (beyond a schema stub), inventory and tickets;
- seller and buyer experiences;
- reconciliation, prizes and drawing;
- notifications and reporting.

A search of `app/`, `lib/`, `components/` and the migrations finds no ticket, sale, buyer, seller, reconciliation, prize, drawing, QR or SMS code. The app never queries `campaigns`.

**Estimated blueprint coverage: about 15%** (§G).

---

## A. COMPLETE

Exists, works end to end, and is enforced in both the server and the database.

### Platform foundation
| Item | Evidence |
|---|---|
| Multi-tenant model: org root; every org-owned row has `organization_id`; composite FKs `(id, organization_id)` block cross-tenant references | `…0100_foundation.sql`, `…0200_master_roster.sql`; pgTAP "cross-tenant household reference is rejected" |
| Row-level security on every table, using `has_org_permission()` | All migrations; pgTAP: admin A can't read or write org B; auditor can't write; outsider sees nothing; super admin sees all |
| Server-side authorization on every mutation (`orgAction` checks permission, validates with Zod, then RLS re-checks) | `lib/actions.ts`, `lib/*/actions.ts` |
| Global role and permission catalog, with permission-based checks (never role names) | `roles`, `permissions`, `role_permissions`; `lib/permissions/index.ts` |
| Supabase Auth: password and magic link (no self-signup), PKCE callback, token-hash confirm, POST-only sign-out, open-redirect guard | `app/(auth)/login`, `app/auth/*`, `lib/auth/redirect.ts` (+ test) |
| Session refresh and anonymous redirect in `proxy.ts` | `lib/supabase/proxy.ts` |
| Org-scoped routing `/o/[orgSlug]`; foreign orgs return not-found | `lib/auth/org-context.ts` |
| Service-role key isolated to the dev seed; confirmed absent from client bundles | `scripts/seed-dev.mjs`; `.next/static` scan |
| Append-only audit log written by triggers, with actor, before/after, changed fields, and import tagging | `audit_events`, `audit_row_change()`; `docs/AUDIT.md`; pgTAP |
| Transactional multi-record writes through Postgres functions | `create_player`, `create_guardian`, `bulk_set_player_team`, `commit_player_import`, `archive_team`, … |
| Archive-not-delete: no client `DELETE` grant on roster tables; campaigns block delete with a trigger | `…0200`, `…0500` |
| Security headers (frame-deny, nosniff, referrer, permissions) | `next.config.ts` |

### Roster
| Item | Evidence |
|---|---|
| Teams: create, edit, archive (unassigns its players, atomically), restore, season, code, division, coach, team roster page, add players | `app/o/[orgSlug]/teams/*`, `archive_team()` |
| Players: create (only name and team required), edit, archive/restore, preferred name, DOB, gender, external ID (unique per org), notes, source | `components/roster/add-player.tsx`, `player-profile.tsx` |
| Team history: one current team per player (partial unique index); changes close the old row and open a new one; `PLAYER_TEAM_CHANGED` audit event | `team_memberships`, `set_player_team()` |
| Households (many players, many guardians), primary contact | `households`, `guardians.is_primary_contact` |
| Guardians: many per player (`player_guardians`) with relationship and primary flag; link an existing guardian; edit contact and communication preferences | `components/roster/guardian-sheets.tsx` |
| Player directory: search, filters (team, season, status, issue), pagination, bulk assign team / archive / restore, mobile cards | `app/o/[orgSlug]/people/players/page.tsx` |
| Player profile: info, current team and history, household, guardians, activity | `app/o/[orgSlug]/people/players/[playerId]` |
| Possible-duplicate review: side-by-side, "not duplicates" (persisted), archive | `possible_duplicate_players()`, `player_duplicate_dismissals` |
| CSV import wizard: upload → map (aliases, saved mappings by header signature) → validate → review → fix in place → bulk fixes → atomic commit → summary; duplicates classified EXACT / LIKELY / NEEDS_REVIEW / NEW with no auto-merge; automatic household grouping | `lib/roster/import/*` (42 unit tests across lib), `commit_player_import()` |
| Dashboard metrics and Action Needed queue with deep links (duplicates, missing team, missing contact, no guardian, unfinished imports) | `roster_overview()`, `lib/dashboard/overview.ts` |
| Settings: org profile (legal name, operator address, support contact, time zone), seasons (create, set current), member role change and suspend, saved mappings, activity log with filters | `app/o/[orgSlug]/settings/*` |
| Platform (super admin): list organizations, create organization with jurisdiction profile and first admin | `app/platform`, `lib/platform/actions.ts` |
| Development seed (Aspire plus a second tenant) that refuses production and non-local targets | `scripts/seed-dev.mjs` |

---

## B. PARTIALLY COMPLETE

| Area | What exists | What is missing |
|---|---|---|
| **Organizations** | Name, legal name, slug, type, time zone, operator address, support contact, `jurisdiction_profile`, status, settings JSON | Internal EIN reference and officer contacts (§19); per-org branding (logo/colors); per-org ticket-number prefix (blueprint uses `ASG-`, which must be per tenant); validated settings schema; super-admin UI to suspend or archive an org or edit its jurisdiction profile |
| **Seasons** | Create; set current (atomic); date range | Edit, archive, season rollover (copy teams to a new season) |
| **Members / users** | List, change role, suspend/reactivate; first admin assigned at org creation | **No way to add a member to an existing org** (only one admin, at creation); no invitations; no family/seller accounts; no profile page; no MFA (§23 "admin MFA recommended") |
| **Roles / permissions** | 6 org roles plus SUPER_ADMIN; 9 permissions; RLS uses permissions | No `DIRECTOR` role (§4: activation, lock, final draw authorization); one role per member (§4 needs combined roles, see D1); no team- or household-scoped policies (TEAM_CAPTAIN and PARTICIPANT_FAMILY have no grants); no ticket, reconciliation, drawing or export permissions |
| **Campaigns** | `campaigns` table with the blueprint state names (`DRAFT…COMPLETED`, `CANCELLED`), `campaign_type`, `jurisdiction_mode`, time zone, `starts_at` / `sales_close_at` / `draw_at` with ordering checks, RLS, audit trigger, no-delete trigger; placeholder page | **No UI or actions at all.** Missing columns: ticket price (cents), club goal, family target (tickets/dollars), default seller allocation, public contact, legal operator snapshot, rules/terms version, ticket prefix. No state-machine enforcement (see D3); no price lock at activation; no 30-day template |
| **Campaign participants** | `campaign_participants` (player, team and household snapshots, goal) with RLS | No enrollment UI ("select teams → select players → add participants"); no seller-account link; no per-participant targets UI |
| **Audit** | Complete for roster, imports, roles, org (`docs/AUDIT.md`) | No `reason` capture (§40.5); no before/after hash or hash chain (§19, §24); no export events (§23); full rows (including guardian PII and child DOB) copied into an undeletable log with no retention policy (see E) |
| **Admin command center (§9, §40)** | Exception-driven dashboard pattern and Action Needed queue (roster items only); six headline metrics | Campaign health metrics; work queues (reconcile, corrections, inventory requests, delivery failures, outstanding sellers, prize and drawing readiness); quick actions (Reconcile money, Assign tickets, View campaign) |
| **Search** | Player name search; household name; team name; guardian search in the link sheet | **Global search** across ticket number, buyer, seller, team, phone and email (§40.5). The directory `search_text` covers player names only, not guardian email or phone (`…0200_master_roster.sql:352`) |
| **Player/family management** | Full roster CRUD | Family/seller status (no activity, selling, goal reached, low inventory, money outstanding, reconciled, §18); family invitations |
| **Reports** | Placeholder page; activity log | Every report in §25 |
| **Security** | RLS, RBAC, audit, transactions, security headers | Rate limiting / CAPTCHA (public endpoints don't exist yet); HSTS config (host-level); PII retention policy; logged exports; observability/alerting (§32); backup and restore runbook |
| **Communication preferences** | `guardians.communication_preferences` (email/SMS opt-in) | Consent metadata (timestamp, source), unsubscribe, quiet hours |
| **UX foundation** | Design tokens, status = icon + word, empty states everywhere, toasts, inline confirmation, side sheets, skeletons, error boundary, mobile drawer, no horizontal scroll at 360px | Touch targets below 44px (D11); no select-all-matching bulk selection; no tablet-optimized layout pass; no PWA/offline draft handling (§27) |

---

## C. NOT BUILT

Everything below appears in the blueprint and has **no code** in the repo.

### 2. Campaign system
- Campaign create/edit UI and actions; DRAFT → READY → ACTIVE → SALES_CLOSED → DRAW_LOCKED → COMPLETED transitions with permission and reason gates; CANCELLED closeout rules
- Ticket price locked at activation; club goal; default family target; default allocation
- Prize builder (§13): name/description, fair value, source PURCHASED/DONATED, donor, possession status, rank, claim deadline, delivery status, proof; **cash-prize block** (§2)
- Compliance checklist and legal launch gate (§2): operator name/address on tickets, prizes over $10 described, drawing date, raffle-count-per-year warning, prize possession before draw, counsel sign-off
- Versioned terms/rules snapshot at activation
- 30-day automation template (§12)

### 3. Seller experience
- Seller accounts (user ↔ campaign ↔ participant ↔ team); family invitations and login
- Seller home: progress (sold/target), dollars raised, money to turn in, inventory, request inbox, next turn-in, How It Works card
- Sell Tickets flow: buyer name, phone OR email, quantity 1/2/3/5/custom capped by inventory, auto total, Cash/Check, "I have received this payment directly" checkbox, **PAYMENT RECEIVED – ISSUE TICKETS**, success screen with ticket numbers and send/show
- Request More Tickets when inventory hits zero
- Request Correction / Report a problem flow
- Seller QR (for admin reconciliation lookup); Share link/QR; My Tickets; Money Due; Help

### 4. Buyer / supporter experience
- Immediate ACTIVE digital ticket page (operator, campaign, number, status, price, draw date, prizes, address, support, issued time, verification QR)
- Public verification endpoint `/public/verify/{token}` with opaque high-entropy token (hashed at rest) and masked PII
- Email delivery (and optional SMS) with retries; delivery status; resend / copy link
- Buyer lookup and recovery (ticket number + contact verification); magic-link Supporter Wallet
- Post-draw outcome messaging; **25% Fan Wear reward**: one unique single-use code per supporter per campaign, expiry, statuses, storefront deep link, analytics (§6A)
- Privacy: consent, unsubscribe, retention

### 5. Ticket engine
- Pre-generated inventory per campaign (UUID PK + immutable human number `PREFIX-YY-NNNNNN`, unique per campaign)
- Allocation to sellers (ranges/IDs), allocation status, inventory requests
- Ticket states AVAILABLE → ASSIGNED → ACTIVE → WINNER → CLAIMED; VOID (from ASSIGNED/ACTIVE, authorized, with reason); linked REISSUE
- **Separate `reconciliation_state`** (NOT_APPLICABLE / OUTSTANDING / RECONCILED / EXCEPTION / WRITTEN_OFF)
- Canonical append-only ticket ledger/events; dashboards derived from it
- **Atomic, idempotent issuance** (§22): one transaction, row locks on assigned AVAILABLE tickets, client idempotency key, all-or-nothing, delivery queued after commit
- Duplicate prevention: unique number per campaign, idempotency-key uniqueness, double-tap protection

### 6. Reconciliation
- Seller liability = sum(ACTIVE face value) − reconciled receipts − approved adjustments (derived, not stored)
- Turn-in screen: scan or search seller, expected amount, cash and check amounts (count/reference), batch/deposit ID, received-by, server timestamp, notes required on variance, MATCH/VARIANCE, one-tap reconcile
- FIFO allocation across obligations, with manual override
- Partial turn-ins; outstanding balances and aging
- Adjustments with reason and authorizer; payment exceptions (bounced check); director-approved write-offs
- Reconciliation batches and deposits; Finance queue; QBO-friendly CSV export
- **Separation guarantee:** none of this may change ticket validity (no code exists yet to enforce or test it)

### 7. Admin (beyond roster)
- Campaign dashboard (active sales, collected, outstanding, tickets active, participation, goal progress, days remaining, exceptions)
- Seller management; ticket inventory screen; ticket search; buyer/supporter search
- Reconciliation queue; exception and correction queue; void/reissue UI (reason, confirmation, replacement)
- Prize management; drawing controls; winner management and claims
- Messages/reminder composer; exports

### 8. Team and club reporting
- Club, team and family/player progress; participation rate; tickets sold, available, assigned, voided; revenue (face value vs reconciled); outstanding by team and seller with aging; team manager dashboard

### 9. Drawing
- Close sales (hard stop); pre-draw readiness checklist (blocking vs warning)
- Lock eligible pool: immutable snapshot of ACTIVE, non-VOID tickets with hash; privileged unlock with reason
- Draw modes: record a physical draw, or a server-side CSPRNG draw with two-admin confirmation
- Winner record (ticket, buyer, seller/team, prize, method, drawn-by), verification, two-person certification, contact attempts, claim and fulfillment (PENDING / CONTACTED / CLAIMED / FORFEITED), proof
- Closeout package and audit export; campaign COMPLETED

### 10–11. Cross-cutting
- Notifications engine with message-intelligence rules, throttling and quiet hours (§15)
- Public share page and nonbinding ticket requests: NEW → CONTACTED → READY_FOR_HANDOFF → FULFILLED / CANCELLED / EXPIRED, with no inventory consumption (§8)
- QR generation; cloud storage for prize images and signed exports; email provider; optional SMS provider
- Analytics (§25); PWA/offline drafts; structured logs and alerting; backup and restore test
- E2E tests for the §29 acceptance criteria; CI pipeline

---

## D. NEEDS REFACTORING

Existing code or schema that conflicts with the final 360° model. The audit architecture itself is sound and should be kept (D8 extends it).

| # | Issue | Where | Why it conflicts | Recommendation |
|---|---|---|---|---|
| D1 | **One role per member** | `organization_members.role_key` + `unique (organization_id, user_id)` (`…0100_foundation.sql:206,213`) | §4: "Team managers cannot reconcile money unless they also hold Raffle Admin or Finance Admin" assumes combined roles; a parent can be both seller and team captain | Add a `member_roles (member_id, role_key)` table and update `has_org_permission`, `my_org_permissions`, the last-admin guard, the UI and audit (`ROLE_GRANTED` / `ROLE_REVOKED`). Do this before seller accounts exist |
| D2 | **Role catalog vs blueprint personas** | `roles` seed | No `DIRECTOR` (§4 governance: activation, lock, draw authorization, write-off approval). SUPER_ADMIN is platform-level, not the club's director | Add `DIRECTOR` (and treat ORGANIZATION_ADMIN as Raffle Admin); add permissions such as `campaigns.activate`, `tickets.issue`, `tickets.void`, `reconciliation.manage`, `drawing.lock`, `drawing.certify`, `exports.run` |
| D3 | **Campaign status is free-text updatable** | `campaigns_update` policy allows any column, including `status`, for `campaigns.manage` | §20 state machine; price must lock at activation; DRAW_LOCKED must be immutable | Revoke direct `UPDATE (status, ticket_price_cents, …)`; add a `transition_campaign(id, to, reason)` SECURITY INVOKER function that checks allowed edges, permission and readiness; add a trigger that rejects price changes after ACTIVE |
| D4 | **Campaign schema incomplete** | `campaigns` columns | Missing price, goals, allocation default, operator snapshot, rules version, ticket prefix, contact | Additive migration (no data yet), done together with D3 |
| D5 | **Participant ≠ SellerAccount** | `campaign_participants` | §19 SellerAccount (userId, campaignId, participantId, teamId, status). Sellers are users; a guardian may sell for two siblings | Add `campaign_sellers` (participant_id, profile_id, status), linked through `guardians.profile_id`. Inventory, sales and liability attach to it; attribution stays on the participant |
| D6 | **Org admins can change any organization column** | `organizations_update` policy (`…0100_foundation.sql:498`) has no column restriction | A tenant admin can change their own `status`, `slug` or `jurisdiction_profile` through PostgREST. The jurisdiction profile controls compliance features (§2, "Safe defaults") | Column-level privileges or a BEFORE UPDATE trigger: `status`, `slug`, `jurisdiction_profile` changeable only by the platform admin (later, Director with audit reason) |
| D7 | **Profile email is user-editable and used for identity lookup** | `profiles_update_self` (`:486`); `createOrganization` uses `.ilike("email", admin_email)` (`lib/platform/actions.ts:35`) | A user can set their profile email to someone else's. `ilike` also treats `_`/`%` in emails as wildcards. Either can assign the wrong person as org admin | Make `profiles.email` read-only for clients (sync from `auth.users` with a trigger); look up by exact lowercase match, or via an auth-admin flow when invitations are built |
| D8 | **Audit log is not the ticket ledger** | `audit_events` (generic, full-row JSON) | §3 "Ticket ledger is canonical"; §19 AuditEvent needs before/after hashes; void and adjustment need a reason | **Keep `audit_events`** as the cross-cutting admin log. Add domain ledgers (`ticket_events`, `reconciliation_entries`) that are append-only and drive balances. Add a `reason` capture (`raffle_hub.reason` transaction setting or RPC parameter) and a hash chain for ticket, money and draw events |
| D9 | **Silent 1,000-row caps / in-memory pagination** | `lib/roster/queries.ts:64` (team player counts), `:214–228` (households fetched whole, filtered and paginated in JS), `:277` (`limit(2000)`, still capped at 1,000), `app/platform/page.tsx:17`; `supabase/config.toml` `max_rows = 1000` | Above 1,000 active memberships or households, counts and lists are silently wrong. Fine for Aspire's ~300 players; breaks the multi-tenant goal and large clubs | Move counts and contact-completeness into SQL (views or RPCs with `count`); paginate in the database; replace large `<select>` pickers with search comboboxes |
| D10 | **Import edit cost** | Every row edit or decision reloads the whole roster and re-validates and rewrites every row (`revalidateImport`, 5 call sites in `lib/roster/import/actions.ts`) | Fine at hundreds of rows; slow at the 5,000-row limit (multi-MB payload per edit) | Re-validate only the affected row plus rows sharing its duplicate or household keys; keep full revalidation for remap and commit |
| D11 | **Touch targets below 44px** | `components/ui/button.tsx:22–23` (`sm` 32px, `md` 36px), checkbox 16px (`form-controls.tsx:29`), icon buttons about 28px | §41 minimum 44×44px; §40.5 critical admin actions must work on a phone; seller and buyer screens will reuse these components | Add an `lg` (44–48px) size; use it in seller and buyer flows and in mobile admin rows; enlarge mobile checkboxes and icon buttons |
| D12 | **`created_by` can be spoofed** | `set_actor_columns()` only sets `created_by` when it is null | A client can insert a row claiming another user created it (the audit `actor_id` is still correct) | Always overwrite `created_by := auth.uid()` when a user is authenticated |
| D13 | **Not-found returns HTTP 200** | Streaming from `app/o/[orgSlug]/loading.tsx` | No data leaks, but monitoring and crawlers see 200. The future public verification page must return a real 404 for an invalid token | Resolve existence before streaming (or use route-level loading) for public routes |
| D14 | **Name-only search index** | `player_directory.search_text` | The global search requirement (§40.5) | Add a search view or RPC across players, guardians (email, phone digits), buyers and tickets when tickets exist |

---

## E. TECHNICAL RISKS

| Risk | Type | Severity | Detail / mitigation |
|---|---|---|---|
| D6 | Permission / compliance | **High** | Tenant can change its own jurisdiction profile and status. Fix before any campaign uses `jurisdiction_mode` |
| D7 | Identity | **High** (once invitations exist) | Profile email spoofing and wildcard lookup can attach the wrong account as admin. Fix before building invites |
| Ticket issuance not yet designed into code | Race / integrity | **Critical for Phase 3** | Must use `SELECT … FOR UPDATE SKIP LOCKED` on the seller's AVAILABLE tickets, an `idempotency_keys (seller_id, key) UNIQUE` table returning the original sale, and a single RPC transaction. Required tests: double tap, retry after timeout, concurrent sellers, inventory cap (§29) |
| Ticket validity coupled to money | Integrity / UX | **Critical for Phase 4** | Keep `status` and `reconciliation_state` as separate columns; reconciliation code must never write `status`. Add a pgTAP test proving a bounced check leaves the ticket ACTIVE |
| Seller liability stored as a mutable balance | Integrity | High (future) | Derive from the ledger; if cached, recompute in the same transaction and add a check |
| PII in the append-only audit log | Privacy | Medium | `audit_row_change` stores full before/after rows (`…0100_foundation.sql:426`), including guardian contacts and child DOB, which can't be deleted. Define retention, consider redacting PII fields in audit JSON (keep changed field names), and document it in a privacy policy |
| Child PII visibility | Privacy | Medium | Child DOB and guardian contacts are readable by every `roster.read` role (Campaign Manager, Finance, Auditor). Consider masking DOB and contacts for non-admin roles |
| Silent 1,000-row caps (D9) | Data correctness / scale | Medium | Wrong counts at scale with no error |
| No CI | Process | Medium | 42 unit tests, 32 pgTAP tests, lint and build exist but nothing enforces them on PRs. Add GitHub Actions (Node checks plus `supabase start` + `supabase test db`) |
| Not tested on hosted Supabase | Deployment | Medium | Auth redirect URLs, email templates (token-hash confirm), `max_rows`, connection pooling. Do a staging deploy (§32: separate dev/staging/prod and separate ticket-number namespaces) |
| Magic-link origin fallback to the `Host` header | Security | Low | `app/(auth)/login/actions.ts` uses `NEXT_PUBLIC_SITE_URL ?? host`. Require `NEXT_PUBLIC_SITE_URL` in production (Supabase's redirect allowlist also mitigates) |
| Two `auth.getUser()` round-trips per request | Performance | Low | Proxy and `getSessionUser`. Acceptable; consider `getClaims()` with asymmetric JWT keys later |
| Duplicate detection O(n²) by name, run twice per dashboard load | Scale | Low | `possible_duplicate_players()` in `roster_overview`. Fine for hundreds; add an index on normalized names or cache when clubs reach thousands |
| No rate limiting / CAPTCHA | Abuse | Low now, **High at Phase 5** | Required for public verify and request endpoints (§23–24) |
| No observability | Operations | Medium (pre-launch) | Structured logs and alerts for failed issuance, delivery, reconciliation and unauthorized access (§32) |
| Hard-coded Aspire concepts in the future spec (ASG prefix, Fan Wear reward, "Aspire Sports Group" on tickets) | Multi-tenancy | Medium (design) | Make them per-org or per-campaign settings from the start (ticket prefix, reward program, operator snapshot) |
| Import revalidation cost (D10) | Scale / UX | Low–Medium | Slow edits on very large files |

The audit trigger architecture showed **no genuine technical problem**: transactional, unbypassable by app code, append-only, attributable. The items above (reason, hash chain, PII retention, domain ledgers) are extensions, not replacements.

---

## F. RECOMMENDED BUILD ORDER

Each phase ends with migrations, pgTAP tests for its invariants, unit tests, browser QA at 360px and desktop, and docs.

**Phase 1.5 — Hardening (small, do first)**
1. CI: GitHub Actions running lint, typecheck, Vitest, build, and `supabase start` + `supabase test db`.
2. D6 org column guard; D7 profile email read-only plus exact lookup; D12 `created_by`.
3. D1 multi-role memberships and D2 `DIRECTOR` role with the new permission keys.
4. D9 move counts and pagination into SQL; search comboboxes for large pickers.
5. D11 `lg` touch-target size in the design system.
6. Member management: add an existing user, invite by email (server-only service-role route with audit), resend.
7. Staging deploy on hosted Supabase; email templates; `NEXT_PUBLIC_SITE_URL` required.

**Phase 2 — Campaign setup** (finishes blueprint Phase 0)
1. D3/D4 campaign schema plus `transition_campaign()` state machine and price lock.
2. Campaign builder UI (DRAFT): dates (30-day helper), price, goals, contact, operator snapshot, ticket prefix.
3. Prizes, with cash-prize block, possession status and rank.
4. Compliance checklist and READY → ACTIVE gate (Director only, with reason); raffle-count warning.
5. Participant enrollment from the roster (teams → players), with D5 seller accounts and family invitations.

**Phase 3 — Ticket engine and core sale** (blueprint Phase 1)
1. Inventory generation (UUID + immutable human number) and allocation to sellers, with an allocation ledger.
2. `tickets` (status plus separate `reconciliation_state`), append-only `ticket_events`, `buyers`, `payment_receipts`, `idempotency_keys`.
3. `issue_tickets()` RPC: atomic, idempotent, row locks, inventory cap, sales window, audit and ledger events.
4. Seller home plus the Sell Tickets flow (target under 20 seconds, 44px+ targets, large total, payment-received checkbox, gold CTA, success screen).
5. Opaque verification token (hashed), buyer ticket page, public verify page (masked PII, real 404), QR.
6. Email delivery queue with retries and resend/copy-link (delivery failure never affects validity).
7. pgTAP and E2E for §29: atomic, idempotent, inventory cap, sales-close stop, verification without PII.

**Phase 4 — Reconciliation** (blueprint Phase 2)
1. Derived seller liability; `reconciliation_batches`, `reconciliation_entries` (FIFO allocation), `adjustments` (reason), `payment_exceptions`, write-offs (Director).
2. Turn-in screen under 30 seconds (seller QR scan or search, MATCH/VARIANCE, one tap); Finance queue; CSV/QBO export (logged).
3. Invariant tests: reconciliation never changes ticket `status`.

**Phase 5 — Corrections and admin operations**
1. Correction requests (seller) → void/reissue (admin, reason, replacement link, buyer notice).
2. Ticket, buyer and global search; inventory screen; seller management; campaign command-center metrics and work queues; exception queue.

**Phase 6 — Sharing and requests** (blueprint Phase 3)
Public campaign/share page (no payment, no inventory consumption), nonbinding requests with states, seller inbox, rate limiting and CAPTCHA.

**Phase 7 — Team and club operations** (blueprint Phase 4)
Team-scoped captain access, club/team/family progress and participation, targets, inventory requests, reminder composer with message-intelligence rules.

**Phase 8 — Drawing, prizes and closeout** (blueprint Phase 5)
Sales close, readiness checklist, pool lock with snapshot hash, privileged unlock, draw (recorded physical draw, or CSPRNG with two-admin confirmation), winner verification and certification, claims and fulfillment, closeout package.

**Phase 9 — Supporter layer, automation and polish** (blueprint Phase 6 and §6A)
Supporter Wallet (magic link), post-draw Fan Wear reward codes (unique, one per supporter, idempotent issuance), optional SMS, 30-day automation, analytics and reports, PWA, observability, backup/restore drill, full staging simulation and pilot (§28).

---

## G. BLUEPRINT COVERAGE

Weights reflect how much of the blueprint each area takes up and how much it matters for the core sale/reconcile/draw loop. Completion is judged against the actual repository.

| Area | Weight | Implemented | Contribution |
|---|---:|---:|---:|
| 1. Organization and roster foundation (incl. auth, RBAC, audit infrastructure) | 10% | ~85% | 8.5 |
| 2. Campaign system (setup, states, prizes, compliance) | 10% | ~8% (schema stub) | 0.8 |
| 3. Seller experience | 12% | 0% | 0 |
| 4. Buyer / supporter experience (incl. wallet and rewards) | 12% | 0% | 0 |
| 5. Ticket engine | 12% | 0% | 0 |
| 6. Reconciliation | 10% | 0% | 0 |
| 7. Admin command center (beyond roster) | 8% | ~15% (dashboard and queue pattern, activity log, roster admin) | 1.2 |
| 8. Team and club reporting | 4% | ~3% (roster counts only) | 0.1 |
| 9. Drawing and prize fulfillment | 8% | 0% | 0 |
| 10. Security / architecture | 8% | ~55% (RLS, server authz, audit, transactions; missing tokens, rate limits, hash chain, PII policy, CI) | 4.4 |
| 11. Notifications, sharing/requests, automation, integrations | 6% | ~2% (communication preferences only) | 0.1 |
| **Total** | **100%** | | **≈ 15%** |

- **Blueprint Phase 0 ("Foundation") exit criterion:** "Admin can create DRAFT campaign and users" is **not met**. There is no campaign UI and no in-app user creation. Phase 0 is about 75% complete.
- **Blueprint Phases 1–6:** 0%.
- **§29 acceptance tests (20):** 1 holds (No online payment: no checkout or payment code exists), 1 partial (Audit, for roster and admin changes only). The other 18 depend on ticket, reconciliation, drawing, verification and delivery features that don't exist.
- **§42 UX acceptance criteria:** "every screen has a clear empty state and success state" and "no core mobile task requires horizontal scrolling" hold for existing screens. All seller, buyer and reconciliation criteria are unbuilt.

---

## Appendix — UX audit of existing screens

Seller-at-the-field and buyer criteria can't be assessed: **no seller or buyer screens exist**. Below covers every current screen. "Taps" counts from arriving on the screen to finishing its main task.

| Screen | Main task / taps | Typing | Scrolling (360px) | Touch targets | Empty / confirm / error states | Notes for hundreds of families |
|---|---|---|---|---|---|---|
| Login | Sign in: 3 (email, password, submit) | Email + password; magic link as an alternative | None | Inputs 36px, button 36px (below 44) | Inline error; non-enumerating magic-link message | — |
| Dashboard | Fix an issue: 1 tap to the filtered records | None | Short | Action rows about 56px ✔; header buttons 36px | "Nothing needs attention" state; recent imports empty state | Exception-first ✔ (§40.4) |
| Players directory | Assign team to unassigned: Dashboard item → select all → choose team → Apply = **4** | Search only | Long lists paginate at 50 | Mobile checkbox 20px (below 44); bulk bar buttons 32px | Empty, filtered-empty and "all clear" states ✔; toasts ✔ | Select-all applies to the current page only; no "select all N matching"; no CSV export |
| Add Player | **3 taps + 2 fields** (Add → names → team → Save) ✔; Save & add another keeps team and household ✔ | Names only (other fields optional and collapsed) | Fits without scroll unless expanded | Footer buttons 36px, stacked full-width on mobile ✔ | Field errors ✔; success toast ✔ | Household picker is a native `<select>` of every household (D9) |
| Player profile | Change team: select + Save = 2; add guardian: Add → 2–4 fields → Save | Guardian contact | Moderate; single column on mobile | Kebab menu icon about 28px (below 44) | Placeholders for campaigns and fundraising ✔ | Activity limited to 25 events |
| Households list/detail | Add guardian: 1 + fields + Save; add siblings: picker → select → Add = 3 | Contact fields | Moderate | Row buttons 32px | Missing-contact badge (icon + word) ✔; archive disabled while players remain (needs an explanation) | List filtered in memory (D9) |
| Teams list/detail | Create team: 2 + name; archive: 2 (inline confirm) ✔ | Team name | Short | Row actions 32px; mobile FAB 44px ✔ | Empty states ✔; archive warns "Archive & unassign N?" ✔ | Player counts capped (D9) |
| Import upload/map | Upload: 2 (choose → pick file) or drag; mapping usually 1 (auto-matched → Check rows) ✔ | None (save-as name prefilled) | Mapping list scrolls; sticky footer ✔ | Selects 36px | Clear upload errors (size, type, empty, header) ✔ | Saved mappings auto-apply ✔ |
| Import review | Typical import: bulk-fix team (2) + accept exact matches (1) + decide others (1 each) + Import (1) | Only when fixing a row | Long; filter chips cut it down; "show more" at 100 | Row selects and buttons 32px | Per-row issues, blocking reason in footer ✔ | Each edit re-validates the whole file (D10) |
| Import summary | — | — | Short | ✔ | Celebratory but brief ✔; link to imported players ✔ | — |
| Settings / Activity | Change role: 1 (select); create season: 2 + name | Org profile fields | Moderate | Selects 32–36px | Inline confirm on suspend ✔; activity paginated ✔ | Can't add members (B) |
| Platform | Create org: 2 + fields | Name, slug auto-filled ✔ | Short | 36px | Field errors ✔ | — |

**Cross-screen findings:**
1. **Touch targets** (D11) are the main gap against §41. Admin workflows are efficient in taps.
2. **Sync and error messaging:** network failure shows a "may not have been saved" toast. There's no retry, offline queue or idempotency for admin actions. That's acceptable for roster work but **not** for ticket issuance (Phase 3 must add idempotency keys and "never show ACTIVE until the server commits").
3. **Confirmations:** inline two-step confirm (no modals) ✔. The blueprint requires a clear confirmation for void, campaign lock, draw certification and reward revocation; reuse the pattern with a reason field.
4. **Scale:** fine for Aspire (about 300 players). Before multi-club scale: fix D9 and add select-all-matching, CSV export and search comboboxes.
