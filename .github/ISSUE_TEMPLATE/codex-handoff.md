---
name: "Codex / Claude handoff"
about: "Route a bounded, evidence-backed engineering investigation, implementation, or review between Codex and Claude."
title: "[Handoff] "
labels: ["needs-codex"]
assignees: []
---

<!-- ROUTING: New issues start needs-codex. For a Claude handoff, after posting a complete handoff comment REMOVE needs-codex and ADD needs-claude. Keep one routing label active. Label presence does not authorize merges, promotions or security changes. -->

## Owner and requested outcome
- From (Claude / Codex / director):
- To (Codex / Claude): **Codex**
- Routing label: `needs-codex`
- Objective and bounded acceptance criteria:
- Explicitly prohibited scope (production, secrets, payments, auth/RLS, etc.):

## Exact repository context
- Repository: `Aspirefutbol/aspire-raffle-hub`
- Related issue(s) and PR(s):
- Base branch + **full SHA** (verify live):
- Isolated work branch + **full SHA**:
- Work state: local-only / pushed / draft / CI-validated / reviewed / promoted / staged (select only verified states)
- Change owner and overlapping branches/PRs:

## Changes / evidence being handed off
- Exact changed files and diff summary:
- Patch/bundle location, checksums and commit dependencies (if not pushed):
- Commands executed, environment and synthetic fixtures:
- CI run IDs, exact-head SHA, passed/failed/skipped results, retries:
- Database reset/migrations, pgTAP/RLS, concurrency and audit evidence:
- Lint/types/unit/build/browser and 320/360/390px accessibility evidence:
- Hosted QA login/public privacy smoke + Netlify READY deployment ID (only if verified):
- Known limitations, reproduction steps and meaningful failures:

## Security, privacy, and approval gate
- Threats, regressions and risk classification:
- Director approval status:
- Independent security-review status:
- Data used: **synthetic only**; no credentials or real family/payment data
- No destructive retry, silent seller-link rotation, weakened assertions, production Supabase, production deployment or PR #2 merge without separate authorization

## Next agent: specific work and return conditions
- Requested investigation / patch / review:
- Tests that must pass with exact-head evidence:
- Stop conditions / approval needed:
- Expected handback format: comment with exact SHAs, changed files, test evidence, unresolved risks and next owner

<!-- HANDOFF PROCEDURE: Post a completed comment with the sections above; only then switch needs-codex <-> needs-claude. Never leave both labels active for the same next owner. See AGENTS.md and CLAUDE.md. -->
