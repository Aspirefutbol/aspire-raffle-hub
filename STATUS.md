# Raffle Hub and Aspire South status

**Draft shared status. Reviewed 2026-11-10; not release approval.** Public repository: Aspirefutbol/aspire-raffle-hub. Two products share this repo; their branches, approvals, money flows and readiness are separate. No personal records, raw links/tokens or private incident details belong here.

## Raffle Hub
**Done means, proposed:** Aspire can run its single approved raffle through family sharing, authorized offline cash/check sales, ticket/money reconciliation and the approved external drawing, with secure access and a usable parent phone journey.

**Current:** The historic hosted rehearsal is recorded in #2; #2 remains draft/unmerged. Current integration is `0a72ba4e8e1068e5648f565ae7682abb38d617dc`. Security candidates #34 and #40 are separate, open drafts; their isolated checks do not establish a combined secure release. Public supporter pages remain request-only, not checkout or ticket issuance.

**Must-have:**
- Reconcile current security/auth candidates and verify the combined exact source, database permissions, family isolation, token recovery/revocation, retries and audit/financial integrity.
- Preserve secure recovery of an existing parent sharing link; do not silently rotate links or defer this previously required behavior.
- Verify real phone sharing and the authorized authentication/delivery path; resolve operator access.
- Confirm legal authority, rules/prizes, dates, payment/ticket rules, drawing/custody owners and production recovery/monitoring, then obtain explicit launch approval.

**After launch:** Multi-club/business expansion is deferred. Existing safeguards do not get removed just because Aspire is the only launch club.

**Decisions:** 2026-11-10: the Director prioritized completing the Aspire raffle as soon as possible and deferred the larger business until this and South are complete. Current approved money flow remains offline cash/check, not online raffle payments.

**Next / owner / date:** Existing Codex raffle security/readiness owner: reconcile #34 + #40 and return the shortest complete launch-blocker list. **Proposed next checkpoint: 2026-11-11; owner commitment and launch date not confirmed.**

## Aspire South Calendar
**Done means, proposed:** Aspire South families can share their calendar and donors can sponsor available days through the approved Stripe flow, with correct amounts, reliable confirmation and no exposed private data.

**Current:** #42 is merged into `feat/calendar-fundraiser-aspire-south` at `909e7647530a197f2f5fd9ddf43be003140bdeb9`; parent-reported post-merge CI and a fictional-data preview passed. #19 remains unmerged. Local rehearsal reproduced a retry mismatch and skipped database-dependent tests; this does not prove live payments or database acceptance. Existing notification and device gates remain open.

**Must-have:**
- Reuse the existing Aspire calendar as the Director directed; identify the exact source and avoid rebuilding generic multi-club infrastructure.
- Verify day availability, totals, duplicate/retry handling, payment result reconciliation and notification reliability on the intended candidate. Fix the reproduced retry mismatch.
- Finish the outstanding small-screen identity/focus fixes and physical-device acceptance.
- Complete the separately approved hosted/payment/privacy/operations checks and obtain launch approval before live collection or messages.

**After launch:** Multi-club setup, generalized onboarding and commercialization are deferred; do not remove existing access isolation or payment safeguards.

**Decisions:** 2026-11-10: the Director chose the already-built Aspire calendar for South now, with the larger business revisited after South and the raffle are complete. #42 approval covered its calendar integration/synthetic preview, not production launch.

**Next / owner / date:** Existing Codex South owner: verify the reuse baseline, finish retry/notification acceptance and return the remaining launch steps. **Proposed next checkpoint: 2026-11-11; owner commitment and launch date not confirmed.**

Sources: [Raffle #2](https://github.com/Aspirefutbol/aspire-raffle-hub/pull/2), [#34](https://github.com/Aspirefutbol/aspire-raffle-hub/pull/34), [#40](https://github.com/Aspirefutbol/aspire-raffle-hub/pull/40), [South #19](https://github.com/Aspirefutbol/aspire-raffle-hub/pull/19), [#42](https://github.com/Aspirefutbol/aspire-raffle-hub/pull/42), the Director's 2026-11-10 chat decisions. No new tests, merges, payments or deployment performed for this audit.

## Upkeep
Codex maintains this summary when material evidence or a relayed decision changes. Read the linked issue/PR before acting; private chats do not synchronize automatically. Keep one named next owner and distinguish target dates from commitments. No scope cut or launch permission is implied by this page.

