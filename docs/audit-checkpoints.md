# Raffle Hub — External Audit Checkpoints

The audit log (`audit_events`) is a SHA-256 hash chain per organization (plus a
platform partition for events with no organization, such as platform-admin
changes). The chain detects edits, but its head hash lives in the same database.
Someone with full database access could rewrite a whole chain consistently.

**Checkpoints anchor the chain head outside Supabase.** If a later chain no
longer contains a previously exported head at the same position, history was
rewritten.

## What a checkpoint contains

One JSON file per run (`audit-checkpoint-<env>-<timestamp>.json`) plus a
`.sha256` file:

| Field | Meaning |
|---|---|
| `format`, `format_version` | `raffle-hub.audit-checkpoint`, `1` |
| `environment` | `staging`, later `production` (`ci`/`local` for tests) |
| `generated_at` | UTC timestamp |
| `database_schema_version` | latest applied migration version |
| `app_commit` | git commit of the code that produced it |
| `source_host` | Supabase API host checked |
| `previous_checkpoint` | file name and SHA-256 of the checkpoint it was compared with (checkpoints form their own chain) |
| `verified` | `true` only if every partition verified |
| `partitions[]` | per organization (and `(platform)`): `organization_id`, `organization_name`, `organization_slug`, `verified`, `rows_checked`, `first_bad_position`, `last_chain_position`, `chain_head_hash`, `continuity` (`first-checkpoint`, `extends-previous`, `new`, `broken`, `unverifiable`) |
| `signature` | optional HMAC-SHA256 over the canonical JSON, if `AUDIT_CHECKPOINT_SIGNING_KEY` is set |

## How it runs

### Scheduled (staging)

`.github/workflows/audit-checkpoint.yml`, daily at 06:17 UTC and on demand
(**Actions → Audit checkpoint → Run workflow**). GitHub runs scheduled and
manual workflows from the default branch, so it activates once this work is
merged to `main`.

Each run:
1. downloads the newest checkpoint from the last successful run;
2. calls `audit_checkpoint_rows()` (service-role only), which re-verifies
   every chain with the same `verify_hash_chain` used by `verify_audit_chain`;
3. for each partition in the previous checkpoint, calls
   `audit_chain_hash_at(org, previous_last_position)` and requires it to equal
   the previous head;
4. writes a new checkpoint and uploads it as the artifact
   `audit-checkpoint-staging-<run_id>-<attempt>`. Artifacts are never
   overwritten; the run is red if anything fails, and the checkpoint is still
   uploaded as evidence.

Configuration, in the GitHub `staging` environment:
- variable `STAGING_SUPABASE_URL`;
- secret `STAGING_SUPABASE_SECRET_KEY` (service-role/secret key; it only lives in GitHub);
- optional secret `AUDIT_CHECKPOINT_SIGNING_KEY`.

**Retention:** GitHub keeps these artifacts for **90 days** (the workflow sets
`retention-days: 90`, the maximum for this repository). For longer retention,
download artifacts periodically to separate storage the organization controls
(for example a folder with retention lock). Never keep the only copy in
Supabase Storage.

> The repository is currently public, so its artifacts are readable by any
> signed-in GitHub user. Checkpoints contain organization names/slugs and
> hashes, but no personal data. Make the repository private before production.

### Manual

```bash
# local stack (reads .env.local: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY)
npm run audit:checkpoint

# against staging from a trusted machine (never in a browser)
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=<secret> \
  AUDIT_ENVIRONMENT=staging npm run audit:checkpoint -- --out ./audit-checkpoints
```

Options: `--out <dir>` (default `audit-checkpoints/`, git-ignored),
`--previous <file>` (default: newest checkpoint for the same environment in
`--out`), `--environment <name>`.

Exit codes:
- `0`: all chains verified, and they extend the previous checkpoint.
- `1`: configuration or database connection error (no file written).
- `2`: a chain failed verification, or events exist with no head hash.
- `3`: continuity broken. A previous head is no longer at its position, a chain shrank, or a partition disappeared.

CI runs the script twice against the local stack on every PR, so the second run
checks continuity.

## Comparing a chain head with an earlier checkpoint

Given any older checkpoint file (from an artifact or your archive):

```bash
npm run audit:checkpoint -- --previous path/to/older-checkpoint.json
```

Or by hand in the SQL editor, for one partition:

```sql
select public.audit_chain_hash_at('<organization_id>', <last_chain_position>);
-- must equal chain_head_hash from the checkpoint
```

Check a file's integrity with `sha256sum -c <file>.sha256`. If signed,
re-compute the HMAC over the canonical JSON without `signature`
(`verifySignature()` in `scripts/lib/audit-checkpoint-core.mjs`).

## If verification fails

1. **Don't change anything.** Leave the data as it is, and don't "repair" the chain.
2. Keep the failing checkpoint artifact and the last good one. Download both now; artifacts expire.
3. Find the first bad row: `first_bad_position` in the checkpoint, or
   `select * from public.verify_audit_chain('<organization_id>')` as an Auditor/Admin.
4. Review database access around that time: Supabase dashboard logs, who holds
   the database password and service key, and recent migrations.
5. Rotate the service-role key and database password if any compromise is possible.
6. Tell the organization's Director(s). Record the incident and what was checked.
7. If the cause was a legitimate maintenance mistake, document it. The broken
   chain stays as evidence; new events keep chaining from the current head.
