# Raffle Hub — Roles & Permissions

## Model

```
platform_admins ──► SUPER_ADMIN ──► platform permissions (platform.*)
                                   + implicit support access to every org permission

organization_members ─┬─ organization_member_roles ─► roles ─► role_permissions ─► permissions
  (one per user/org)  └─ status: active | suspended | removed
                         (a member holds ONE OR MORE roles; permissions are the union)
```

- **Roles** are a global catalog (`roles`) with a `scope`: `platform` or `organization`.
- **Permissions** are granular keys (`permissions`), also scoped. A trigger
  (`guard_role_permission_scope`) prevents granting a platform permission to an
  organization role, or the reverse.
- Code and RLS check **permissions, never role names**, so roles can be reshaped
  (or new ones added) with a migration and no app changes.
- **`has_org_permission(org, key)`** is the organization primitive: true when the
  user is an *active* member of an *active* organization and any of their roles
  grants `key`, or when they are a platform admin. **`has_platform_permission(key)`**
  is the platform primitive.
- Members of a **suspended or archived organization** lose all access.

## Platform Admin vs Organization Admin

| Capability | Platform Admin (`SUPER_ADMIN`) | Organization Admin |
|---|:-:|:-:|
| Create organizations | ✓ | |
| See every organization (`/platform`) | ✓ | |
| Change **slug, status, jurisdiction profile, platform config** | ✓ (reason required, audited as `ORGANIZATION_PROTECTED_CHANGED`) | ✗ (blocked by trigger, even via the API) |
| Suspend / archive an organization | ✓ | ✗ |
| Name, legal name, address, timezone, support contact | ✓ | ✓ |
| Seasons, saved import mappings | ✓ | ✓ |
| Add / invite members, assign roles | ✓ (any role) | ✓ (only roles whose permissions they hold) |
| Grant `DIRECTOR` | ✓ | only if also a Director |
| Manage platform admins | ✓ (`platform.admins`, SQL only for now) | ✗ |

Protected organization fields are enforced by `guard_organization_protected_fields`
(raises `42501` unless the caller is a platform admin or a server-side process with
no JWT). Platform admins change them through `platform_update_organization(org,
changes, reason)`, which accepts only `slug`, `status`, `jurisdiction_profile`,
`platform_config` and requires a reason of at least 5 characters.

## Organization roles

| Role | Label | Purpose |
|---|---|---|
| `DIRECTOR` | Director | Governance: activates and closes out campaigns, approves write-offs, certifies drawings. |
| `ORGANIZATION_ADMIN` | Organization Admin | Day-to-day operations: roster, members, settings, campaigns, corrections. |
| `CAMPAIGN_MANAGER` | Campaign Manager | Sets up and runs campaigns; reads the roster. |
| `FINANCE_ADMIN` | Finance Admin | Records turn-ins and reconciles seller funds; exports. |
| `TEAM_CAPTAIN` | Team Manager / Captain | Reads only assigned teams, their current players and those players’ guardians/households. |
| `AUDITOR` | Auditor (read-only) | Read-only: roster, members, campaigns, activity log, exports. |
| `PARTICIPANT_FAMILY` | Seller / Family | Reads only their own linked household and player(s); sells tickets once campaigns launch. |

Typical combinations: **Organization Admin + Director** (small clubs), **Director +
Finance Admin**, **Team Manager + Seller**, **Auditor + Finance Admin**.

## Permission matrix

| Permission | Director | Org Admin | Campaign Mgr | Finance | Captain | Auditor | Seller/Family |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `organization.manage` | | ✓ | | | | | |
| `members.read` | ✓ | ✓ | ✓ | | | ✓ | |
| `members.manage` | | ✓ | | | | | |
| `roster.read` | ✓ | ✓ | ✓ | ✓ | | ✓ | |
| `roster.read_assigned_teams` (scoped) | | ✓¹ | | | ✓ | | |
| `roster.read_own_family` (scoped) | | ✓¹ | | | | | ✓ |
| `roster.write` | | ✓ | | | | | |
| `roster.import` | | ✓ | | | | | |
| `audit.read` | ✓ | ✓ | | | | ✓ | |
| `campaigns.read` | ✓ | ✓ | ✓ | ✓ | | ✓ | |
| `campaigns.manage` (draft, edit, ready, close) | | ✓ | ✓ | | | | |
| `campaigns.activate` (activate, drawn, archive) | ✓ | | | | | | |
| `tickets.issue` *(ticket phase)* | | ✓ | | | | | ✓ |
| `tickets.void` *(ticket phase)* | | ✓ | ✓ | | | | |
| `reconciliation.manage` *(money phase)* | | ✓ | | ✓ | | | |
| `adjustments.approve` *(money phase)* | ✓ | | | | | | |
| `drawing.manage` *(drawing phase)* | | ✓ | ✓ | | | | |
| `drawing.certify` *(drawing phase)* | ✓ | | | | | | |
| `exports.run` | ✓ | ✓ | | ✓ | | ✓ | |

¹ Org Admins already read the whole roster; they hold the scoped permissions so
the grant rule lets them assign the Captain and Seller/Family roles.

Platform permissions (`platform.organizations`, `platform.admins`) belong only to
`SUPER_ADMIN`. Separation of duties: activating a campaign, approving adjustments
and certifying a drawing need `DIRECTOR`; the operational admin can prepare but
not activate unless they also hold Director.

## Grant rules (`can_assign_role`)

A user may grant or revoke a role only if they hold `members.manage` **and every
permission that role grants** (platform admins may grant anything). So an
Organization Admin can assign every role except Director; an Admin + Director can
assign Director. The same rule is mirrored in `canAssignRole()` for the UI.

Guardrails (deferred constraint triggers):
- every organization keeps at least one active Organization Admin;
- you can't suspend yourself;
- role changes go through `set_member_roles(member, roles[], reason)` /
  `add_organization_member(org, user, roles[], reason)` and emit `ROLE_GRANTED`,
  `ROLE_REVOKED` and `MEMBER_*` audit events carrying the reason.

## Enforcement layers

1. **Database (authoritative).** RLS on every table via `has_org_permission`;
   transactional functions call `assert_org_permission`; `SECURITY DEFINER`
   functions check permissions explicitly against `auth.uid()`.
2. **Server.** Every server action goes through `orgAction(slug, permission, …)`
   which resolves the membership and checks the permission before touching data.
3. **UI.** Hides or disables what the user can't do. Never relied on.

The TypeScript mirror (`lib/permissions/index.ts`) is checked against the
migrations (`catalog.test.ts`) and against the live database (`catalog.db.test.ts`).

## Extending

1. Migration: insert into `permissions` (with `scope`) and `role_permissions`, or a new `roles` row.
2. Add it to `lib/permissions/index.ts` (`PERMISSIONS`, `ROLE_PERMISSIONS`, labels).
3. RLS policies on new tables use `has_org_permission(organization_id, '<key>')`.
4. `npm test` fails until the TS mirror and the database agree.

## Scoped roles (database-enforced)

| | Team Manager / Captain | Seller / Family |
|---|---|---|
| Permission | `roster.read_assigned_teams` | `roster.read_own_family` |
| Scope table | `team_staff_assignments` (member ↔ team) | `guardian_user_links` (member ↔ the guardian record they are) |
| Teams | assigned teams only | the current team of their own player(s) |
| Players | players currently on assigned teams | players in their household, or linked to their guardian record |
| Households | households of those players | their own household |
| Guardians | guardians linked to those players | their own record + their household’s guardians |
| Team history | current memberships only | their own players’ history |
| Writes | none | none |

- Scope only applies while the member is **active**, the organization is
  **active**, the member holds the scoped permission, and the assignment/link is
  not archived. Removing any of these removes access immediately.
- Enforced by additional permissive RLS SELECT policies built on
  `my_scoped_team_ids()`, `my_scoped_player_ids()`, `my_scoped_household_ids()`,
  `my_scoped_guardian_ids()` (SECURITY DEFINER, keyed on `auth.uid()`). Boolean
  helpers: `can_access_team(id)`, `can_access_player(id)`, `can_access_household(id)`.
- Org-wide RPCs (`roster_overview`, `list_households`, …) still require
  `roster.read`, so scoped users get `42501` from them.
- Assignments are changed only through `set_team_staff_assignments`,
  `link_family_guardian` and `unlink_family_guardian` (`members.manage`, reason
  recorded, audited as `TEAM_STAFF_*` / `FAMILY_LINK_*`, archived and never deleted).
- **Admin UI:** Settings → Members. A member with the Captain role shows a
  **Teams** button; one with the Seller/Family role shows a **Family** button.

Platform Admin creation is SQL-only; see `docs/platform-admins.md`.
