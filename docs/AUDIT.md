# Raffle Hub — Audit Trail

How Raffle Hub records administrative changes. The platform will handle money and raffle tickets, and the blueprint requires that "every financial/ticket mutation has actor, timestamp, old state, new state and reason" (§40.5) and that the audit log be append-only (§23). Phase 1 builds that foundation for the roster, imports, roles and organization settings.

Source of truth: `supabase/migrations/*.sql`. Tests: `supabase/tests/rls_and_roster.test.sql`.

## 1. Principles

1. **Written by the database, not the app.** Events come from Postgres triggers on the audited tables. Any write path is audited automatically: the UI, a server action, an RPC function, or a future integration. App code never inserts audit rows (see `AGENTS.md`).
2. **Append-only.** No one using the app can edit or delete an audit event. A trigger blocks `UPDATE` and `DELETE` even for privileged database roles.
3. **Attributable.** Each event records the authenticated user who made the change (`auth.uid()`) and a server-generated timestamp.
4. **Before and after.** Updates store the full row before and after, plus the list of changed fields.
5. **Tenant-scoped.** Every event carries the `organization_id` it belongs to. Users can only read events for organizations where they hold `audit.read`.

## 2. The `audit_events` table

| Column | Type | Meaning |
|---|---|---|
| `id` | uuid | Primary key |
| `organization_id` | uuid | Tenant the event belongs to (`ON DELETE RESTRICT`: an organization with audit history can't be deleted) |
| `actor_id` | uuid, nullable | User who made the change. `NULL` means a system or service-role write, such as the dev seed script. Shown as "System". |
| `action` | text | Event code, e.g. `PLAYER_TEAM_CHANGED` (uppercase snake case, enforced by a CHECK) |
| `entity_type` | text | Table of the affected record, e.g. `players` |
| `entity_id` | uuid | ID of the affected record |
| `before_data` | jsonb | Row before the change (updates) |
| `after_data` | jsonb | Row after the change (inserts and updates) |
| `changed_fields` | text[] | Columns that changed. `updated_at` and `updated_by` are ignored. |
| `metadata` | jsonb | Event-specific context, e.g. `import_id`, `from_team_id`/`to_team_id`, `user_id` |
| `occurred_at` | timestamptz | Server time (UTC). Displayed in the organization's time zone. |

Indexes: `(organization_id, occurred_at desc)` for the activity log, and `(entity_type, entity_id, occurred_at desc)` for a single record's history, such as the player profile's Activity card.

## 3. Events recorded

### Generic row events

The trigger function `audit_row_change(prefix)` runs after insert or update on each table below. It emits `<PREFIX>_<VERB>`:

| Verb | When |
|---|---|
| `CREATED` | Row inserted |
| `IMPORTED` | Row inserted during an import (see §5) |
| `UPDATED` | Row changed, other than archive/restore |
| `ARCHIVED` | `archived_at` went from empty to set |
| `RESTORED` | `archived_at` went from set to empty |

Updates that change nothing except `updated_at`/`updated_by` are not logged.

| Table | Prefix | Example events |
|---|---|---|
| `organizations` | `ORGANIZATION` | `ORGANIZATION_UPDATED` |
| `seasons` | `SEASON` | `SEASON_CREATED`, `SEASON_UPDATED` (including a current-season change) |
| `teams` | `TEAM` | `TEAM_CREATED`, `TEAM_UPDATED`, `TEAM_ARCHIVED`, `TEAM_RESTORED` |
| `households` | `HOUSEHOLD` | `HOUSEHOLD_CREATED`, `HOUSEHOLD_IMPORTED`, `HOUSEHOLD_ARCHIVED` |
| `guardians` | `GUARDIAN` | `GUARDIAN_CREATED`, `GUARDIAN_IMPORTED`, `GUARDIAN_UPDATED`, `GUARDIAN_ARCHIVED` |
| `players` | `PLAYER` | `PLAYER_CREATED`, `PLAYER_IMPORTED`, `PLAYER_UPDATED`, `PLAYER_ARCHIVED`, `PLAYER_RESTORED` |
| `campaigns` | `CAMPAIGN` | Schema only in Phase 1; no UI writes yet |
| `campaign_participants` | `CAMPAIGN_PARTICIPANT` | Schema only in Phase 1; no UI writes yet |

### Purpose-built events

| Action | Source | Recorded on | Metadata |
|---|---|---|---|
| `PLAYER_TEAM_CHANGED` | `team_memberships` trigger: a new current membership, or a current one ended because the player was removed or archived | `players` / player id | `from_team_id`, `to_team_id`, `import_id` or `reason` |
| `PLAYER_GUARDIAN_LINKED` / `_UNLINKED` / `_UPDATED` | `player_guardians` trigger | `players` / player id | `guardian_id`, `relationship`, `is_primary` |
| `IMPORT_STARTED` | `imports` insert | `imports` / import id | `file_name`, `row_count` |
| `IMPORT_COMPLETED` / `IMPORT_CANCELLED` | `imports` status change | `imports` / import id | `file_name`, `row_count`, `summary` (created, linked, matched, skipped, households, guardians) |
| `MEMBER_ADDED` | `organization_members` insert | `organization_members` / member id | `user_id`; after: `role_key`, `status` |
| `ROLE_CHANGED` | `organization_members.role_key` change | `organization_members` / member id | `user_id`; before/after `role_key` |
| `MEMBER_STATUS_CHANGED` | `organization_members.status` change | `organization_members` / member id | `user_id`; before/after `status` |

These cover every event the Phase 1 brief names: `PLAYER_CREATED`, `PLAYER_UPDATED`, `PLAYER_ARCHIVED`, `PLAYER_IMPORTED`, `PLAYER_TEAM_CHANGED`, `IMPORT_COMPLETED` and `ROLE_CHANGED`.

## 4. Enforcement

| Guarantee | How |
|---|---|
| Clients can't write events | RLS has no insert/update/delete policy, and `INSERT/UPDATE/DELETE` is revoked from `anon` and `authenticated`. Only `SECURITY DEFINER` trigger functions insert. |
| Events can't be changed or removed | The `audit_events_append_only` trigger raises `insufficient_privilege` on any `UPDATE` or `DELETE`, including from the service role. |
| Events can't be skipped | They are triggers on the data tables, in the same transaction as the change. If the change rolls back, so does its event, and the other way round. |
| Actor can't be spoofed | `actor_id` comes from `auth.uid()` (the verified JWT), never from request input. |
| History survives deletions | Roster and fundraising rows are archived, not deleted (clients have no `DELETE` grant; campaigns block it with a trigger). If a user account is deleted, `actor_id` becomes `NULL` but the event stays. |
| Only authorized readers | The select policy requires `has_org_permission(organization_id, 'audit.read')`: Organization Admin, Auditor, or Super Admin. |

Verified by pgTAP tests: clients can't insert or delete audit events; `PLAYER_CREATED`, `PLAYER_TEAM_CHANGED`, `PLAYER_ARCHIVED` and `PLAYER_IMPORTED` are written by the corresponding operations.

## 5. Imports

`commit_player_import` sets the transaction-local setting `raffle_hub.import_id` before writing. While it is set:
- inserts emit `*_IMPORTED` instead of `*_CREATED`;
- events carry `metadata.import_id`, so every record an import touched can be traced back to it. The activity log shows these as "via import".

The setting is transaction-scoped (`set_config(..., true)`), so it can't leak into later requests.

## 6. Where to see it

- **Settings → Activity log** (`/o/[orgSlug]/settings/activity`): every event for the organization, newest first, filterable by category (players, teams, households, guardians, imports, members and roles, organization), with actor names and links to the record.
- **Player profile → Activity**: the 25 most recent events for that player, including team changes shown as "U13 Boys → U14 Boys".

Both require `audit.read`. Labels come from `lib/audit/describe.ts`.

## 7. Not audited yet (known gaps)

| Gap | Why / plan |
|---|---|
| Deletes on the few deletable tables: saved `import_mappings` and `player_duplicate_dismissals` | Low-risk configuration rows; add triggers if needed. Unlinking a guardian is audited. |
| Per-row edits inside an unfinished import (`import_rows`) | Staging data. The import's final outcome is audited, and every record it creates is audited individually. |
| Reads and exports | The blueprint requires "log export event" (§23). Add an `EXPORT_*` event when exports ship. |
| Sign-ins and failed sign-ins | Supabase Auth keeps its own auth audit log. Mirroring it into `audit_events` is a later decision. |
| "Reason" on sensitive actions | The blueprint requires a reason for voids, draw lock/unlock and write-offs. Add a `reason` value (via a transaction-local setting like `raffle_hub.reason`, or an explicit RPC parameter) when those actions exist. |
| Tamper evidence beyond append-only | A database superuser could disable triggers. The blueprint's `beforeHash/afterHash` (§19) and draw-snapshot hashing (§14) are planned for the ticket and drawing phases, e.g. a hash chain over events plus periodic signed exports. |

## 8. Extending to money and tickets (later phases)

The same model carries forward:
- **Tickets:** trigger events like `TICKET_ISSUED`, `TICKET_VOIDED` (reason required) and `TICKET_REISSUED`, linked to the replacement ticket. Sold tickets are never edited destructively (blueprint §3).
- **Reconciliation:** `TURN_IN_RECORDED`, `ADJUSTMENT_CREATED` (reason required), `PAYMENT_EXCEPTION_OPENED`/`RESOLVED`, `WRITE_OFF_APPROVED` (director approval).
- **Drawing:** `DRAW_POOL_LOCKED` (with pool hash), `DRAW_UNLOCKED` (privileged, reason required), `WINNER_RECORDED`, `WINNER_CERTIFIED` (two-person).
- **Exports:** `EXPORT_GENERATED`, with export type and row count.

New tables attach `audit_row_change('<PREFIX>')` or a purpose-built trigger in their migration, and get a pgTAP test proving the event is written.
