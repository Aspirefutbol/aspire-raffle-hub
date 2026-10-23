# Parent sharing safety candidate — October 23, 2026

## Scope and starting point

Integration baseline: `5838f4eabeeed70fff3716e5bd7c354a0cdf96b5`. PR #2 remains draft and unmerged. Its CI and hosted QA passed, and staging has 28 migrations. This candidate is UI/test-only; no migration, changed price policy, permissions, real-family data, production release, or new paid service.

## Parent experience

- Before a link exists in the current page session, Get my sharing link explains that a newly created link replaces any prior link/printed QR for the same seller and player. A confirmation offers Cancel with no request to the server.
- Once a link is available, Copy link and Copy message are the primary actions. SMS, email, WhatsApp, supporter preview and locally generated QR remain available.
- Replacement and revocation sit under Link settings and require explicit confirmation. Existing supporter requests, sales, issued tickets and financial history are unchanged.
- A rapid double tap sends one mutation. Once a mutation is confirmed, old displayed links, QR codes and manual-copy text are cleared; they are not treated as valid while the outcome is uncertain.
- A lost response offers recovery instead of falsely displaying an obsolete link. Creating a recovery link intentionally replaces any possibly active link. Nothing is automatically retried.
- Clipboard failures display selectable text; QR failures give an actionable message. Async copy/QR results for an old URL cannot repopulate a replaced link.
- Raw tokens remain session-only UI state, not browser storage or analytics. Existing server/database authorization and link-generation behavior are unchanged.

## Regression coverage

The existing real, local-only sharing journey retains privacy, supporter request idempotency, no-sale-on-interest, normal offline sale handoff, captain contact isolation, QR decoding, revocation and cross-origin checks. It additionally checks cancelling creation/replacement/revocation, double taps, copying a complete message, denied clipboard access, and a deliberately lost replacement response followed by recovery. Screenshots are retained in Playwright test output.

The isolated workflow runs the unchanged baseline check/database/browser gates against disposable local Supabase, with no hosted database or Netlify credentials and read-only repository permissions. Source is ordinary committed files; no generated patch or automatic integration write is used.

## Acceptance status

Candidate prepared; automated verification pending at preparation time. Do not read this document as a pass. Record the exact workflow run/commit and inspect mobile screenshots before promotion. After promotion, exact integration CI and hosted QA are still required. The signed-in hosted package/mobile walkthrough and observation of real parents using synthetic data remain outstanding. Production remains NO-GO.
