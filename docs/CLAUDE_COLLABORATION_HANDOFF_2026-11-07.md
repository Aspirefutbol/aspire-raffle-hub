# Aspire Raffle Hub × Claude Code — Collaboration Handoff
Prepared 2026-11-07. **Documentation only, isolated branch; not deployed or approved for production.**

## Quick start for Claude
1. Read this handoff and inspect the **live** GitHub state. Do not trust the checkpoint SHA as current.
2. Repo: https://github.com/Aspirefutbol/aspire-raffle-hub
3. Integration: `feat/phase-1-fundraising-slice`, draft/unmerged [PR #2](https://github.com/Aspirefutbol/aspire-raffle-hub/pull/2).
4. Staging: https://aspire-raffle-hub-staging.netlify.app. At preparation, integration `0a72ba4e8e1068e5648f565ae7682abb38d617dc`, Netlify READY deploy `6ae86ffc5650a41428fba5f9` titled `hosted-qa 0a72ba4`. Recheck exact-head CI, Hosted QA and login/public-privacy smoke logs.
5. Be aware that `docs/PROJECT_STATE.md` has an October 23 historical checkpoint and is stale. Live code, migrations, logs, branches and current director decisions take precedence.

## Approved parent product direction
- **Progress First → Action Second**: immediately show authorized raised amount/ticket count; configured goal bar only when available. Three primary actions: **Share My Raffle**, **Requests**, **Sell In Person / Record Sale**; details secondary.
- Sole eligible active fundraiser opens directly. Multiple active campaigns show a selector; enforce guardian/player/campaign authorization and safe empty states.
- **Two selling paths**: (a) player shares personal link by native share/copy; supporter public page is **REQUEST ONLY**; parent follows up. (b) player asks in person; parent/authorized seller records transaction only after approved offline cash/check process. Do not confuse request with sale/ticket issuance.
- Mobile: minimal reading, 44px+ targets, 320/360/390px, no horizontal overflow, keyboard/focus accessibility, one task per screen. Remove avoidable extra taps and repeated instructions.
- Existing link sharing can be one tap **only when the valid URL is already available in current session**; never silently revoke/rotate it.
- Existing hash-only seller-link storage does not allow retrieval of the plaintext URL after re-login/reload. Director has prioritized secure recovery of the **same** link, but that is **NOT** security design approval.

## Security and legal boundaries
- [Issue #9](https://github.com/Aspirefutbol/aspire-raffle-hub/issues/9) and [draft PR #15](https://github.com/Aspirefutbol/aspire-raffle-hub/pull/15): secure link-recovery design and threat model, **pending independent security review and director approval**. Do NOT implement new token persistence, encryption/key custody, auth/RLS changes or automatic rotation before those approvals.
- [Issue #10](https://github.com/Aspirefutbol/aspire-raffle-hub/issues/10): past browser first-attempt timeout; closed but do not call a flaky retry a clean pass.
- [Draft PR #17](https://github.com/Aspirefutbol/aspire-raffle-hub/pull/17) and stacked [draft PR #18](https://github.com/Aspirefutbol/aspire-raffle-hub/pull/18): sharing RPC fail-closed response handling; check dependencies and exact-head tests before any promotion.
- Preserve authorization, tenancy/RLS, audit/hash-chain integrity, idempotency, ticket inventory, concurrency, immutable financial ledgers, independent physical raffle drawing controls, and revocation semantics. Only synthetic staging/test data.
- Public supporter page: requests only, **no** online checkout, online ticket issuance, or automatic sale. Cash/check-only offline under existing approved process. Zelle, cards, personal accounts, new prices/prizes/business/legal rules require separate approval.
- **Never** touch production Supabase or deploy raffle production; never merge PR #2, change credentials, secrets, encryption keys, billing, prizes, policies, or spend money.
- November 19, 2026 director GO/NO-GO; November 23 **conditional** launch target, not authorization. Legal eligibility/rules, custody and physical drawing owners, production readiness, independent security review and unassisted parent walkthrough are outstanding.

## Claude's first task
Conduct a read-only comparison of live integration code, the Progress First entry dashboard, Share/My Requests/Sell In Person pathways, and issue #9 / PR #15. Produce a concise **CURRENT_STATE_AND_GAPS.md** with exact SHAs, paths, observed behavior, and a narrowly scoped recommended work sequence focused on friction. Do not claim tests or deployments not independently verified.

For any subsequent implementation: use an isolated branch based on verified integration. Require full isolated database migrations, pgTAP/RLS/security/concurrency/audit, lint/types/unit/build and complete retry-free browser/mobile acceptance, then inspect exact diff. Promote only intended source/test files (no temporary verification workflow) after full acceptance. Require exact promoted-head normal CI, Hosted QA, hosted smoke and matching published READY Netlify staging before calling staged. Stop at security, director, legal or business approval boundaries.

## Handoff protocol
For every Claude batch return: branch, base SHA, head SHA, exact changed paths and diff, user-visible before/after, passing/failing jobs and retries, risk assessment, whether approval is needed, and next safe step. Claude and ChatGPT coordinate by reviewing the same evidence; neither treats unverified narration as a released build.

**Copy/paste kickoff:** "Read docs/CLAUDE_COLLABORATION_HANDOFF_2026-11-07.md on branch docs/claude-collaboration-handoff-20261107, then perform only the read-only first task described there. Do not edit integration or production. Return current-state evidence and a proposed first isolated implementation plan."