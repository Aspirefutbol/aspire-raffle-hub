# Calendar sharing and confirmations — isolated checkpoint

This batch follows Marc's approval to prioritize personal calendar sharing and donor confirmations. No live sending, production configuration, new grants or link recovery are enabled.

## Implemented

- `?view=family` on the existing exact synthetic preview route displays the fictional player's progress, Share My Calendar, Copy Link, QR/download, email and WhatsApp invitation controls, and an English/Spanish confirmation sample.
- Invitations are explicitly labeled DEMO. The shared URL points to the donor demonstration, never a family/admin route. Query parameters and fragments are not copied. No seller token is created, rotated, persisted or recovered.
- Copy/share failure provides manual text. Native-share cancellation does not claim a message was sent. QR codes are generated locally; no donor data is sent to a QR service.
- TEST confirmation content reconciles day values, 1x–5x multiplier, base/additional impact/total, rejects invalid or duplicate days and header injection, and escapes HTML.
- A server-only `settleAndQueueCalendarTestConfirmation` boundary verifies the signed TEST event via the existing settlement orchestrator, reloads the committed private PAID record, checks tenant/campaign/player/reservation/amount, and invokes an injected atomic outbox adapter. It has no public route or email provider.
- A deterministic reservation-scoped notification key supports duplicate event handling. A settlement replay still attempts enqueue, so a crash between settlement and queue can be recovered. The supplied production adapter must enforce durable uniqueness and payload consistency; an in-memory test double is NOT production deduplication.

## Still required before real sharing or email delivery

1. Reviewed adult authorization, consented public player display, revocable personal calendar URL issuance and retrieval. PR #15 remains separate; no legacy hash-only link recovery is bypassed.
2. Authorized private paid-record loader and durable outbox implementation with atomic unique keys, retry/dead-letter handling and a tested recovery sweep for paid records missing an intent.
3. Approved transactional sender/domain, authenticated sending configuration, TEST-recipient allowlist and delivery tests. Do not use a personal Gmail account or load real donor recipients into this preview.
4. Provider-side idempotency or an explicit duplicate-handling strategy for the send/ack crash window. Queue uniqueness alone is not an exactly-once email guarantee.
5. Capture donor language and receipt email at the reviewed checkout boundary; validate refund behavior and access for any receipt URLs. Stripe receipts and the branded thank-you are separate configuration/tests. No tax-deductibility claim is made.
6. Private family notifications require a current authorized guardian lookup; donor contact information must never enter shared links, QR codes, public progress, logs or third-party analytics.

## Validation

Added unit tests for content, URL boundaries, paid-only notification preparation, tenant mismatch, webhook tampering/LIVE rejection, duplicate event keys and queue-failure recovery; added browser tests for native sharing, copy fallback, actual QR decoding, EN/ES and 320/390/768/1024 px layouts.

Locally, the dependency-free content module passed strict TypeScript compilation and 28 direct runtime assertions. Full repository lint/types/unit/database/browser checks remain the GitHub CI gate; the existing synthetic preview workflow waits for that gate. No hosted database migrations are part of this batch.

## Batch 1 — confirmation outbox contract (November 7, local only)

`lib/calendar/notification-outbox.ts` defines the contract a durable outbox must satisfy. It is TypeScript only: no migration, route, provider, sending, Stripe, sharing, auth or deployment change. Passing its tests proves the contract's rules, not durable storage or exactly-once email.

- **Key and templates.** The reservation key is unchanged (`calendar:test:<org>:<reservation>:donor-confirmation:v1`); `v1` names the purpose and is never bumped for wording. The template version is stored on the intent. A wording change re-prepared for an already-queued reservation returns `already_queued` and keeps the original content; it never creates a second confirmation. Bump `CALENDAR_DONOR_CONFIRMATION_TEMPLATE_VERSION` whenever wording changes.
- **Payload consistency.** Intents are built only by `prepareCalendarDonorConfirmationIntent` from a trusted committed PAID record. Adapters recompute both digests. An existing key with any changed delivery-critical fact (scope, recipient, language, days, multiplier, amounts), or changed content under the same template version, fails with `PAYLOAD_CONFLICT`; nothing is overwritten. Errors carry fixed codes only.
- **States.** `PENDING → SENDING → SENT | PENDING | DELIVERY_UNCERTAIN | DEAD_LETTER`; `DELIVERY_UNCERTAIN → SENT | PENDING (new epoch) | DEAD_LETTER` only by a recorded reviewer. SENT and DEAD_LETTER are terminal. **SENT means provider acceptance with a provider message id, not inbox delivery.**
- **Leases.** Claims issue a fresh lease id; acknowledgements are fenced by the current lease id, so a stale worker cannot complete a re-claimed attempt. Lease expiry, timeouts and ambiguous responses are UNKNOWN outcomes, never "not sent".
- **Retries.** Definitive retryable rejections back off `min(cap, base·2^(n-1))` up to `maxAttempts`, then DEAD_LETTER. Unknown outcomes retry only while the configured provider idempotency window (minus a safety margin) still covers the epoch; window `0` means every unknown outcome is held. All attempts in an epoch send the same hashed provider idempotency key; a reviewer's "not accepted" resolution starts a new epoch and key. No provider is selected; Resend's documented 24-hour retention is used only as a test example.
- **Claim-time recheck.** After any unknown outcome in an epoch, a claim is refused and the intent moves to DELIVERY_UNCERTAIN if `now + lease + margin` would pass the window (anchored to the epoch's first attempt; repeated timeouts never extend it) or if the worker's provider account differs from the epoch's. Retries always deliver the stored payload with the same provider idempotency key, never a re-rendered template.
- **Reviewer authorization.** Manual resolution records the reviewer id it is given; the contract does not authorize it. The durable adapter must derive the reviewer from the authenticated session and check a specific review permission for the organization.
- **Recovery sweep.** `sweepMissingCalendarDonorConfirmations` takes candidates from an injected trusted source as hints only, rejects other tenants before loading, reloads each through the same PAID loader, rebuilds the intent through the same preparation, and enqueues under the same key. It only reads and enqueues. Repeated and overlapping sweeps are idempotent.
- **Reference adapter.** `createInMemoryCalendarOutboxForTests` is test-only, refuses `NODE_ENV=production`, and is not imported by application code (asserted by a test).

Still required: the durable Postgres outbox (Batch 2, not approved), a worker, provider/sender/domain, TEST-recipient allowlist, bounce/complaint handling, and database/browser/device gates.

## Batch 2A — durable outbox in Postgres (isolated, CI-only; not integrated)

Implements proposal revision 2.2 (`docs/calendar/batch2a-outbox-proposal-rev2.2.md` @ `25c6dbb`), independently reviewed on issue #30, plus the director's decisions there: Vault required with no fallback (K1), and reviewer appointers separated from reviewers (D2e). Migration `20261110000100_calendar_notification_outbox.sql`.

- **Scope.** Seven `calendar_private` tables and 29 functions. **No grants** to `anon`, `authenticated` or `service_role`; RLS on with no policies. No worker, provider, sender, route, Stripe change or hosted migration. Identities (D1), the reviewer call path and allowlist/appointment management are Batch 2B.
- **Integrity.** The database rebuilds facts from the locked PAID reservation, recomputes both Batch 1 digests itself (golden vectors pin TS↔SQL byte identity), and re-verifies the stored payload before releasing it to a worker.
- **Privacy.** Conflicts are detected with per-row salted, Vault-keyed HMAC fingerprints, which survive the 30-day payload purge. Key format: canonical Base64 of exactly 32 bytes. A missing or invalid key fails closed. Outbox rows are never deleted.
- **Refunds and locking.** One lock order (reservation → outbox row → audit lock). Claim, acknowledge and expiry never lock reservations. Refunds before or during sending are held for review or flagged `sent_after_refund`. Future refund/wrapper code is gated on rules N1–N4.
- **Reviewers.** Explicit per-organization, expiring designations; MFA (`aal2`) and two different reviewers for an epoch restart are fixed in code; no platform-admin bypass; appointers can never be reviewers (enforced at write time and check time). Every decision writes an append-only event and a 1:1-linked, hash-chained `audit_events` row.
- **Tests.** `supabase/tests/calendar_notification_outbox.test.sql` (pgTAP), `lib/calendar/notification-digest-vectors.test.ts` (Node golden vectors), `lib/calendar/notification-outbox.db.test.ts` (real multi-session concurrency on the local CI database; "no deadlock observed" is evidence, not proof).
