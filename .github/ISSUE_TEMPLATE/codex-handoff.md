---
name: "Codex / Claude handoff"
about: "Transfer an Aspire Raffle Hub task between Claude and Codex with exact evidence and approval boundaries"
title: "[Handoff] "
labels: ["needs-codex"]
assignees: []
---

> **Routing:** This template starts with `needs-codex`. When transferring work to Claude, replace that label with `needs-claude`. Keep exactly one active routing label unless separate owners/scopes are explicitly recorded.

## Goal and acceptance criteria

- Objective:
- Definition of done:
- Current owner → next owner:
- Requested action: [ ] implement  [ ] independent review  [ ] CI triage  [ ] handback

## Exact source and references

- Repository: `Aspirefutbol/aspire-raffle-hub`
- Base branch and SHA:
- Work branch and HEAD SHA:
- Expected/tested tree SHA:
- Draft PR / related issue links:
- Shared files: patch / bundle / clean ZIP / full report (links or attachments):
- Relevant design/security decisions:

## Delivered / verified

- What changed (files and behaviors):
- Local checks (command, environment, PASS/FAIL/SKIP counts):
- GitHub CI run URL, head SHA, merge SHA/tree, jobs and final conclusion:
- Synthetic preview URL, deployed SHA and smoke-test evidence (if applicable):
- Anything not independently inspected or run:

## Risks, blockers and approvals

- Known failures, missing logs or unverified claims:
- Changed or sensitive boundaries (database/RLS/auth/webhook/secrets/Stripe/email/real data):
- Explicitly **not authorized** (merges, deploys, migrations, spending, etc.):
- Approval granted by whom, for what exact action (link):

## Next owner checklist

- [ ] Read `AGENTS.md` and relevant docs and confirm repo permissions.
- [ ] Verify remote base/head and stop if drifted; do not silently rebase.
- [ ] Verify actual handback artifacts, not just report text.
- [ ] Work only on an isolated branch; keep PR draft until approved.
- [ ] Obtain current exact-head CI (including merge tree where PR-triggered) and preserve logs.
- [ ] Report findings and request explicit approval before merging/deploying/security changes.

**One immediate next action:**

**Handoff acknowledgement (next owner / date):**
