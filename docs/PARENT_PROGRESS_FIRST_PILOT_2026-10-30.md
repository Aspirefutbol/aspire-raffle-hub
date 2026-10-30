# Parent dashboard: Progress First → Action Second (pilot design contract)

Status: **isolated design proposal / NOT DEPLOYED**. Prepared from the director's phone walkthrough on October 30, 2026. Only fictional/synthetic staging data. This proposal is not approval to change raffle policy or financial semantics.

## Problem and intent
The parent currently sees a campaign/player card and then opens a task launcher that gives "My progress" equal priority with Share, Requests and Record sale. The director prefers progress visible immediately because it can encourage participation without extra taps. Keep one simple screen, do not add engagement pressure.

## Proposed parent landing
1. Current fundraiser and active linked player clearly identified, with a compact, accessible campaign/player selector where applicable.
2. Immediately visible **My progress** summary: amount raised and number of tickets sold, both derived from the same existing authorized, scoped source as today's progress view. Do not fetch another household's or campaign's details.
3. A single compact goal meter **only when the existing approved player/campaign goal is available and meaningful**. Never invent or hardcode $200, infer dollars from ticket counts, or use a percentage denominator that differs from the authorized goal. Without a goal, show the two real counters and no fake bar or 0% indicator.
4. Three large primary touch actions: **Share Raffle** (visually primary), **Requests**, **Record Sale**. Keep the existing request-only public supporter boundary and offline cash/check recording rules.
5. A small secondary **View full progress** disclosure/link for detail, not a fourth equally weighted tile.
6. Secondary instructions and advanced link management behind disclosures; retain clear explicit confirmation before rotating/revoking a link. Existing link must not change merely from revisiting the page.
7. One task at a time after selection, clear Back action, restore keyboard focus to the triggering action, no horizontal scroll or cropped dialogs at 320/360/390 px. Touch controls at least 44px tall; accessible names and reduced motion respected.

## Testable acceptance criteria
- On the default parent dashboard, the progress amount and ticket count appear without tapping a progress tile. Values equal the existing authorized progress for the selected participant and campaign.
- Three main actions are visible and usable at 320, 360 and 390px, including zoom and long campaign names; no cross-axis overflow and no layout shift caused by progress-meter animations.
- Existing campaign/participant choice isolation persists through reload and switching; invalid or foreign IDs in session storage cannot expose data.
- Requests remains distinct from actual recorded offline sales. Opening/closing task views produces zero ticket, supporter-request or financial ledger writes.
- The full progress view still provides detailed statistics; only the summary is duplicated. No fabricated target or celebratory/competitive copy that implies guaranteed sales.
- Link rotation/revocation needs explicit parent confirmation, cancel is non-mutating, sibling sharing links remain independent.
- All existing security, RLS, idempotency, ticket, concurrency, financial audit and Texas compliance tests remain present, without weakened assertions.

## Controlled implementation sequence
1. Identify existing authorized parent progress component and player/campaign selection contracts. Reuse their data, labels, formatting and scoped queries.
2. Implement only the minimal parent component layout change on a new isolated source branch; do not alter APIs, database, pricing, drawing, legal/business rules or money custody.
3. Add/update browser acceptance for default summary, 320/360/390px interactions, zero mutations, sibling/campaign isolation, focus return, and goal absent/present cases.
4. Require complete isolated database/security/concurrency/audit, lint, types, unit, build and browser acceptance before reviewing exact diffs.
5. Promote only intended source/test files without temporary workflows, then require exact-head normal CI, Hosted QA, smoke checks and matching READY Netlify staging before claiming staged.
6. Conduct uncoached human iPhone parent walkthrough using synthetic credentials. Capture friction before director pilot signoff.

## Director decisions pending
- Confirm the goal meter should appear only for authorized configured goals (recommended), and agree the final microcopy after watching the phone walkthrough.
- No legal, prize, ticket amount, sale channel, or production decisions are authorized by this document.
