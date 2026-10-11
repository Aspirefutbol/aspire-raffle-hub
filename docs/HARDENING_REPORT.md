# Raffle Hub — Phase 0 Hardening Report

Status: **PARTIAL.** Everything that can run in the repository passes. Hosted
Supabase testing and the staging deployment are built and wired, but they haven't
run yet because no hosted credentials exist (see "Blocked" below). The full ticket
engine has **not** been started.

## What changed

| Area | Change |
|---|---|
| Org permissions | Protected org fields (slug, status, jurisdiction profile, platform config) are platform-admin only. They're blocked by a trigger even through the API, and changed only via `platform_update_organization` with a required reason. There's a new `/platform/organizations/[id]` page with a protected-settings form, change history and add-admin. Suspended and archived orgs lock out their members. |
| Identity / invitations | `_` and `%` in emails are no longer wildcards: lookup is an exact, case-insensitive match (`auth_user_id_by_email`, service-role only, errors if more than one account matches). Settings → Members can add an existing account immediately or send an invite. The invite email links to `/auth/confirm` and then `/welcome`, and the invitation is accepted on sign-in (confirmed email only). Admins can resend and revoke invitations. Public signup is disabled. |
| Multi-role | Roles live in `organization_member_roles`. Permissions are the union of a member's roles. New DIRECTOR role. Grant rule: you can grant a role only if you hold all of its permissions plus `members.manage`. Every org keeps at least one Organization Admin. Reasons are recorded. |
| Campaign state machine | DRAFT → READY → ACTIVE → CLOSED → DRAWN → ARCHIVED (plus READY → DRAFT and DRAFT → ARCHIVED). Status changes only through `transition_campaign`, which checks permission, reason and readiness. Ticket price and other ticket-critical fields lock at ACTIVE. CLOSED and later states are read-only. The operator disclosure is snapshotted at activation. Every change goes to the `campaign_events` ledger and the audit log. Server actions are in `lib/campaigns/actions.ts`. There's no campaign UI yet (Phase 2). |
| Audit and integrity | Reasons are captured into `audit_events.metadata.reason`. SHA-256 hash chains cover `audit_events` (per org) and the ledgers (per campaign), with `verify_*` functions. `ticket_events` and `money_events` are prepared as append-only tables with reason, reversal and approval constraints. New activity-log labels and filters. |
| Scale | Households, members, duplicates, team counts and platform summaries are filtered, counted and paginated in SQL. The roster import context pages past 1,000 rows. The household `<select>` that loaded every household is replaced by a server-side search picker. |
| Mobile | All controls are at least 44px on coarse pointers (`pointer-coarse:`). Verified by e2e at 360px on 5 pages, with no horizontal overflow. |
| Testing / deploy | GitHub Actions CI covers lint, types, unit tests, build, migrations from scratch, pgTAP, a types drift check, seeding, the DB catalog parity check and Playwright e2e. There's also a staging workflow (hosted `db push` + hosted pgTAP + Netlify deploy + smoke tests), `netlify.toml` and `docs/deployment.md`. |

## Database / schema changes

New migrations:

- **`20261012000100_hardening_identity_roles.sql`:**
  - Permission scopes; new permissions; DIRECTOR role.
  - `organizations.platform_config`.
  - `organization_member_roles`: data migrated, the old `role_key` column dropped.
  - `organization_invitations`.
  - Protected-field guard and `platform_update_organization`.
  - Multi-role `has_org_permission`, `my_org_roles` and `can_assign_role`.
  - Member and invitation functions.
  - Reason capture.
  - Profile column grants narrowed.
  - `created_by` can no longer be spoofed.
- **`20261012000200_campaign_lifecycle.sql`:**
  - New status set and campaign setup columns.
  - Lifecycle guard trigger, readiness check and `transition_campaign`.
  - `campaign_events`.
- **`20261012000300_ledgers_and_audit_chain.sql`:**
  - Hash-chain machinery; existing audit rows backfilled.
  - `ticket_events` and `money_events`.
  - Verify functions.
- **`20261012000400_scale_queries.sql`:** SQL-side list, count and pagination functions.
- **`20261012000500_member_functions.sql`:** `set_member_status` and `revoke_invitation` with reasons.

## Permissions matrix

See `docs/roles-permissions.md`, which covers:
- Platform Admin vs Organization Admin;
- a 7-role × 17-permission matrix;
- grant rules.

## Tests performed

| Suite | Result |
|---|---|
| pgTAP (`npx supabase test db`): RLS, protected fields, identity, multi-role, grant rules, invitations, lifecycle, locks, ledgers, hash-chain tamper detection, scale RPCs | **121 / 121 pass** (local) |
| Vitest: units plus the TS ↔ DB permission catalog and lifecycle mirrors | **57 / 57 pass** |
| Playwright e2e: Phase 0 acceptance, smoke checks, 360px touch targets | **17 / 17 pass** (local production build) |
| ESLint, `tsc --noEmit`, `next build` | clean |
| Hosted Supabase pgTAP | **not run**: no hosted project or credentials |
| Staging smoke | **not run**: no staging deployment |

Bugs the new tests caught and that are now fixed:
- Org admins couldn't assign Seller / Family. Fixed by giving Organization Admin `tickets.issue`.
- The local auth config disabled the whole email provider, not just signup.

## Known remaining risks

1. **Staging and hosted Supabase have never run.** Hosted Auth settings (site URL, signup off, templates, SMTP) have to be set by hand, as listed in `docs/deployment.md`.
2. **Invitation email delivery** depends on SMTP. The built-in Supabase mailer is heavily rate-limited, so configure SMTP before inviting real people.
3. **Hash chains detect tampering but can't prevent it by a superuser.** Fix: anchor `head_hash` outside the database (periodic signed export) before money workflows.
4. **The service-role key lives in the web runtime** (`lib/supabase/admin.ts`, server-only) for email lookup and invitations. It must stay server-only, and rotation should be documented.
5. **`ticket_events` and `money_events` are schema-only.** Their writer functions, RLS read scoping and reconciliation math are Phase 2+.
6. **Team-scoped access** (captain sees only their team, family sees only their household) isn't implemented. TEAM_CAPTAIN has no grants yet.
7. **There's no UI for campaign setup or platform-admin management.** Platform admins are added via SQL.
8. **Duplicate detection** still compares the roster in memory during import. That's fine to several thousand players; at larger scale, move it to SQL candidates (`pg_trgm`).

## Blocked (needs the owner)

- This cloud session's network policy blocks `api.supabase.com` and `api.netlify.com`, and there are no hosted credentials.
- To finish, follow `docs/deployment.md` → "Staging setup": create the staging Supabase project and Netlify site, then add the GitHub `staging` environment secrets and variables.
- Then run the **Staging** workflow. A green run turns the two PARTIAL items below into PASS.

## Phase 0 acceptance checklist

| Item | Result | Evidence |
|---|---|---|
| Platform Admin creates/manages orgs safely | **PASS** | e2e: create org + invite first admin; protected change with reason + history; pgTAP protected-field tests |
| Org Admin manages only allowed settings | **PASS** | e2e: UI hides protected fields; direct API update and RPC both return 42501; allowed field succeeds |
| Admins add/invite users in-app | **PASS** | e2e: add existing account; invite → Mailpit email → link → `/welcome` → org access |
| Users can hold multiple roles | **PASS** | e2e: Auditor + Finance Admin; pgTAP union, grant rule, last-admin guard |
| Audit records exist for protected changes | **PASS** | e2e: `Role granted` with reason in activity log; pgTAP `ORGANIZATION_PROTECTED_CHANGED`, campaign status, chain verification |
| Permissions enforced server-side | **PASS** | e2e: seller/captain API escalation attempts rejected; pgTAP RLS; `orgAction` checks |
| Hosted Supabase testing passes | **PARTIAL** | Workflow step ready (`supabase test db --db-url`); not run because there are no credentials |
| Staging deployment operational | **FAIL (blocked)** | Pipeline and config ready; no staging environment exists yet |
