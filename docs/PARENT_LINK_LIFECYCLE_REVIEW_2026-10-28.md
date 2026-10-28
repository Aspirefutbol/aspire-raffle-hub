# Parent touchscreen link lifecycle — static safety and UX review (DRAFT)

Prepared October 28, 2026 against integration `feat/phase-1-fundraising-slice` at `1da6516c72741d49970162e3366e64537af76b5f`. This document is a **source review and test plan**, not evidence that a new browser suite ran, a human phone test passed, a live raffle was authorized, or production was changed.

## Verified source behavior

- `components/fundraising/parent-touch-tasks.tsx` keeps each linked player's card and SellerTools mounted but hides nonselected cards. The parent explicitly selects a player. Task changes use Share / Requests / Record sale / My progress and move keyboard focus to a visible Back to actions control or player heading. No server request is issued by the chooser itself.
- `components/sharing/seller-tools.tsx` issues or revokes a seller link only through the Confirm action in its dialog. Copy, QR rendering, changing tabs/players and opening settings have no link-management call in this component. A `mutationInFlight` guard protects against a second rapid mutation; cancellation makes no mutation. If a request's outcome is uncertain, the component clears the displayed URL rather than claiming the old link is still valid.
- `e2e/sharing.spec.ts` already asserts no link mutation on a canceled confirmation, one mutation despite a double-tap, no change across Share -> Progress -> Share, link survival in that flow, request-only supporter behavior, and offline sale boundaries. This is **synthetic/local test coverage**; it does not prove every device interaction.
- Isolated `test/parent-player-switch-persistence-20261027` at `9b9510595607897dc3bfd1e2665f74c146daa172` adds linked-sibling switching, correct active card, unchanged displayed original seller URL after returning, no horizontal overflow, and zero `campaign_sales` writes. Relative to integration it also includes a temporary verification workflow; this workflow must not be promoted. The prior run `40492732258` failed on the preceding test head because a Promise was asserted without `await`. The one-line correction is in this later head, but **a complete passing exact-head rerun is not independently established**.

## UX issue to observe, not silently redefine

`SellerTools` initializes the **displayed** link as an empty client-side value on mount. A browser reload therefore returns to the Create my sharing link presentation rather than reconstructing the previously displayed URL from memory. The creation confirmation correctly warns that an existing link and printed QR will stop working when a new link is created. This is a deliberate link-safety boundary and **not** an invitation to expose or persist raw sharing tokens in an insecure store.

The uncoached phone walkthrough should determine whether a parent who has already shared a link understands that **creating another link disables the one already sent**. If testers miss this, consider a narrowly scoped wording/visual-hierarchy improvement around the existing confirmation, without server-side token retrieval, automatic rotation, new public data exposure, or extra form steps.

## Follow-up synthetic regression acceptance (only after the existing candidate clears its independent gate)

1. A synthetic guardian has two linked fictional players. Select Child A explicitly; create a link with the existing confirmation, and record its redacted identity locally in the test process.
2. Switch to Child B and confirm only Child B's actions are visible; do not call `manageSellerLink` or issue/rotate a link for either child merely because of navigation.
3. Switch back to Child A; the original displayed URL must be unchanged, and a signed-out request page must still behave as **request-only** without ticket reservation, sale creation or payment collection.
4. Repeat Share -> Home -> Progress -> Home and narrow viewport (320/360/390px) focus/overflow checks. Confirm no unexpected server mutation occurred. Preserve existing security/RLS, idempotency, concurrency, ledger, drawing and package assertions.
5. Cancel link replacement; original link must remain valid. A confirmed replacement/revocation is a **separate intentional operation**; do not perform it against a real supporter or printed QR.
6. Refresh the phone and observe the language around creating a new link **without issuing one**. Record whether the parent understands old-link invalidation and can locate their previously saved invitation externally. Do not invent a recoverable token API.

Where practical, supplement the existing URL-in-component assertion with a synthetic **link-management mutation count** around sibling switching so a visually unchanged old link cannot mask an unintended server rotation. The existing `e2e/sharing.spec.ts` network-counting pattern is a useful starting point. If tests detect a real mutation or wrong-child authorization, stop, investigate server logs safely, and do not promote.

## Release controls

The published staging baseline was last verified as Netlify `6ae0791e4220e343e5d69064` (READY, title `hosted-qa 1da6516`); normal CI `40485346976` and Hosted QA `40485346814` passed the integration baseline. These historical facts must be rechecked immediately before any further code promotion. The corrected sibling-switch test at `9b951059` is **not** claimed green or staged. Obtain complete exact-head independent database/security/concurrency/browser and lint/types/unit/build evidence; then re-read the integration ref, promote only intended test source (never the temporary verification workflow), require normal exact-head CI + Hosted QA + matching READY staging.

Use fictional/local or explicitly authorized synthetic staging identities only. No real family/payment data, production Supabase, online raffle checkout, automatic public ticket issuance, live drawing changes, production deploy, PR #2 merge, credential changes, or spending. Human uncoached parent phone observations and separate legal/business/operator approvals remain required for live operation.
