# Raffle Hub — Architecture

Status: Phase 0 foundation + master roster, with the Phase 1 raffle first slice.
Primary product spec:
[`Raffle-Hub-Developer-Blueprint.pdf`](./Raffle-Hub-Developer-Blueprint.pdf).
Pilot launch gaps and later scope: [`raffle-pilot-backlog.md`](./raffle-pilot-backlog.md).

## 1. What we are building

Raffle Hub is a multi-tenant fundraising platform. Aspire Sports Group / Aspire
Futbol Club is the first organization, but nothing in the code or schema is
Aspire-specific. Aspire's identity, legal profile and branding live in data
(`organizations` row + settings).

The raffle product model (blueprint §1–2) is **direct/offline payment →
immediate ACTIVE digital ticket → later seller reconciliation**, with no online
raffle checkout in Texas CREA mode. The current slice adds assigned ticket
inventory, manual cash/check sales, scoped progress, and approved reversals and
linked corrections. Collection totals describe seller collections, not money
received, deposited, or reconciled by the organization. Those operational
workflows and drawing exports remain required pilot launch work (see §7).

```
PLATFORM
  └─ ORGANIZATION                       (tenant root)
       ├─ MASTER ROSTER                 (persistent, campaign-independent)
       │    ├─ Seasons
       │    ├─ Teams
       │    ├─ Players ── team_memberships (history)
       │    ├─ Households
       │    ├─ Guardians ── player_guardians (many-to-many)
       │    └─ Organization users (organization_members)
       └─ CAMPAIGNS                     (raffle first slice)
            └─ CAMPAIGN PARTICIPANTS    (reference players; never copy them)
                 ├─ TICKET ALLOCATIONS → TICKETS
                 └─ IMMUTABLE SALES → COLLECTION EVENTS
                                      └─ REVERSALS / LINKED CORRECTIONS
```

## 2. Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, React 19, server components + server actions) |
| Language | TypeScript, `strict` |
| Styling | Tailwind CSS 4, design tokens in `app/globals.css` |
| Data | Supabase Postgres |
| Auth | Supabase Auth (email + password, magic link), cookies via `@supabase/ssr` |
| Authorization | Postgres RLS + permission helpers; mirrored server-side checks |
| Validation | Zod (shared by forms and server actions) |
| Forms | React Hook Form where a form has client-side state |
| CSV | PapaParse (server-side parse) |
| Tests | Vitest (domain logic), pgTAP via `supabase test db` (RLS/tenancy) |
| Deploy | Any Node host for Next.js — Netlify or Vercel; Supabase hosted |

## 3. Repository layout

```
app/
  (auth)/login, auth/callback, auth/signout   Authentication
  o/[orgSlug]/                                Organization workspace (sidebar shell)
    dashboard/                                Command center + Action Needed
    people/players/                           Directory, profile, add, import wizard
    people/households/                        Households + guardians
    teams/                                    Teams
    campaigns/                                Admin campaign list, setup, and progress route contract
    fundraising/                              Linked-family campaign route contract
    team-fundraising/                         Assigned-team campaign route contract
    reports/                                  Future reporting
    settings/                                 Org profile, seasons, members, mappings, activity
  platform/                                   SUPER_ADMIN: organizations
components/
  ui/                                         Design system primitives
  layout/                                     Sidebar, mobile nav, org switcher
  roster/, import/, settings/, platform/      Roster and organization feature components
  fundraising/                                Raffle interface integration
lib/
  supabase/                                   server / browser / proxy clients; admin.ts (server-only, auth admin ops)
  auth/                                       session + organization context, permission guards
  permissions/                                permission keys + role catalog (mirrors DB)
  roster/                                     roster domain: validation schemas, queries, actions
  roster/import/                              mapping, normalization, validation, duplicates, households
  campaigns/                                  lifecycle, setup schemas, guarded setup actions
  fundraising/                                scoped queries, transactional actions, money/goal validation
  validation.ts, actions.ts                   shared Zod helpers, server-action wrapper
  dashboard/, audit/, settings/, platform/     overview + Action Needed, audit labels, settings & platform actions
  database/                                   generated DB types
supabase/
  migrations/                                 SQL migrations (source of truth)
  tests/                                      pgTAP RLS tests
scripts/seed-dev.mjs                          Development-only seed (service role, refuses production)
docs/                                         This documentation
```

## 4. Request flow & trust boundaries

```
Browser ──► proxy.ts (refresh Supabase session cookie; redirect anonymous users)
        ──► Server Component / Server Action
              ├─ getOrgContext(slug): user + org + role + permissions (one cached lookup per request)
              ├─ requirePermission(ctx, 'roster.write')   ← server-side check (clear errors)
              ├─ Zod-validate input
              └─ Supabase client with the USER's JWT ──► PostgREST ──► Postgres
                                                            └─ RLS policies (has_org_permission)  ← DB-side enforcement
```

- **Never trust the UI.** Hidden buttons are UX only. Every mutation re-checks
  permissions in the server action *and* RLS enforces them in Postgres.
- **The service-role key is never used for data access.** One narrow, server-only
  exception: `lib/supabase/admin.ts` uses it for two Supabase Auth admin
  operations that have no user-level equivalent — exact (case-insensitive) email
  → user-id lookup (`auth_user_id_by_email`, executable by `service_role` only)
  and sending invitation emails (`inviteUserByEmail`). Membership and invitation
  rows are always written with the *user's* client, so RLS and the grant rules
  still apply. Everything else uses the publishable key plus the user's session.
  The other trusted uses are `scripts/seed-dev.mjs` (local fixtures) and
  `scripts/audit-checkpoint.mjs` (verification on CI/trusted machines).
- **Tenant isolation** is enforced three ways: RLS (`organization_id` checked on
  every row), composite foreign keys on `(id, organization_id)` (a row cannot
  reference another tenant's row), and URL-scoped org context (`/o/[orgSlug]`)
  resolved against the user's memberships.
- **Scoped fundraising views are explicit.** `admin` requires `campaigns.read`,
  `family` requires `roster.read_own_family` and current linked-player scope, and
  `team` requires `roster.read_assigned_teams`, an assigned enrollment team, and
  current player/team scope. Enrollment snapshots preserve attribution, not
  continuing authorization. Removing a guardian link, team assignment, or live
  player scope revokes the corresponding scoped access.
- **Read scope never grants sale scope.** Sale recording requires `tickets.issue`
  plus either `organization.manage` or the exact participant's current family
  scope. Captain, campaign-reader, and broad-roster permissions cannot widen a
  combined family's selling scope. Existing role grants remain unchanged.
- **Buyer data stays separate from progress.** Scoped progress projections omit
  buyer contacts and private notes. Raw sale reads use financial/audit permissions
  or the issuing family's current participant scope; campaign readers and team
  captains do not gain buyer details through their progress view.

## 5. Transactions & business logic

`supabase-js` cannot open multi-statement transactions, so every multi-record
write is a Postgres function executed with `rpc()`:

| Function | Purpose |
|---|---|
| `create_player` | player + team + household (new/existing) + guardian (new/existing) |
| `set_player_team`, `bulk_set_player_team` | end current membership, start new (history kept) |
| `create_guardian` | guardian + links to players + primary flags |
| `add_players_to_household` | move players, link household guardians |
| `set_primary_guardian`, `set_household_primary_contact` | flag swaps under unique constraints |
| `commit_player_import` | execute an import plan, all-or-nothing |
| `roster_overview` | dashboard metrics + Action Needed counts |
| `enroll_campaign_players`, `withdraw_campaign_participant` | enroll active roster players by all/team/player selection; withdraw with a reason |
| `set_campaign_participant_goal`, `set_campaign_team_goal` | audited goal overrides; null inherits campaign defaults |
| `generate_campaign_tickets`, `allocate_campaign_tickets`, `prepare_campaign_inventory` | generate unique campaign numbers and assign participant stock |
| `record_campaign_sale` | atomically consume assigned tickets, insert immutable sale facts, and append collection/issuance events |
| `reverse_campaign_sale` | append an approved reversal and permanently void the original tickets |
| `fundraising_campaigns`, `campaign_progress` | explicitly scoped, redacted campaign/player/team projections |

Roster functions use `SECURITY INVOKER` (caller's RLS applies). Fundraising
transaction writers use `SECURITY DEFINER`, a fixed search path, and explicit
caller-bound permission and tenant checks; direct table writes are revoked.
Fundraising projection functions likewise enforce the selected view's permission
and scope before calculating metrics. Server actions retain the independent
permission check and call these functions with the user's JWT.

Pure logic that benefits from unit tests (column mapping, value normalization,
duplicate scoring, household grouping) lives in `lib/roster/import/*` and runs in
server actions; the database function only executes the reviewed plan. Exact
integer-cent conversion, validation, goal/progress calculations, and capability
combinations live in `lib/fundraising/*`.

The transactional foundation is introduced by these migrations:

- `20261014000100_fundraising_foundation.sql`: campaign player/team goal defaults,
  team overrides, ticket counters/inventory/allocations, immutable sale and
  reversal records, tenant/campaign constraints, guarded enrollment and stock RPCs.
- `20261014000200_fundraising_sales.sql`: atomic offline issuance, caller-bound
  idempotency, and approved reversals/corrections.
- `20261014000300_fundraising_views.sql`: scoped SELECT policies and redacted
  family/team/admin projections; existing role and raw-ledger grants remain intact.
- `20261014000400_correction_progress.sql`: correction/replacement IDs in the
  same authorized progress subset, allowing the UI to identify completed corrections.

Ticket numbers are unique per campaign and generated under campaign/counter
locks. Linked guardians share the participant's assigned pool. A sale requires an
active player/participant, an ACTIVE raffle with an open sales window, available
assigned stock, and exact quantity × ticket price. Its idempotency key is bound
to organization + actor; identical retries return the original result, while a
different request with the same key is rejected. The transaction writes no
partial sale, collection, or ticket history on failure.

Reversal requires both `tickets.void` and `adjustments.approve`, with a reason;
the database derives the approving actor. It appends a negative money event and
an immutable association to the original sale, then voids those tickets without
recycling their numbers. New ticket-changing reversals stop once the drawing is
recorded. A replacement sale references an approved reversal for the same player
and campaign and uses fresh stock; it never edits the original sale.

### Fundraising route and query contracts

Interface integration uses `/o/[orgSlug]/campaigns` and
`/o/[orgSlug]/campaigns/[campaignId]` for administration,
`/o/[orgSlug]/fundraising` for family cards, and
`/o/[orgSlug]/team-fundraising` for captain progress. Route completion and browser
acceptance are verified separately from the database foundation.

`listFundraisingCampaigns(ctx, view)` calls `fundraising_campaigns`;
`getCampaignProgress(ctx, campaignId, view, { teamId?, playerId? })` calls
`campaign_progress`. Each RPC receives the organization derived from the
authenticated context. Filters apply before totals, rankings, and recent sales;
foreign filters reveal no records. Progress returns campaign metadata, net
collection/ticket totals, participant goals/stock, team totals, and a bounded
recent-sales list without buyer details. `getCampaignSetup` uses a bounded
organization/campaign read and the existing `campaign_readiness` checks.

## 6. Auditability

- `audit_events` is append-only (RLS has no write policies; a trigger blocks
  UPDATE/DELETE even for privileged roles).
- Events are written by **database triggers**, so no code path can skip them:
  `PLAYER_CREATED / UPDATED / ARCHIVED / RESTORED / IMPORTED`,
  `PLAYER_TEAM_CHANGED`, `PLAYER_GUARDIAN_LINKED / UNLINKED`, `TEAM_*`,
  `HOUSEHOLD_*`, `GUARDIAN_*`, `IMPORT_STARTED / COMPLETED / CANCELLED`,
  `MEMBER_ADDED`, `ROLE_CHANGED`, `ORGANIZATION_UPDATED`, `CAMPAIGN_*`,
  `TICKET_*`, `TICKET_ALLOCATION_*`, `SALE_*`, `SALE_REVERSAL_*`, `MONEY_EVENT_*`.
- Each event stores actor, timestamp, before/after JSON and changed fields.
- Inside an import, the session variable `raffle_hub.import_id` turns
  `*_CREATED` into `*_IMPORTED` and tags events with the import id.
- `campaign_sales`, `ticket_allocations`, and `sale_reversals` are immutable facts.
  Tickets retain their identity/attribution while guarded transactions change
  inventory state; the ticket ledger records allocation, issuance, and voiding.
- Existing `campaign_events`, `ticket_events`, `money_events`, and `audit_events`
  row shapes and historical hash payloads remain unchanged. New relationships
  use immutable associations and existing metadata, with additional scoped
  constraints rather than added columns on hashed ledger rows. Continue running
  hash-chain and checkpoint verification after every financial workflow.

## 7. Prepared for later phases (not built)

| Future system | Hook already in place |
|---|---|
| Money status, turn-ins, reconciliation / liabilities | collection/reversal events exist; receipts, outstanding balances, check exceptions, deposits, and reconciliation workflows remain |
| Drawing export / snapshot, prizes, winners | existing lifecycle and issued/voided tickets support a later reproducible eligible-ticket snapshot and operator drawing evidence |
| Seller sharing, ticket delivery / receipts | linked-family access and issued tickets exist; sharing and delivery expectations remain pilot decisions |
| Jurisdiction rules | `organizations.jurisdiction_profile` → copied to `campaigns.jurisdiction_mode` |
| Notifications / SMS / email | `guardians.communication_preferences` |
| Multiple fundraiser types | `campaigns.campaign_type` |
| Subscriptions | `organizations.status`, `organizations.settings` |

Deliberately **absent**: online raffle checkout, card processing, payment links,
other fundraiser implementations, and campaign boosts. The current authorized
payment methods are offline cash/check. A passing first slice does not establish
pilot launch readiness; required next slices and operator rehearsal are tracked
in [`raffle-pilot-backlog.md`](./raffle-pilot-backlog.md).

## 8. UX principles applied

From the request and blueprint §37–42:
- Exception-driven dashboard: Action Needed items link straight to the filtered
  records needing work.
- Repeated admin work is ≤ 2–3 clicks: bulk select → assign team/archive; import
  bulk fixes ("assign team to all rows missing a team", "use existing for all
  exact matches").
- Side sheets instead of modals; inline confirmation instead of dialogs; toasts
  for success; skeleton loading states; empty states that name the next action.
- Status = icon + word (never color alone). Tables on desktop, cards on mobile.

## 9. Assumptions

1. A member holds one or more roles per organization (`organization_member_roles`);
   permissions are the union. Granular per-member overrides are not planned yet.
2. A player has at most one *current* team. History is preserved via
   `team_memberships`. (Guest-playing on two teams at once is out of scope.)
3. "Season" for a player is the season of their current team; unassigned
   players have no season.
4. CSV is the Phase 1 import format. Excel users export to CSV; native `.xlsx`
   is deferred (the common parser has a security history — evaluate before adding).
5. Members are added in-app (Settings → Members): an existing account is added
   immediately; a new email gets an `organization_invitations` row plus an invite
   email, accepted automatically on first sign-in with that confirmed email.
   Public self-signup is disabled.
6. Duplicate detection compares against the organization's roster in memory
   (fine to several thousand players). The `pg_trgm` index is in place for a
   database-side candidate search when needed.

## 10. Hardening phase (Phase 0) additions

- **Platform vs organization scope.** Protected organization fields (slug, status,
  jurisdiction profile, platform config) change only through
  `platform_update_organization` (platform admins, reason required). See
  `docs/roles-permissions.md`.
- **Campaign lifecycle.** `DRAFT → READY → ACTIVE → CLOSED → DRAWN → ARCHIVED`
  (plus `READY → DRAFT`, `DRAFT → ARCHIVED`). Status changes only via
  `transition_campaign` (permission + reason + readiness checks); ticket-critical
  fields lock at activation (`guard_campaign_write`). Mirrored in `lib/campaigns/lifecycle.ts`.
- **Ledgers.** Append-only, hash-chained `campaign_events`, `ticket_events`,
  `money_events`, and `audit_events`; fundraising writes go through guarded
  transaction functions. See `docs/AUDIT.md`.
- **Scale.** Lists that could exceed PostgREST's 1,000-row cap are counted,
  filtered and paginated in SQL (`list_households`, `list_org_members`,
  `list_possible_duplicates`, `team_player_counts`) or paged with `fetchAll`.
- **Testing & deployment.** CI, e2e and the staging pipeline are described in `docs/deployment.md`.
