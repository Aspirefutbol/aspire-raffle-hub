# Money UI Operator Review — Aspire Staging

_Date prepared: 2026-10-15_

This is the final hands-on review before Money Custody & Reconciliation can be accepted and the project can advance to the next gated slice.

## Target

- Staging: https://aspire-raffle-hub-staging.netlify.app
- Campaign: **QA ONLY — Aspire PR #2**
- Admin QA account: `admin@aspire.test`
- Family/captain QA account: `coach@aspire.test`

Use the existing QA password already established for these staging accounts. Do not paste credentials into project documentation or chat screenshots.

## Current expected starting state

At the time this checklist was prepared, the hosted database reports:

- Recorded sales: **$20.00**
- Expected: **$10.00**
- Received: **$0.00**
- Outstanding: **$10.00**
- Reconciled: **$0.00**
- Uncleared: **$0.00**
- Exceptions: **$0.00**
- Deposited: **$0.00**
- Adjustments: **$0.00**
- Credit: **$0.00**

If these values differ when the review starts, stop only if the difference is unexplained. QA activity may legitimately change staging balances.

## Admin walkthrough

1. Sign in as the admin QA account.
2. Open **Aspire → Campaigns → QA ONLY — Aspire PR #2**.
3. Open **Money & reconciliation**.
4. Confirm the page clearly distinguishes:
   - recorded sales
   - expected
   - received
   - outstanding
   - reconciled
   - exceptions
   - deposits / adjustments when present
5. Confirm the operator form is understandable without needing code knowledge.
6. Confirm the seller/family account selector is clear.
7. Record one small QA cash turn-in, such as **$2.50**, with a reason such as:
   - `Operator UI review — partial cash turn-in`
8. Confirm:
   - received increases by $2.50
   - outstanding decreases by $2.50
   - reconciled increases by $2.50
   - recorded sales do not change
   - issued ticket counts do not change
   - the immutable money history shows the new receipt
9. Review the operation selector and confirm the choices for check outcome, deposit, exception handling, refund, credit, and adjustment are understandable.
10. On desktop, note any label or explanation that feels confusing, overly technical, or easy to misuse.

## Family / captain walkthrough

1. Sign out of the admin account.
2. Sign in as the family/captain QA account.
3. Open the family fundraising campaign view.
4. Confirm:
   - only the linked family player is shown in family scope
   - money status is read-only
   - no raw receipt IDs, private notes, buyer contacts, or admin controls are visible
5. Open the team fundraising view.
6. Confirm:
   - only the assigned team is shown
   - the team player roll-up is visible
   - admin reconciliation controls and private money history are not visible
7. Attempt to navigate directly to the admin Money & reconciliation route only if convenient.
8. Confirm the family/captain account cannot use the admin reconciliation screen.

## Mobile-width review

On a phone or narrow browser window:

- open the admin Money & reconciliation page
- confirm there is no horizontal overflow
- confirm buttons, selectors, labels, and balance cards are readable
- confirm the form does not require awkward side-to-side scrolling
- confirm the family/team money summary remains readable

## Safe retry

Hosted database idempotency has already passed rollback QA and local browser E2E covers the preserved-submission retry flow.

During the operator review, confirm only that:

- the form communicates uncertainty clearly if a submission fails
- a retry control, if shown, is understandable
- the wording does not encourage the operator to create a second unrelated submission

Do not intentionally disconnect production networking or manipulate browser internals just to force this state.

## Operator acceptance questions

The reviewer should answer:

1. Can I tell the difference between a recorded sale and money the organization has actually received?
2. Can I understand what **expected**, **received**, **outstanding**, and **reconciled** mean?
3. Would I know what to do if a family turns in only part of the money?
4. Would I know what to do with a check that clears or is returned?
5. Is it clear that a returned check does not silently void a raffle ticket?
6. Is it clear that corrections, refunds, credits, and adjustments create history rather than erase it?
7. Is anything on the page confusing enough that an admin could make an operational mistake?

## Pass gate

Money hosted QA can be accepted when:

- the rendered admin workflow matches the verified backend accounting model
- the operator considers the terminology understandable
- family/captain UI remains scoped and redacted
- mobile usability is acceptable
- no blocker-level workflow or permission defect is found

After acceptance, update `docs/PROJECT_STATE.md` and advance to the next approved implementation slice.
