# Parent touchscreen pilot — uncoached phone acceptance (DRAFT)

Prepared October 28, 2026. **This is an acceptance protocol, not proof of a completed human walkthrough, a legal opinion, a launch approval, or a production deployment.**

## Scope and exact starting evidence

- Raffle Hub source integration baseline: `feat/phase-1-fundraising-slice` at `1da6516c72741d49970162e3366e64537af76b5f`; PR #2 was OPEN / DRAFT / UNMERGED at preparation.
- For that baseline only: normal CI run `40485346976` and Hosted QA run `40485346814` each completed successfully; Netlify **staging**, not live raffle production, deploy `6ae0791e4220e343e5d69064` was READY, titled `hosted-qa 1da6516`.
- An additional synthetic multi-player persistence test on isolated `test/parent-player-switch-persistence-20261027` at `9b9510595607897dc3bfd1e2665f74c146daa172` has **no independently confirmed complete exact-head PASS** as of this draft. It is not promoted and is not a pilot signoff.
- **Reverify all three live gates immediately before each real walkthrough:** full integration SHA; successful normal CI and Hosted QA for that SHA; Netlify published READY deploy title/association matching it. Do not assume this historical baseline is still current.
- Use existing *authorized synthetic staging* identities and clearly fictional campaigns, players, supporters and cash/check descriptions. Never enter real contacts, real money, payment details, production accounts or production Supabase credentials. Never modify the previously certified DRAWN rehearsal.

## Goal

Observe whether a new parent, without coaching, can select the correct child and accomplish each primary task using a physical phone: **Share raffle / Requests / Record sale / My progress**. Minimize reading, scroll searching and wrong-player errors; allow extra details through secondary disclosures. Human observation is required. Browser automation alone does not satisfy this document.

## Preflight and test record

- Record date, reviewer, staging URL, integration SHA, normal CI run, Hosted QA run, READY deploy ID/title, device model, OS, browser and portrait viewport width. Note network/zoom and accessibility settings.
- Choose a synthetic parent with two distinct linked fictional players, and a campaign preconfigured with the approved *test fixture* price of $20 single and five for $90. Do not treat synthetic amounts as real proceeds.
- Before each action, ask the tester: “What would you tap next?” Provide no instructions unless blocked; record hesitation, wrong taps, accidental disclosure openings, horizontal scrolling, and assistance required. Avoid leading questions.
- Mask share tokens, QR destinations, email/phone fields and session information in retained screenshots. Do not place raw links or credentials in issue comments, analytics or spreadsheets.

## Parent tasks and observable pass conditions

| Task | Uncoached prompt | Required observation |
| --- | --- | --- |
| Find child | “Find the right fundraiser for each of your two children.” | Correct active player is obvious; switching children changes visible heading and actions; never presents a sibling's private controls as the selected child's. |
| Share | “Send someone an invitation to support this child's raffle.” | Prominent Share raffle action; the invitation and copying path are apparent; optional QR/SMS/link settings are secondary. Creating a seller link is deliberate and does not happen when merely switching screens. |
| Requests | “Someone said they are interested. Where would you check?” | Requests action is easy to find; supporter interest remains **request-only** and does not reserve tickets, charge, or automatically record a sale. |
| Record sale | “Record a fictional five-ticket $90 cash/check purchase.” | Authorized offline sale form and confirmation clearly identify player, quantity, price and offline collection status. No web checkout or online payment is offered. If actual staging write permissions are unavailable, stop; do not bypass RLS. |
| Progress | “How much has this child raised, and what is still outstanding?” | Parent recognizes sales/progress without mistaking recorded sales for money physically received. Detailed transaction/custody history remains available through secondary disclosure, not forced upfront. |
| Switch and return | “Check your second child, then go back to the first child's sharing invitation.” | Second child's card/actions appear; first child's card is hidden; first child's existing seller URL is unchanged on return. Simply navigating never rotates/revokes a token or duplicates sales. |
| Link safety | “What if you need to replace your old sharing link?” | Link settings and explicit confirmation are distinguishable from Copy/Share. Cancel leaves existing link intact; confirmed replacement intentionally revokes old tokens and printed QR codes. Do not perform replacement on any real link. |

## Mobile/keyboard acceptance

- Observe an actual phone, not just a desktop emulator. Repeat with another OS/browser when available; record what was *not* tested.
- Confirm no document or share-tool horizontal overflow at 320, 360 and 390 CSS-pixel representative viewport widths where feasible. Automated assertions currently cover these widths plus 768/1024 for sharing details, but don't replace device inspection.
- Main Share, Requests, Record sale and Progress targets should meet the existing 88px test expectation; disclosure and secondary controls the existing 44px expectation. Do not relax tests simply to declare acceptance.
- One main task at a time; back-to-actions is visible, touchable and returns to an obvious starting point. Do not require repeated long-page scrolling for routine actions.
- Where a keyboard or assistive focus method is tested, opening Share/Progress must move focus to a visible Back to actions control; returning Home must restore focus to the player's heading, not a hidden tile.

## Stop conditions and evidence

**Stop and record failure** on mismatched or unverified deploy, inadvertent real-data exposure, inaccessible authorized test identity, wrong-child data, unconfirmed token rotation, link/session leakage, simulated request creating a real sale, sale without required authorization, online payment or ticket reservation, incorrect package totals, unsafe custody implications, broken ledger/security controls, or a failed full test gate.

For each task, record **pass/fail/blocked**, first chosen tap, wrong turns, assistance needed, perceived text burden, scroll problems, screen recording/screenshot references if redacted, and one narrow suggested improvement. Prefer 2–3 independent parents on real devices; log different responses without coaching. Do not convert synthetic automated results into a human PASS.

## Exit gates

Pilot UX signoff requires: (1) exact-source CI + Hosted QA + matching staging READY, (2) corrected multi-player test fully green if promoted, (3) uncoached parent observations and documented fixes/rechecks, and (4) separate admin/operator walkthrough. These do **not** authorize a live raffle.

Live operation still requires explicit director/legal/business approvals on legal entity/raffle authority, prize disclosures and official rules, sales schedule and delivery/numbering, physical cash/check custody and returned checks, external drawing/records retention, and production security, backups, monitoring, domain/email and release. Keep PR #2 draft/unmerged; do not change credentials, real family/payment data, production systems or physical drawing procedures through this document.
