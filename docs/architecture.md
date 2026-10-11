# Raffle Hub — Architecture

Status: Phase 1 (foundation + master roster). Primary product spec:
[`Raffle-Hub-Developer-Blueprint.pdf`](./Raffle-Hub-Developer-Blueprint.pdf).

## 1. What we are building

Raffle Hub is a multi-tenant fundraising platform. Aspire Sports Group / Aspire
Futbol Club is the first organization, but nothing in the code or schema is
Aspire-specific. Aspire's identity, legal profile and branding live in data
(`organizations` row + settings).

The raffle product model (blueprint §1–2) is **direct/offline payment →
immediate ACTIVE digital ticket → later seller reconciliation**, with no online
raffle checkout in Texas CREA mode. Phase 1 builds none of the sale machinery,
but the foundation is shaped so it slots in without rework (see §7).

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
       └─ CAMPAIGNS                     (schema only in Phase 1)
            └─ CAMPAIGN PARTICIPANTS    (reference players; never copy them)
                 └─ sellers / tickets / sales / reconciliation  (later phases)
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
    campaigns/, reports/                      Phase-1 placeholders
    settings/                                 Org profile, seasons, members, mappings, activity
  platform/                                   SUPER_ADMIN: organizations
components/
  ui/                                         Design system primitives
  layout/                                     Sidebar, mobile nav, org switcher
  roster/, import/, settings/, platform/      Feature components
lib/
  supabase/                                   server / browser / proxy clients (no service role)
  auth/                                       session + organization context, permission guards
  permissions/                                permission keys + role catalog (mirrors DB)
  roster/                                     roster domain: validation schemas, queries, actions
  roster/import/                              mapping, normalization, validation, duplicates, households
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
- **The service-role key is never used by the app.** It is read only by
  `scripts/seed-dev.mjs`. `lib/supabase/*` only uses the publishable/anon key
  plus the user's session.
- **Tenant isolation** is enforced three ways: RLS (`organization_id` checked on
  every row), composite foreign keys on `(id, organization_id)` (a row cannot
  reference another tenant's row), and URL-scoped org context (`/o/[orgSlug]`)
  resolved against the user's memberships.

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

Functions are `SECURITY INVOKER` (caller's RLS applies) and call
`assert_org_permission` first so failures produce clear messages.

Pure logic that benefits from unit tests (column mapping, value normalization,
duplicate scoring, household grouping) lives in `lib/roster/import/*` and runs in
server actions; the database function only executes the reviewed plan.

## 6. Auditability

- `audit_events` is append-only (RLS has no write policies; a trigger blocks
  UPDATE/DELETE even for privileged roles).
- Events are written by **database triggers**, so no code path can skip them:
  `PLAYER_CREATED / UPDATED / ARCHIVED / RESTORED / IMPORTED`,
  `PLAYER_TEAM_CHANGED`, `PLAYER_GUARDIAN_LINKED / UNLINKED`, `TEAM_*`,
  `HOUSEHOLD_*`, `GUARDIAN_*`, `IMPORT_STARTED / COMPLETED / CANCELLED`,
  `MEMBER_ADDED`, `ROLE_CHANGED`, `ORGANIZATION_UPDATED`, `CAMPAIGN_*`.
- Each event stores actor, timestamp, before/after JSON and changed fields.
- Inside an import, the session variable `raffle_hub.import_id` turns
  `*_CREATED` into `*_IMPORTED` and tags events with the import id.

## 7. Prepared for later phases (not built)

| Future system | Hook already in place |
|---|---|
| Campaign participants / sellers | `campaign_participants` references `players`; snapshots team/household |
| Seller accounts / family logins | `guardians.profile_id`; `PARTICIPANT_FAMILY` role; `players.source = 'self_registration'` |
| Digital tickets, inventory, sales | Attach to `campaign_participants`; `campaigns.status` uses the blueprint state machine |
| Reconciliation / liabilities | `FINANCE_ADMIN` role; permission catalog is extensible |
| Jurisdiction rules | `organizations.jurisdiction_profile` → copied to `campaigns.jurisdiction_mode` |
| Drawings, prizes, winners | Append-only audit model; no hard deletes on fundraising tables |
| Notifications / SMS / email | `guardians.communication_preferences` |
| Multiple fundraiser types | `campaigns.campaign_type` |
| Subscriptions | `organizations.status`, `organizations.settings` |

Deliberately **absent**: any payment, checkout, card, or payment-link structure
(blueprint §2, §26, §34).

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

1. One role per member per organization in Phase 1; granular per-permission
   grants come from `role_permissions` and can later be overridden per member.
2. A player has at most one *current* team. History is preserved via
   `team_memberships`. (Guest-playing on two teams at once is out of scope.)
3. "Season" for a player is the season of their current team; unassigned
   players have no season.
4. CSV is the Phase 1 import format. Excel users export to CSV; native `.xlsx`
   is deferred (the common parser has a security history — evaluate before adding).
5. Member invitations need the service role and an email flow, so Phase 1 creates
   users via the seed script or the Supabase dashboard. Settings shows members
   and allows role changes.
6. Duplicate detection compares against the organization's roster in memory
   (fine to several thousand players). The `pg_trgm` index is in place for a
   database-side candidate search when needed.
