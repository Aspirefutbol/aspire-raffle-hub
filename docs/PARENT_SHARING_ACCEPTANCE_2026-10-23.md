# Parent sharing and Zod patch — isolated acceptance

October 23, 2026. Technical evidence only; not production or legal approval.

## Evidence identity

- Starting integration/staging source: `5838f4eabeeed70fff3716e5bd7c354a0cdf96b5`.
- Isolated source: `1d229ce6cdbbf677b20cf224cb0aca0858735855`, branch `feat/parent-sharing-safety-20261023`.
- Successful full run: `40032089458`; build/check job `120682658089`; database/browser job `120682658269`, completed 2026-10-23 22:21:09 UTC.
- Retained artifact: `12536285300`, `sharing-safety-evidence`, ZIP SHA-256 `abbe7b3ec375884e81ae3fb79ad8093a4d14721f3c8c1384d097749b0232afd0`.
- Downloaded ZIP digest matched. Embedded Playwright report metadata matched the exact source/run and reported **31 expected / 0 unexpected / 0 flaky / 0 skipped**, no report errors.
- Native-resolution phone and tablet sharing screenshots were inspected. Automated viewport coverage is 320, 360, 390, 768 and 1024 pixels, including button bounds and square QR images. This is not a claim of physical-device or Safari/Firefox acceptance, nor observed parent usability.

Both isolated jobs passed: unchanged production dependency audit, lint, types, unit tests, fresh full migrations, pgTAP, strict database lint, generated-type parity, database-backed unit/pricing tests, transaction concurrency suites, builds, browser journeys and final audit continuity. The isolated run has no hosted database/Netlify credentials and does not deploy.

## Promoted scope

Runtime, test and dependency files are copied by exact Git blob identities from that verified source. The temporary `verify-parent-sharing.yml` workflow and Zod preparation workflow are excluded. No integration workflow, database migration, financial rule, permissions or production setting is changed by this batch. Additional changes are this evidence note and a refreshed project handoff; the earlier handoff is preserved under `docs/history/`.

Copy link / Copy message are routine parent actions. Replacing or disabling a link requires confirmation under Link settings; cancel does not mutate the token. Tests cover double taps, denied clipboard access, response loss and recovery, old-link invalidation, preservation of requests/sales, QR decoding, scoped privacy and offline sale handoff. Raw links remain page-memory-only, not browser storage. A newly generated link intentionally invalidates old links and printed QR codes.

The exact Zod 4.6.7 pin and authentic npm lock entries come from reviewed isolated patch output `6c3d652e5ce4c38d97276bb092cba3772374d9b0`; see `ZOD_PATCH_2026-10-23.md`. The combined source passed the mandatory audit, not just the preparation run. A historical baseline audit pass does not supersede the subsequently surfaced advisory.

## Integration and hosted gates

At preparation time the new integration commit has not run CI or deployed. Require its exact full-SHA CI, then normal Hosted QA and actual Netlify deployment association. Keep the historical candidate documents as preparation records; this note supersedes their pending isolated-acceptance statements, but not the hosted gates. Confirm staging remains at 28 migrations with no new migration expected. Never promote based only on a deploy title, rewrite old ledgers, or use ad-hoc hosted SQL.

## October 24 controlled walkthrough

Only start the signed-in transaction walkthrough after the patched integration commit is verified on staging. Use existing authorized staging test accounts, a new clearly labeled TEST campaign and synthetic people/prizes/payment descriptions. Do not modify the October 20 DRAWN rehearsal and do not import real family data or accept money.

1. Administrator on computer: enter $20 single and five for $90; preview eleven tickets for $200; save and reopen; complete synthetic readiness and activate; verify prices are locked.
2. Parent on phone: locate the intended test player, create and copy a link, preview it signed out, cancel replacement and confirm the same link still works. A supporter request must not create a sale or issue tickets.
3. Authorized seller: record distinct synthetic purchases of five tickets/$90 and six tickets/$110; verify eleven unique tickets, receipts, correct player attribution and $200 sales total. Confirm link replacement/disable cannot be confused with Copy link.
4. Operator: reconcile the simulated cash/check turn-ins using normal money controls. Sales recorded are not proof money has been received by the club; expected/received/due should agree only after the separate custody steps.
5. Retain commit/deploy identity, device/browser details, screenshots without credentials or real data, observed confusion and pass/fail notes. Later observe 2–3 parents using synthetic data without coaching. Never mark a human walkthrough passed from these automated tests.

PR #2 remains DRAFT / UNMERGED. Production remains NO-GO. November 16 is conditional on separate technical, recovery, legal, prize, rules, operational-owner and release approvals.
