---
name: "Codex / Claude handoff"
about: "Transfer a bounded Raffle or Aspire South task with one owner, exact evidence and explicit approval boundaries."
title: "[Handoff] "
labels: []
assignees: []
---

> **Routing:** This is the canonical issue for this task. It has **no default label**. Post the full handoff comment, then apply exactly one routing label: `needs-codex`, `needs-claude` or `needs-director` (waiting on a director decision or approval). Use separate linked issues for parallel owners/scopes. Labels do not grant approval to merge, promote, deploy or change security/business rules. Agents start this issue and every comment with `Agent: Claude` or `Agent: Codex`; director approvals are recorded as `DIRECTOR APPROVAL:` comments without that line and confirmed to the acting agent directly.

## Owner, goal and boundaries

- From → To (one next owner):
- Routing label:
- Objective and acceptance criteria:
- Requested action: [ ] investigate  [ ] implement  [ ] independent review  [ ] CI triage  [ ] handback
- Completed work and explicit non-goals:
- Prohibited actions (merges, deploys, production, hosted SQL, secrets, real data, spending, etc.):

## Exact repository context

- Repository: `Aspirefutbol/aspire-raffle-hub`
- Project/scope and canonical issue URL:
- Related draft PRs / separate workstream issues:
- Target/base branch and full SHA (verify live):
- Isolated work branch and full HEAD SHA:
- Source tree SHA:
- Work state (only verified states: local-only / pushed / draft / CI-validated / reviewed / promoted / staged / deployed):
- Active writer, overlapping branches/PRs, dependencies and conflicts:

## Files, artifacts and validation

- Exact changed files and diff:
- Accessible Git bundle (required when exact commit SHAs must be preserved; a patch re-applied creates new SHAs) or patch, with SHA-256 checksum, AND clean source archive when private sandbox artifacts are inaccessible; dependency order:
- Full sanitized report/log links:
- Local commands, environment, synthetic fixtures, PASS/FAIL/SKIP counts and first attempt/retries:
- Fresh DB reset/migrations, pgTAP/RLS/security, concurrency and audit evidence:
- Lint/types/unit/build, browser/E2E and 320/360/390px accessibility evidence:
- CI run IDs/URLs, exact head SHA, GitHub-tested merge SHA/tree, jobs and final conclusions:
- Baseline evidence versus candidate evidence:
- Authorized hosted QA login/public-privacy smoke, URL, deployment ID/source SHA and matching published READY state:
- Preview/staging/production classification; automatic preview observed, explicit deployment, or deployment prohibited:
- Deployment side effects of any proposed merge/push (see "Merges and pushes that deploy" in `AGENTS.md`):
- Not independently inspected, not run, not applicable or unverified (with reasons):
- Known failures, reproduction steps and meaningful retry history:

## Risks and approval boundaries

- Threats, regressions and risk classification:
- Director approval status: link to the `DIRECTOR APPROVAL:` comment, its exact action/target/SHA, and confirmation that the director confirmed it to the acting agent directly:
- Independent security-review status:
- Pending approvals and stop conditions:
- Data: synthetic only unless separately authorized; no credentials, raw seller tokens, service-role keys, real donor/child/family/supporter data or billing details in this issue or artifacts.
- Preserve Raffle gates: public REQUEST-only pages, offline cash/check, guardian isolation, immutable ledgers, physical drawing, no production Supabase for tests, and no PR #2 merge without specific approval.
- Preserve South gates: PR #19 separate from PR #15; Batch 1 outbox is not deployed sending; Batch 2 SQL, identities, personal links, sender/DNS, live payments/emails and hosted migrations need distinct approval.
- No uncertain destructive retry, silent seller-link rotation or weakened assertions.

## Receiving owner checklist and handback

- [ ] Read `AGENTS.md`, relevant docs and this issue's latest comments; read `docs/PROJECT_STATE.md` if present on the selected branch.
- [ ] Confirm repository permissions, acknowledge scope, check active writers/overlaps and independently verify remote base/head/tree and accessible artifacts before editing.
- [ ] Stop on unexpected drift; do not silently rebase, retarget a PR or combine application branches.
- [ ] Work on an isolated branch with synthetic data; keep PR draft and preserve all approval gates.
- [ ] Validate the changed head and preserve full evidence, including merge SHA/tree for PR CI and anything not run.
- [ ] Post the full handback here, name the next owner and one action, then switch the single routing label. Record a blocker if routing fails.

**One immediate next action:**

**Expected handback / required checks:**

**Receiving-owner acknowledgement and date:**
