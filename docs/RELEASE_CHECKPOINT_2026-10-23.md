# Release checkpoint — 2026-10-23

**NO-GO for production. PR #2 remains DRAFT and UNMERGED.**

This checkpoint supersedes older statements that current-commit CI could not be inspected. It is not a replacement for the go-live runbook or legal/operational approval.

## Actual CI evidence recovered

The previous connector wrapper filtered workflow runs to pull-request events. This branch's relevant runs were triggered by pushes. Use the repository Actions runs endpoint with the full `head_sha`, without a pull-request event filter.

For `55994e1b5dac1663953cd24feb7e6c0aa0b79bcd`:

- CI run: https://github.com/Aspirefutbol/aspire-raffle-hub/actions/runs/39894477913 — FAILED.
- Hosted QA run: https://github.com/Aspirefutbol/aspire-raffle-hub/actions/runs/39894477914 — FAILED at the full-CI gate; migrations, deployment and hosted smoke were skipped.
- Checks job `120221597146`: production dependency audit stopped on a critical Next.js finding with installed version 16.3.8.
- Database job `120221597323`: fresh migrations, 924 pgTAP assertions, generated-types parity, 171 unit tests, concurrency suites and audit continuity passed; build failed with TS2345 in `lib/fundraising/package-pricing.test.ts`. Browser E2E did not run.
- Do not label database lint clean: despite its successful process exit, its output includes an ERROR-level `public.verify_hash_chain` diagnostic (`record "rec" is not assigned yet`). Investigate and resolve or justify with retained evidence before release. Runtime audit checks passing do not erase this diagnostic.

## Repairs completed on the feature branch

`a3af4db53861b854b929a096aea3db39a1a1a876`:

- Fixed the pricing test's tuple inference under strict indexed access.
- Expanded pricing coverage to 14 scenarios, including all 1–500 supported ticket quantities, exact bundle breakdowns, malformed configurations, input immutability and overflow alternatives.
- Added `quoteTicketPackages`, with exact integer-cent totals, an explicit bundle breakdown, and deterministic tie handling.
- Preserved the existing total-only helper. No sales/database integration was enabled.

A temporary branch-only dependency repair job regenerated and validated the lockfile on a networked GitHub runner. It had no production environment or database credentials and did not run migrations, deployment, or merge operations.

Repair evidence: https://github.com/Aspirefutbol/aspire-raffle-hub/actions/runs/39968469998 — SUCCESS.

The repair job passed production dependency audit (`--omit=dev --audit-level=high`), lint, typecheck, unit tests, and application build with localhost placeholder configuration. Database-dependent tests and browser E2E are not certified by that job.

Dependency commit: `980da6b9e2daf450759d8c30ed8e046c387fa636`.

Only `package.json` and `package-lock.json` changed in that commit: Next.js and eslint-config-next are now pinned to 16.4.2. No audit rule was relaxed. The temporary write-enabled repair workflow is removed in the commit containing this record.

## Browser-test maintenance in this checkpoint

Update the exact family sale and sharing button selectors to the parent-facing wording already committed. Scope the campaign heading separately from the new three-step help heading. Strengthen captain negative assertions to reject both old and new sale-button names and resume controls. Preserve transaction amounts, ticket counts, receipt checks, reversals, privacy, touch-target and ledger assertions.

These selector edits require a fresh complete CI run on the cleanup commit; they have not yet been validated by a browser at the time this record is written.

## Remaining work and protected boundaries

1. Obtain fresh exact-commit full CI, including database/catalog, concurrency, build and browser E2E, then Hosted QA deployment and smoke evidence. A successful repair-only build is insufficient.
2. Investigate the database lint diagnostic above and make the lint gate fail closed for genuine errors.
3. Build campaign package configuration, enforce approved pricing and price locks in the database, then connect authorized sales, receipts, corrections, sharing disclosures and reconciliation. The $20 single / $90 five-ticket calculator is NOT yet a live sales feature.
4. Complete parent usability testing and production infrastructure, recovery, legal and operating-owner sign-offs.

Staging migration history was read during this pass: 26 migrations through `20261020202500_ticket_prize_receipt_fallback`. No hosted database migration or data mutation was performed in this pass. Do not infer any new published staging application from these source commits.

Keep the November 16 target conditional. Do not merge, deploy production, introduce live family/money data, or bypass a release gate without explicit authorization.
