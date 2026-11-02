# Raffle Hub Project State

_Current execution checkpoint: October 23, 2026, parent-sharing/security-patch promotion. PR #2 remains DRAFT / UNMERGED; production remains NO-GO._

## Source of truth and boundaries

- Repository: `Aspirefutbol/aspire-raffle-hub`; integration branch `feat/phase-1-fundraising-slice`. Read the actual remote HEAD and exact-head workflow results before every write. Source, tests and deployment are separate facts.
- Last independently verified hosted package baseline: `5838f4eabeeed70fff3716e5bd7c354a0cdf96b5`; CI `40015995052`, Hosted QA `40015994976`, hosted job `120628071960`, Netlify staging deploy `6adbbf6973e808ea2cd756f3`. Its later-discovered Zod advisory means the historical audit pass is not current security clearance.
- Staging: `https://aspire-raffle-hub-staging.netlify.app`; Netlify site `6da8219b-6bb1-4029-bd4a-a71e7d6eb4c1`; Supabase `ixhpidqhqzbpfbklofrs`. Independently rechecked: 28 migrations through `20261023181600_ticket_pricing_packages`.
- Production Supabase: `bsjjzewifpbngbasdvew`. Do not use production for development, verification or synthetic fixtures.
- Working agreement: PR #2 comment `6367755325`. Routine approved implementation and synthetic verification need no repeated approval. Production, main merge, live data, destructive actions, spending and changed business rules remain separately gated.

## Completed package milestone

The package feature passed isolated run `40013681811`, then exact integration CI and hosted deployment on `5838f4ea`. Hosted evidence is recorded in PR #2 comment `6374130083`: checkout/build/deploy log ties the exact source to the published Netlify ID; 28 migrations; hosted pure-price checks passed all quantities 1–500; the prior synthetic DRAWN rehearsal and hash chains remained intact. This is not a signed-in hosted package-journey pass.

Migration `20261023181600_ticket_pricing_packages.sql`, SHA-256 `7e1f6cfb398d6367943ed3aa6c98b4175fef118633ee709ad4342b8d034c49d5`, is already deployed to staging. See [package architecture and acceptance](TICKET_PACKAGE_ACCEPTANCE_2026-10-23.md). No migration is added by the current sharing/security batch.

## Current source promotion: parent sharing + security patch

Isolated source `1d229ce6cdbbf677b20cf224cb0aca0858735855` passed full run `40032089458`, including final audit and **31/31 browser tests with no flaky or skipped tests**. Artifact `12536285300` digest and report source/run identity were checked; phone/tablet screenshots were inspected. See [accepted source and October 24 walkthrough](PARENT_SHARING_ACCEPTANCE_2026-10-23.md).

The promotion copies the verified seller-tools UI, sharing tests, exact Zod 4.6.7 package/lock files and preparation notes. Temporary isolated workflows are excluded; existing integration CI/Hosted QA are unchanged. Backend permissions, pricing rules and schema remain unchanged. Earlier preparation notes are historical; the acceptance note records their completed isolated gates.

**At this source batch's preparation time, fresh integration CI and patched hosted deployment are NOT YET VERIFIED.** A passed isolated run is not a deployed fix. Record subsequent full SHA/run/deploy results in PR #2 before claiming a new hosted baseline. No unattended development is implied by monitoring.

## Next executable actions

1. Inspect the current integration head's CI and Hosted QA, including push-triggered runs. Keep the dependency audit and all database/browser gates intact. Investigate failures; do not deploy around them.
2. After exact-head CI passes, allow only the established gated staging workflow. Verify checkout-to-deploy association, hosted smoke and unchanged migration history. No ad-hoc hosted SQL or production access.
3. For the planned Saturday, October 24 walkthrough, use existing authorized test accounts and a NEW clearly labeled synthetic campaign. Follow the acceptance note: package setup/locks, phone sharing, five/$90 and six/$110, eleven unique tickets, $200 sales, then separate simulated custody reconciliation. Leave the accepted October 20 DRAWN rehearsal untouched.
4. The authenticated hosted walkthrough and observation of 2–3 parents using synthetic data remain outstanding. Automated viewport tests are not physical-device/cross-browser certification or human usability acceptance.
5. Complete production infrastructure/recovery, legal entity, prizes, official rules, operating owners and explicit release approval before live enrollment or money.

## Approved business rules and deferred scope

- November 16, 2026 is a conditional launch target.
- Aspire offer: $20 single / $90 for five; repeated packages plus remaining singles within one sale. Never combine buyers or earlier transactions for a discount.
- Prices and package disclosures lock at activation. Historic sales/snapshots are not rewritten.
- Offline cash/check only. Public links accept nonbinding interest, not checkout, reservation, ticket issuance or automatic sales.
- Physical/external drawing; no in-app random winner generator. Each eligible issued ticket is one entry.
- Preserve tenant/family/captain scope, caller-bound retries, immutable financial/audit history, stock controls and separate money custody.
- Prizes remain placeholders until approved. Do not publish them as final claims.
- No Aspire One/Studio work or unrelated fundraiser expansion in this repository.

## Historical evidence

The full earlier project record remains unchanged in [pre-package history](history/PROJECT_STATE_2026-10-23_BEFORE_PACKAGE_PROMOTION.md). The handoff immediately before this batch is retained in [pre-sharing history](history/PROJECT_STATE_2026-10-23_BEFORE_SHARING_PROMOTION.md). Historical next-action dates are not current instructions. Read `AGENTS.md`, architecture, package delta, money/drawing operations and the go-live runbook together.
