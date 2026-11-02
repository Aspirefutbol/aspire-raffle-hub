# Raffle Hub Project State

_Current execution checkpoint: October 23, 2026. PR #2 remains DRAFT / UNMERGED; production remains NO-GO._

## Source of truth and boundaries

- Repository: `Aspirefutbol/aspire-raffle-hub`.
- Integration branch: `feat/phase-1-fundraising-slice`. Read its actual remote HEAD before every write; never infer a deploy from a source commit.
- Last independently verified hosted baseline before package promotion: `4226f50e224ed6d0392c93d122dc01b8c862116d`; CI `39972249757` and Hosted QA `39972249766` passed; Netlify staging deploy `6adb75078025eeec5effa568`.
- Staging: `https://aspire-raffle-hub-staging.netlify.app`, Supabase `ixhpidqhqzbpfbklofrs`. Before promotion, 27 migrations through `20261023144018_hash_chain_typed_verifier`.
- Production Supabase: `bsjjzewifpbngbasdvew`. Do not use it for development, verification, or synthetic fixtures.
- Working agreement: PR #2 comment `6367755325`. Routine approved implementation and synthetic verification require no repeated approval. Production, merge, live data, destructive operations, new spending and changed business policies remain separately gated.

## Delivered candidate: Ticket Pricing & Packages

The end-to-end package candidate completed isolated verification run `40013681811` on input commit `bf69740866c70f99af89b090c468f895fc1d016d`. Its validated materialized source was committed by the runner to `f9e5b95ac6fae2b9cbf82a1b1f5f67f541716beb` on `feat/ticket-packages-20261023`. The output commit is associated with that successful parent run; it is not a separate CI pass.

Verified in disposable local infrastructure: production dependency audit, fresh migrations, strict database lint, full pgTAP, generated types, lint/typecheck/unit tests including 2,000 SQL/client price comparisons, existing and package concurrency suites, application build, **30/30 browser journeys with no flaky or skipped tests**, and final audit continuity.

The integration source batch promotes the verified application/schema/test files and package concurrency gate. It also updates two operator Learning Hub articles and adds a content regression test; these help-text changes were not part of the isolated browser run and must pass the new exact-commit integration CI.

New migration: `20261023181600_ticket_pricing_packages.sql`; SHA-256 `7e1f6cfb398d6367943ed3aa6c98b4175fef118633ee709ad4342b8d034c49d5`. See [package acceptance evidence and architecture delta](TICKET_PACKAGE_ACCEPTANCE_2026-10-23.md).

## Next executable action

1. Read this integration commit's actual CI and Hosted QA results, including push-triggered runs. Resolve failures rather than promoting around them.
2. Hosted QA may apply the tracked package migration and deploy only after exact-commit CI passes under the established staging gates. Do not perform ad-hoc hosted SQL.
3. Verify the resulting staging migration history, exact deployment association and hosted smoke. Then conduct the package/mobile operator walkthrough using synthetic data only.
4. Complete parent usability and production infrastructure/recovery, legal, prize, rules and operating-owner approvals before any live raffle.

**At the time this source batch is prepared, package integration CI and package hosted deployment have not yet run. Do not read the isolated pass as a hosted or production release.** Record subsequent evidence with exact run/deploy IDs in PR #2 before claiming a changed hosted state.

## Approved business rules and deferred scope

- November 16, 2026 is a conditional launch target.
- Aspire example: $20 single / $90 for five; repeated packages and remaining singles within one sale. Never combine buyers or previous sales for a discount.
- Prices and package disclosures lock at activation. Historic sales/snapshots are not rewritten.
- Offline cash/check only. Public supporter links accept nonbinding interest only: no checkout, reservation, ticket issuance or automatic sale.
- Physical/external drawing, no in-app random winner generator. Each valid issued ticket remains one drawing entry.
- Preserve tenant/family/captain scope, caller-bound retries, immutable financial/audit ledgers, inventory limits and separate money custody.
- Prizes remain placeholders until approved. Do not publish them as final claims.
- No Aspire One/Studio work, other fundraiser types, marketplace, boost engine, sponsorship CRM or unrelated expansion in this repository.

## Historical evidence

The previous full project record, including the accepted October 20 operator rehearsal, is retained unchanged at [historical project state](history/PROJECT_STATE_2026-10-23_BEFORE_PACKAGE_PROMOTION.md). Its old next-action dates are not current instructions. Read `AGENTS.md`, `docs/architecture.md`, the package architecture delta, existing money/drawing operations guides, and the production go-live runbook together.
