# Aspire Raffle Hub — Production Go-Live Runbook

_Last updated: 2026-10-20_

## Purpose

This runbook is the final operational gate between a successful hosted staging rehearsal and any live Aspire raffle involving real families, real tickets, or real money.

The staging product path is accepted. This document does **not** itself authorize a live raffle. Legal/compliance approval and explicit production approval remain required.

## Current baseline

- PR #2 remains draft and unmerged.
- Hosted operator rehearsal: PASS.
- Full CI: PASS on the current accepted staging baseline.
- Texas pilot mode remains offline cash/check only.
- No public online raffle payment, public ticket reservation, or automatic sale creation is permitted.
- Drawing remains physical/external; the application records and verifies evidence but does not randomly select the winner.

## Gate 1 — Legal and raffle authority

Owner: Aspire leadership + appropriate legal/compliance reviewer

Do not proceed to live operation until all are explicitly approved:

- [ ] Legal entity authorized to operate the raffle is confirmed.
- [ ] Texas raffle eligibility/authority is confirmed for the planned campaign.
- [ ] Official rules are approved.
- [ ] Prize descriptions, sources, values, possession/bond evidence, and any required disclosures are approved.
- [ ] Ticket price, numbering, delivery method, and permitted payment methods are approved.
- [ ] Sales opening/closing dates and drawing date/procedure are approved.
- [ ] Required records, retention periods, operator responsibilities, and winner documentation are approved.

Evidence to retain:

- approval date
- approver/reviewer
- approved rules version
- approved prize/disclosure package
- any external legal/compliance memo or written approval

## Gate 2 — Production infrastructure

Owner: production administrator

Before production bootstrap:

- [ ] Production Supabase project is the intended project.
- [ ] Production Netlify site is the intended site.
- [ ] Production domain is confirmed.
- [ ] Production support email/from-address is confirmed.
- [ ] Production secrets are present only in approved secret stores.
- [ ] No staging keys or test credentials are present in production.
- [ ] Supabase backup/PITR policy is confirmed.
- [ ] Monitoring and alert ownership are confirmed.
- [ ] Production access is limited to required operators.
- [ ] Leaked-password protection and hardened function ACL posture remain enabled.
- [ ] Production environment protection/approval is enabled for the manual bootstrap workflow.

Do not paste production secrets into tickets, docs, chat logs, commits, or screenshots.

## Gate 3 — Database bootstrap

Owner: production administrator

Use the manual GitHub Actions workflow:

`.github/workflows/production-bootstrap.yml`

The workflow is intentionally manual and must remain protected.

Before running:

- [ ] Current branch/commit is explicitly approved for production.
- [ ] CI for that exact commit is green.
- [ ] Pending migration list has been reviewed.
- [ ] No seed/reset/test-fixture operation is included.
- [ ] A recovery/rollback decision owner is present.

Run the workflow only after the production environment approval is granted.

After running, retain:

- workflow run ID
- deployed commit SHA
- migration list before/after
- database lint result
- date/time
- operator name

If migration history, lint, or project identity is unexpected, stop. Do not attempt ad-hoc database repair during the launch window.

## Gate 4 — Production application smoke

Owner: production administrator + operator

Use synthetic records only for this smoke.

Verify:

- [ ] Authorized admin can sign in.
- [ ] Organization legal/settings page loads.
- [ ] Campaign list loads.
- [ ] Draft campaign can be created with synthetic data.
- [ ] Structured prize record can be added.
- [ ] Compliance readiness accurately reports missing requirements.
- [ ] Family/captain boundaries are preserved.
- [ ] Seller Sharing remains request-only.
- [ ] No public online raffle checkout exists.
- [ ] Ticket receipt uses structured prize disclosure.
- [ ] Money and drawing pages load for authorized roles.
- [ ] Audit/security checks remain healthy.

Delete or clearly archive synthetic launch-smoke records only through supported application workflows. Do not directly delete immutable operational history.

## Gate 5 — Cash/check custody operations

Owner: Aspire leadership must assign named operational owners

Before first live sale, decide and document:

- [ ] Who may physically receive cash.
- [ ] Who may physically receive checks.
- [ ] How often sellers/teams must turn in funds.
- [ ] Who records each turn-in.
- [ ] Who independently verifies received amounts.
- [ ] Where cash/checks are stored before deposit.
- [ ] Who makes bank deposits.
- [ ] Where deposit evidence is retained.
- [ ] Who resolves differences between expected and received funds.
- [ ] Who owns returned-check follow-up.

Minimum principle: the person recording a money event should not silently rewrite or erase the original transaction. Corrections use the existing append-only workflows.

## Gate 6 — Drawing and evidence operations

Owner: Aspire leadership must assign a drawing operator and evidence custodian

Before sales open:

- [ ] Drawing method is approved and documented.
- [ ] Drawing date/time/location are fixed.
- [ ] Required witnesses are identified.
- [ ] Evidence-retention location is identified.
- [ ] Authorized freeze/export operator is identified.
- [ ] Authorized result recorder is identified.
- [ ] Authorized Director certifier is identified.

At drawing:

1. Close sales.
2. Verify no post-close sales are accepted.
3. Reconcile known ticket/sales issues.
4. Freeze the eligible population.
5. Verify snapshot integrity.
6. Export the current frozen population.
7. Retain export checksum/hash evidence.
8. Conduct the approved physical/external drawing.
9. Record actual result, time, location, operator, witnesses, and evidence reference.
10. Director certifies the current snapshot/results.
11. Transition to DRAWN only after certification.

Never alter the frozen population to make a result fit.

## Gate 7 — Final pre-launch GO / NO-GO

A live Aspire raffle is GO only when every answer below is YES:

- [ ] Legal/raffle authority approved.
- [ ] Official rules/prizes/disclosures approved.
- [ ] Production infrastructure reviewed.
- [ ] Production migration/bootstrap completed cleanly.
- [ ] Production synthetic smoke passed.
- [ ] Cash/check custody owners assigned.
- [ ] Deposit-evidence process assigned.
- [ ] Returned-check owner assigned.
- [ ] Drawing operator/witness/evidence-retention process assigned.
- [ ] Support owner assigned.
- [ ] Exact live campaign configuration reviewed by two authorized people.
- [ ] Current production commit and CI evidence recorded.
- [ ] Leadership gives explicit GO.

Any NO means NO-GO for live operation.

## First live campaign controls

For the first controlled live campaign:

- keep the scope intentionally small
- use offline cash/check only
- do not add new payment paths during the campaign
- do not change ticket price, prize records, drawing date, or other locked disclosures after activation
- reconcile money throughout the campaign rather than waiting until the end
- retain operator screenshots/evidence for close, freeze, export, result, certification, and final reconciliation
- record any product or operator issue immediately without bypassing controls

## Incident rule

If an operator sees an uncertain result, duplicate-looking action, incorrect balance, access leak, unexpected ticket state, failed integrity check, or migration/environment mismatch:

1. stop the affected workflow
2. preserve the screen/error/evidence
3. do not repeatedly retry a money/ticket/drawing action
4. verify whether the prior operation committed
5. use supported correction/reversal workflows only
6. escalate before continuing if state cannot be proven

## Final launch record

Retain one launch record containing:

- production commit SHA
- CI run
- production bootstrap run
- legal/compliance approval reference
- official rules version
- production smoke result
- named custody/deposit/returned-check/drawing/support owners
- live campaign ID
- GO decision, approver, date/time

That record becomes the authoritative launch handoff for the first Aspire live raffle.
