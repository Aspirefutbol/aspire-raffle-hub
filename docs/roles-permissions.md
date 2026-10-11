# Raffle Hub — Roles & Permissions

## Model

```
platform_admins ─────────────► SUPER_ADMIN (every organization, every permission)

organization_members ─ role_key ─► roles ─► role_permissions ─► permissions
   (one role per user per org)
```

- **Roles** are a global catalog (`roles`). Scope is `platform` or `organization`.
- **Permissions** are granular keys (`permissions`). Code and RLS check
  permissions, **never role names**, so roles can be re-shaped without touching
  application code.
- **`has_org_permission(org_id, key)`** is the single authorization primitive,
  used by RLS policies, database functions and (through `my_org_permissions`)
  the application.

## Roles

| Role | Scope | Phase 1 status | Purpose |
|---|---|---|---|
| `SUPER_ADMIN` | platform | **Active** | Platform operator. Access to every organization; creates organizations. Granted via `platform_admins` (service role only). |
| `ORGANIZATION_ADMIN` | organization | **Active** | Full control of one organization. |
| `CAMPAIGN_MANAGER` | organization | Catalogued | Runs campaigns; reads roster. |
| `FINANCE_ADMIN` | organization | Catalogued | Reconciliation/financial exports (blueprint §4). |
| `TEAM_CAPTAIN` | organization | Catalogued, no grants | Team-scoped visibility once campaigns exist. |
| `AUDITOR` | organization | Active (read-only) | Read roster, members, audit log. No writes (blueprint §4 "Auditor/Read-only"). |
| `PARTICIPANT_FAMILY` | organization | Catalogued, no grants | Family/seller access scoped to their household (self-registration phase). |

## Permissions

| Key | ORG_ADMIN | CAMPAIGN_MGR | FINANCE | AUDITOR | CAPTAIN | FAMILY |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `organization.manage` | ✓ | | | | | |
| `members.read` | ✓ | ✓ | | ✓ | | |
| `members.manage` | ✓ | | | | | |
| `roster.read` | ✓ | ✓ | ✓ | ✓ | | |
| `roster.write` | ✓ | | | | | |
| `roster.import` | ✓ | | | | | |
| `audit.read` | ✓ | | | ✓ | | |
| `campaigns.read` | ✓ | ✓ | ✓ | ✓ | | |
| `campaigns.manage` | ✓ | ✓ | | | | |

SUPER_ADMIN implicitly holds every permission in every organization.

## Enforcement layers

1. **Database (authoritative).** RLS on every table, e.g.
   `players`: select requires `roster.read`; insert/update require `roster.write`;
   no delete grant. `audit_events` has no write policy at all. Transactional
   functions call `assert_org_permission` before doing anything.
2. **Server (clear errors, defense in depth).** Every server action resolves the
   org context and calls `requirePermission(ctx, key)` before touching data.
   Pages call `requirePermission` / `can(ctx, key)` to decide what renders.
3. **UI (convenience only).** Buttons for actions the user can't perform are
   hidden or disabled. This is never relied upon for security.

## Guardrails

- The last active ORGANIZATION_ADMIN of an organization cannot be demoted,
  suspended or removed (database trigger).
- Platform roles cannot be assigned through `organization_members` (composite FK
  to `roles(key, scope)`).
- Role changes emit `ROLE_CHANGED` audit events automatically.

## Extending

Adding a permission (e.g. `tickets.issue` in the sales phase):

1. Migration: `insert into permissions …; insert into role_permissions …`.
2. Add the key to `lib/permissions/index.ts` (`PERMISSIONS`).
3. Write RLS policies on the new tables using `has_org_permission(organization_id, 'tickets.issue')`.

Scoped roles (team captain → own team; family → own household) will add
policies that join through `team_memberships` / `guardians.profile_id`, without
changing the organization-wide model above.
