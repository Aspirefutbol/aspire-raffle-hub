# Frozen drawing and physical/external certification

The Aspire pilot uses a physical or externally conducted drawing. The application
does not generate a random winner. It freezes the eligible population, produces
verifiable exports, records the external result, and preserves Director
certification and the existing campaign lifecycle.

## Operator sequence

1. Configure and review the qualifying operator, legal address, jurisdiction,
   approved rules/prizes, ticket price, support contact and sales/drawing dates
   before activation. The approved rules/prize descriptions must be in the
   campaign's locked `rules_text`. The software's readiness check does not
   establish legal eligibility or replace the operator's compliance review.
2. Complete all sale corrections and replacement issuance while the campaign
   is ACTIVE and the sales window is open. Then close sales through the existing
   lifecycle. Closing or freezing does not prove that Aspire received the money.
3. Open the campaign's **Drawing** screen. Resolve blocking integrity/disclosure
   issues, review eligible count/value and warnings, and confirm prize and
   physical/external drawing readiness. Freeze with a reason.
4. Retain the snapshot ID/version, timestamp and manifest SHA-256 separately from
   the export. An authorized exporter downloads the exact CSV and JSON manifest;
   retain both in the approved private drawing-record location.
5. If an eligible ticket must be voided before the actual drawing, a Director
   explicitly reopens the snapshot with a reason. The campaign remains CLOSED.
   Existing authorization still governs voids; reopening does not permit new
   sales or late replacement issuance. Freeze a new version and export again.
   Never use the superseded population for the drawing.
6. Conduct the approved physical/external drawing from the current frozen
   population. Record actual date/time, location, operator, witness names,
   physical/external method, winning ticket number, result/prize description,
   reason and optional evidence reference. The actual time must follow both
   the freeze and disclosed drawing date and cannot be in the future.
7. A Director reviews the evidence and certifies the results. Certification
   records the user/time, snapshot hash and ordered result hashes. Then use the
   existing guarded lifecycle action to mark the campaign DRAWN.
8. Complete financial reconciliation and final audit verification separately.
   A returned check or unresolved turn-in never silently removes a drawn entry.

Once any external result is recorded, reopening that population is blocked.
Certification seals the immutable result set. Verify winning numbers and
evidence before recording; post-drawing disputes require the operator's approved
incident process and must not silently alter the pool or historical result.

## Existing permission boundaries

| Operation | Required permission |
| --- | --- |
| Read drawing readiness/history or verify a snapshot | `campaigns.read` |
| Freeze and record external results | `drawing.manage` |
| Reopen before external evidence or certify results | `drawing.certify` |
| Download buyer-containing snapshot | `exports.run` plus existing organization-wide buyer authority (`organization.manage`, `reconciliation.manage`, `adjustments.approve`, or `audit.read`) |
| Finalize CLOSED → DRAWN | Existing `campaigns.activate` plus `drawing.certify`, verified current snapshot and audited certification |

No role grants change. A Campaign Manager can prepare the population and record
the externally observed ticket number without reading private buyer exports.
Family and Captain roles receive no organization-wide drawing/buyer access.
The same person may hold existing administration and Director permissions.

## Evidence and independent verification

`drawing_snapshots`, `drawing_snapshot_entries`, `drawing_events`, and
`drawing_results` are immutable/append-only. Snapshot entries include exact ticket
numbers, buyer details necessary for the drawing, player/team attribution and
issue/value facts. The protected CSV excludes household details and private sale
notes. Spreadsheet formula inputs are neutralized only in CSV; original values
remain in the canonical JSON evidence.

The JSON download includes PostgreSQL-generated canonical strings, avoiding
differences in JSON ordering, spacing and timestamp formatting across tools:

1. SHA-256 of each UTF-8 `entry_payload_canonical` must equal its `entry_hash`.
2. Concatenate the fixed-length entry hashes in sequence/ticket order and hash
   that string; it must equal the manifest's `entries_hash`.
3. Hash UTF-8 `manifest_canonical`; it must equal the separately retained freeze
   hash. Count, unique identities, snapshot binding and face value must match.

Verify a downloaded JSON file with a supported Node version:

```sh
node scripts/verify-drawing-export.mjs /path/to/manifest.json RETAINED_FREEZE_SHA256
```

The CSV file checksum and canonical manifest hash are different values. Export
generation records the actual file checksum and caller; it does not claim the
recipient opened or received the file. Downloads use the current user's session,
complete pagination, private/no-store responses and an explicit POST.

Database verification also checks original trigger-written snapshot/result
audit receipts, all existing hash chains and captured source ledger positions.
Subsequent legitimate financial events extend those chains without invalidating
the captured prefixes. Export verification alone does not prove external
checkpoint continuity; final operators must verify both.

## Transaction and regression coverage

The drawing RPCs share the existing campaign lock, use caller-bound keys and
payload fingerprints, and reject conflicting retries. Frozen-table triggers
block ticket-changing reversals; previously committed sale/reversal/result
retries return the original facts. Superseded snapshots and their exact exported
population remain retained.

Run the full application/database/browser regression gates before pushing.
Additional real-session coverage is `npm run test:drawing-concurrency`, against
disposable loopback fixtures only. Reset/reseed the local stack afterward before
the complete browser suite; never run these fixture scripts or a reset on the
hosted staging project.
