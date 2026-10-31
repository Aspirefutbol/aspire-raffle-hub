# Parent phone pilot walkthrough — synthetic staging only

_Updated October 31, 2026 for Progress First → Action Second. This is a human-review script, not evidence of completed testing, authorization to enroll real families, or legal approval._

## Entry gate — do not begin until all three match

Record the **full integration Git SHA**, its successful exact-head **CI** run, successful **Hosted QA** run (including signed-out privacy smoke), and the **READY** deploy ID currently published by the existing Netlify staging project. Read the hosted job's checkout/deploy log to tie SHA to deploy: a READY status or deploy title alone is insufficient.

- Staging only: `https://aspire-raffle-hub-staging.netlify.app`; existing staging Supabase. Never the production Netlify project or production database.
- Use authorized **synthetic** test identities, fictional contacts, cash/check descriptions, prizes and campaign. No real purchases, money, family details or external invitations.
- Preserve the October 20 DRAWN rehearsal; create a **new TEST** campaign if an operational transaction exercise is needed.
- Verify the campaign displays **$20 for 1 / $90 for 5** and an *external physical drawing* only where those values were explicitly configured by the test operator.
- This is a guided **human observation**. Automated Playwright screenshots or CI passing are not a substitute for an actual parent/coach usability review.

### Verified technical checkpoint (not a human pilot pass)

At the October 31, 2026 checkpoint, integration \`95c55f374e069ecdc5729791fa5ec6cc148f5e63\` passed [full CI](https://github.com/Aspirefutbol/aspire-raffle-hub/actions/runs/41171632959) and [Hosted QA with login/privacy smoke](https://github.com/Aspirefutbol/aspire-raffle-hub/actions/runs/41171633081), and the matching staging deploy was READY (\`6ae57b3f88c8b5bba3669adf\`). **These are historical checkpoints only**: reverify exact HEAD, both runs, authenticated scope, signed-out privacy, and currently published deploy immediately before a real-device test. The unassisted parent walkthrough remains pending.

## Suggested devices and evidence

One genuine phone at ~360px, one second phone/OS if available, and a desktop for the operator. Test real touch and (where available) keyboard/screen-reader focus, not only resized desktop. Note actual device, OS, browser, viewport, tester role, start/end time, commit, CI run, Hosted QA run and deploy ID.

Save only redacted screenshots: player names and links must be fictional; **never** paste raw seller tokens, phone numbers, email addresses, passwords, payment details, session cookies or private audit records into issues/chat.

## Parent journey — watch without teaching the interface first

For each step, note **PASS / FAIL / FRICTION**, total taps, mis-taps, wording questions and whether assistance was needed.

| Step | Parent prompt (do not point to the control) | Expected observable outcome / stop condition |
| --- | --- | --- |
| 1. Find | “Open your fundraiser.” | Clearly named campaign; only authorized linked children; no unrelated roster or captain-wide sale tools. |
| 2. Choose | “Switch to your other child.” | Child name/team changes, the other child's card is hidden and no cross-child sales, progress or share link bleeds through. |
| 3. Progress first, then actions | “Open your fundraiser. What have you raised, and how many tickets have you sold? Now find how you would share, check requests, and record an offline cash sale.” | The selected player's **amount raised and ticket count** appear immediately. Show a **personal goal meter only when that player's authorized goal is configured**—never fabricate a goal. Three large **Share raffle / Requests / Record sale** actions are obvious, while **View full progress** is smaller and secondary. No horizontal scrolling or obstructed tap targets. |
| 4. Share | “Send someone a link.” | Creation confirmation shown only when no active link; Copy invitation is obvious; secondary SMS/QR/link settings are disclosed on demand. No online checkout. |
| 5. Return | “Go back, open Share again, then reload.” | Existing valid link persists; routine navigation/reload never silently revokes or regenerates the token. Do not expose raw token in browser storage/screenshots. |
| 6. Siblings | “Now share for your other child.” | Distinct sharing URLs per child; selecting/reloading uses only authorized participant IDs; returning to first child preserves its existing link. |
| 7. Cancel | “Find the way to replace or disable a link, but cancel.” | Destructive action requires a clear confirmation; cancellation preserves both original links and generates no money, sale or supporter request. |
| 8. Disable one | “Disable only the second child's link.” | Old second link becomes unusable for requests, but first child's link still allows a nonbinding request; no money/tickets written. |
| 9. Supporter | “What can someone do without signing in?” | Public page is **request-only**. Clearly states no payment collected and no ticket reserved/issued; no private family, inventory, money or supporter-inbox data disclosed. |
| 10. Requests | “Where would you find a new expression of interest?” | Authenticated, scoped request inbox; an interest request is never presented as a confirmed sale or paid ticket. |
| 11. Offline sale | “Record a fictional, already-collected cash payment.” | Distinct confirmation and receipt; exact price/package/ticket count; one authorized player's stock; cash/check only. If user cannot tell *request* from *sale*, mark FRICTION/FAIL. |
| 12. Full progress | “Open your detailed progress and check what is still available without making a sale.” | **View full progress** opens details for the selected player only, **Back to actions** restores visible focus, and opening/closing details causes **no money, ticket, sale, or supporter-request writes**. Assigned ticket numbers remain in a secondary disclosure. Recorded collections are not falsely represented as deposited club funds. |

### Money and lifecycle negative-path spot check

With an authorized operator, use a separate new TEST campaign and synthetic data to verify a rejected invalid timestamp/quantity creates **zero** partial sales/tickets/money; a corrected sale issues once; duplicate submission does not double-issue; and an unauthorized captain/family cannot record for unrelated players. Cross-check canonical campaign tickets, sales, money events and audit through existing authorized tooling. **Never** change RLS, bypass RPCs or repair ledgers manually.

The public request page must never collect payment, reserve tickets, or issue entries. The app must never perform a random drawing. Actual ticket disclosures, seller compensation, entity authority, prizes, custody and the external physical drawing all remain subject to independent Texas/operator approval.

## Phone acceptance observations

At narrow widths (320 / 360 / 390px), record: horizontal overflow (must be none); **raised amount and tickets visible at entry**; **no invented goal or goal meter** when the personal goal is absent; three primary actions and smaller **View full progress**; primary action minimum touch size (target >=44px, major tiles >=88px); selected sibling indication; readable prices and errors; successful scroll/focus after opening/closing Share or Full Progress; native share/SMS behavior; canceled dialog state; full progress details closed by default. Note real-device failures even when automated tests pass.

Do not mark a human walkthrough PASS unless an actual tester completed the task unaided. Label each failure as **functional / privacy-security / transaction-integrity / accessibility / confusion**. Privacy, unauthorized scope, incorrect pricing, automatic link rotation, duplicate ticket/money issuance, public checkout or stale revoked links are **STOP / NO-GO**.

## Director evidence and decision

```text
Date / reviewer:
Integration full SHA:
CI run and conclusion:
Hosted QA run and conclusion:
Published staging deploy ID / READY check:
Phone(s), browser(s), viewport(s):
Synthetic campaign ID (non-secret):
Steps 1–12 PASS / FAIL / FRICTION:
Unassisted first-run success rate (count / testers):
Worst confusion and reproducible steps:
Privacy / money / inventory negative-path checks:
Redacted evidence location:
Owner + corrective action + retest:
Decision: STAGING WALKTHROUGH PASS / RETEST NEEDED / BLOCKED
Live raffle: NO-GO pending separate legal, production, operational and director gates.
```

Do not upgrade “staging walkthrough PASS” into “live raffle GO.” Cross-reference [Controlled Pilot Readiness](CONTROLLED_PILOT_READINESS.md), [Parent Sharing Acceptance](PARENT_SHARING_ACCEPTANCE_2026-10-23.md) and [Production Go-Live Runbook](PRODUCTION_GO_LIVE_RUNBOOK.md).
