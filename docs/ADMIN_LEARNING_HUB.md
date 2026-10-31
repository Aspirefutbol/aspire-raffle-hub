# Admin Learning Hub — Product & Content Blueprint

## Purpose

Create an in-app Learning Hub that helps organization admins confidently operate Raffle Hub without relying on external instructions or support for routine tasks.

The Learning Hub should answer two questions quickly:

1. **How do I do this?**
2. **What does this screen / status / workflow mean?**

The first audience is organization admins and operators. Family/captain/seller education remains a separate Seller Toolkit experience.

## Product goals

- Reduce operator mistakes in ticket, money, reconciliation, and drawing workflows.
- Reduce support burden and repeated training.
- Make the system self-explanatory for new admins.
- Keep guidance aligned with the actual product version and pilot rules.
- Explain both *what to click* and *why the workflow works that way*.
- Surface safety/compliance warnings at the point of action.
- Provide clear recovery guidance when an admin makes or discovers a mistake.

## Recommended experience

### 1. Main Learning Hub

Add an admin-only **Learning Hub** destination in the main navigation.

Suggested sections:

- Getting Started
- Organization Setup & Roles
- Teams, Players, Households & Guardians
- Campaign Setup
- Ticket Inventory & Allocation
- Recording Offline Sales
- Reversals & Corrections
- Money Turn-In & Reconciliation
- Checks, Returned Checks & Exceptions
- Deposits, Credits, Refunds & Adjustments
- Campaign Monitoring & Reports
- Closing Sales
- Drawing Freeze, Export & External Drawing
- Result Recording & Certification
- Audit History & Recordkeeping
- Troubleshooting
- Frequently Asked Questions

### 2. Search

Admins should be able to type natural questions such as:

- How do I reverse a sale?
- Why is this money still outstanding?
- What happens if a check bounces?
- Can I reuse a voided ticket number?
- How do I correct a sale?
- Why does received money not equal recorded sales?
- How do I freeze the drawing?
- What can a captain see?
- How do I add a player?
- What happens after sales close?

Initial implementation can be keyword/search-index based. A future version may add conversational Q&A over approved Learning Hub content, but answers must remain grounded in the product documentation and current operating rules.

### 3. Contextual help

Important screens should link directly to the relevant guide.

Examples:

- Campaign Setup → “Learn how campaign readiness works”
- Inventory → “How ticket allocation works”
- Sale Reversal → “What reversal changes — and what it does not”
- Money & Reconciliation → “Understanding expected, received, outstanding and reconciled”
- Drawing → “How freeze, export and certification work”

Use small **? / Learn** links, not large help blocks that clutter operational screens.

### 4. Quick guides

Each topic should use a consistent structure:

**What this is**  
Plain-language definition.

**When to use it**  
Typical operator scenario.

**How to do it**  
Short numbered workflow.

**What happens next**  
Explain system effects.

**Important rules**  
Permissions, immutable-history, ticket, money, drawing, or compliance constraints.

**Common mistakes**  
What not to do and how to recover safely.

**Related topics**  
Links to the next likely guide.

## Initial content priorities

### Priority A — launch critical

These should exist before the Aspire operator rehearsal:

1. Create / prepare a campaign
2. Enroll players and prepare inventory
3. Record an offline sale
4. Reverse a sale
5. Record a linked correction
6. Understand ticket status and why numbers are never reused
7. Record cash/check turn-in
8. Understand partial turn-ins
9. Handle uncleared and returned checks
10. Understand expected vs received vs outstanding vs reconciled
11. Transfer a credit
12. Record a refund
13. Record an approved adjustment
14. Record deposit evidence
15. Close sales
16. Freeze the drawing population
17. Export the drawing population
18. Record external drawing results
19. Certify the drawing
20. Understand roles, family scope and captain scope

### Priority B — operator efficiency

- Roster import
- Households and guardians
- Team assignment
- Member invitations
- Dashboard interpretation
- Reports
- Audit history
- Troubleshooting access / permissions
- Safe retry / duplicate submission behavior
- Mobile operating tips

## Required content principles

- Use the same terminology shown in the application.
- Do not describe features that are not live.
- Keep Texas pilot rules explicit: offline cash/check only; no online raffle-ticket checkout.
- Do not imply that a recorded sale means the organization has received money.
- Do not imply that a returned check automatically voids a ticket.
- Do not teach admins to edit or delete immutable financial/ticket history.
- Corrections must explain reversal + fresh replacement ticket numbers.
- Drawing content must reflect external/physical drawing for the pilot.
- Explain permissions based on capability/scope rather than role-name shortcuts.
- All high-risk workflows should include a “What this does not change” note.

## Content architecture

Prefer storing Learning Hub articles as version-controlled structured content in the application repository for the pilot.

Each article should have:

- stable slug
- title
- summary
- category
- audience
- keywords
- related routes
- related article slugs
- product version / updated date
- body content

This makes help searchable, reviewable, testable, and tied to the deployed product.

Future phases may add an admin CMS, but the pilot should not introduce an editable production knowledge base before content governance is defined.

## Suggested routes

- `/o/[orgSlug]/learn`
- `/o/[orgSlug]/learn/[articleSlug]`

Optional later:
- `/o/[orgSlug]/learn/search?q=...`

Access should be limited to authenticated organization operators/admins as appropriate. Public seller education should live in the Seller Toolkit instead.

## UX direction

The Learning Hub should feel like part of the product, not a documentation dump.

Recommended home screen:

- Search bar: **“What do you need help with?”**
- **Start Here**
- **Running a Raffle**
- **Money & Reconciliation**
- **Drawing & Closeout**
- **People & Permissions**
- **Fix a Problem**
- Recent / most-used guides

Articles should be concise and scannable. Use screenshots or short annotated visuals only when they materially improve clarity.

## Future capability — grounded assistant

A future phase can add an in-product question box where an admin asks a natural-language question.

Guardrails:

- Answer only from approved Raffle Hub Learning Hub content and current organization/product context.
- Link the supporting guide(s).
- Never invent permissions, accounting rules, legal requirements, or product actions.
- For actions with financial/ticket/drawing consequences, give the documented workflow and direct the user to the actual screen rather than performing hidden mutations.
- Escalate unanswered questions to support/admin documentation review.

## Acceptance criteria

The first Learning Hub slice is successful when:

- An admin can find a launch-critical guide in two interactions or less.
- Search returns relevant help for common operator language.
- Every launch-critical operational screen links to contextual help.
- Content matches actual application terminology and pilot behavior.
- Family/captain users cannot access private admin operating content unless deliberately allowed.
- No Learning Hub action mutates campaign, ticket, money, drawing, roster, or audit data.
- Help content is version-controlled and reviewed with product changes.

## Delivery sequence

1. Capture and approve content architecture and launch-critical article list.
2. Complete Money hosted QA.
3. Build Learning Hub shell, navigation, search and article renderer.
4. Populate Priority A launch-critical content.
5. Add contextual links to operational screens.
6. Include Learning Hub in Aspire operator rehearsal.
7. Record unanswered operator questions during rehearsal and convert them into FAQ/articles.
8. Expand Priority B content after pilot findings.

## Scope boundary

The Admin Learning Hub is approved as an operator-enablement capability.

It should **not delay the current Money hosted QA gate**, and it should not be confused with the separate Parent/Player Seller Toolkit planned with Seller Sharing.
