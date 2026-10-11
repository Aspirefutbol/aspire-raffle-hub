# Raffle Hub — Build Plan

Phases follow the request and the blueprint (§28). Each phase ends with an
approval checkpoint.

## Phase 1 — Foundation & Master Roster (this phase)

Order of implementation:

1. ✅ Read blueprint, inspect repo, write docs (`architecture`, `database-schema`,
   `roles-permissions`, `roster-system`, `build-plan`).
2. ✅ Database: migrations for tenancy, roles/permissions, audit, roster, imports,
   campaign foundation; RLS everywhere; pgTAP tests.
3. ✅ Development seed (Aspire Sports Group, U13–U19 Boys, ~18 players).
4. ✅ App shell: design tokens, UI primitives, sidebar + mobile nav, org switcher.
5. ✅ Authentication: Supabase Auth (password + magic link), session proxy,
   org-scoped routing, permission guards.
6. ✅ Teams: list, create, edit, archive/restore, team roster.
7. ✅ Players: directory (search, filters, bulk actions), Add Player sheet,
   profile, edit, team history.
8. ✅ Households & guardians: list, create, link players, add guardians, primary flags.
9. ✅ Import wizard: upload, map, validate, duplicates, resolve, commit, summary;
   saved mappings.
10. ✅ Dashboard: roster metrics + Action Needed.
11. ✅ Settings: organization profile, seasons, members/roles, saved mappings,
    activity log. Campaigns & Reports placeholders. Platform org list (SUPER_ADMIN).
12. ✅ Verification: lint, typecheck, unit tests, RLS tests, build, browser QA
    (desktop + 390px mobile).

### Definition of done (from the request)
Sign in · org isolation · dashboard · teams CRUD/archive · roster · add/edit
player · households/guardians · CSV upload → map → preview → errors → duplicates
→ corrections → import · search/filter · bulk actions · player profile · Action
Needed · desktop + mobile · documented schema/architecture · migrations ·
enforced permissions · lint/type clean · no raffle sales functionality.

### Deferred within Phase 1 scope (documented)
- Member invitations (needs service role + email flow) — use seed/Supabase dashboard.
- Native `.xlsx` import — CSV only.
- Player merge of two existing roster records (duplicates can be dismissed or archived).

## Phase 2 — Campaign setup (blueprint Phase 0 remainder)
Campaign CRUD (DRAFT), jurisdiction mode, prizes (no cash), compliance checklist,
participant enrollment from the master roster (select teams → players), seller
accounts and family invitations.

## Phase 3 — Core sale (blueprint Phase 1)
Ticket inventory pre-generation and allocation, seller home, atomic + idempotent
`issue` transaction, ACTIVE digital ticket, verification token/QR, email delivery.

## Phase 4 — Reconciliation (blueprint Phase 2)
Seller liability, turn-in screen, partial reconciliation, check exceptions,
batches/deposits, adjustments.

## Phase 5 — Sharing & requests (blueprint Phase 3)
Public campaign page, nonbinding ticket requests, seller request inbox.

## Phase 6 — Team/club ops (blueprint Phase 4)
Team dashboards, targets, reminders, inventory requests, team-scoped captain access.

## Phase 7 — Drawing & prizes (blueprint Phase 5)
Sales close, draw snapshot/lock, winner record/certification, prize claims,
supporter reward.

## Phase 8 — Automation & polish (blueprint Phase 6)
30-day messaging engine, SMS, analytics, exports, PWA.

## Guardrails carried through every phase
- No online raffle-ticket checkout in Texas CREA mode.
- Ticket validity separate from reconciliation state.
- No destructive edits of fundraising records; void/reissue with audit.
- Server-side + RLS authorization on every endpoint.
