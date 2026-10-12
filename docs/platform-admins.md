# Raffle Hub — Platform Administrators

Platform Admin (`SUPER_ADMIN`) is the platform-operator role. It can create
organizations and change protected organization fields.

## How it's locked down

- It is **not** an organization role. `organization_member_roles` only accepts
  roles with `scope = 'organization'`, and `set_member_roles` /
  `add_organization_member` reject `SUPER_ADMIN` ("Unknown role").
- `anon` and `authenticated` have **no** `INSERT/UPDATE/DELETE` on `platform_admins`.
- RLS lets a signed-in user read **only their own** row, which is how the app
  detects a platform admin.
- A trigger (`guard_platform_admin_write`) refuses any write that carries an end-user
  JWT, even if a grant is added by mistake.
- No client-callable `SECURITY DEFINER` function writes `platform_admins`. A
  pgTAP test enforces this.
- Every grant or removal is audited as `PLATFORM_ADMIN_GRANTED` /
  `PLATFORM_ADMIN_REVOKED` in the platform audit partition (organization NULL).
  That partition is included in audit checkpoints.
- There is no in-app management screen in Phase 0.

## Adding a platform admin (SQL only)

Run in the **Supabase dashboard → SQL editor** (or `psql` with the database
connection string). Both run as a database role with no user JWT.

1. The person must already have an account: invite them from
   **Authentication → Users → Invite**, or have them accept an organization invitation.
2. Run, replacing the email and reason:

```sql
begin;
select public.set_audit_reason('Grant platform admin to jane@example.org — approved by <approver>, <ticket/date>');
insert into public.platform_admins (user_id)
select id from auth.users where lower(email) = lower('jane@example.org')
returning user_id;   -- must return exactly ONE row; if none, the account doesn't exist → rollback;
commit;
```

## Removing a platform admin (SQL only)

```sql
begin;
select public.set_audit_reason('Remove platform admin jane@example.org — <reason>');
delete from public.platform_admins
where user_id = (select id from auth.users where lower(email) = lower('jane@example.org'))
returning user_id;   -- must return exactly ONE row
commit;
```

Keep at least two platform admins so there is a break-glass account. Removing
someone's platform-admin role doesn't touch their organization memberships.

## Reviewing

```sql
-- current platform admins
select u.email, pa.created_at from public.platform_admins pa join auth.users u on u.id = pa.user_id order by pa.created_at;

-- history (with reasons)
select occurred_at, action, entity_id, metadata ->> 'reason' as reason, metadata ->> 'db_user' as db_user
from public.audit_events where organization_id is null and action like 'PLATFORM_ADMIN_%' order by chain_pos;
```
