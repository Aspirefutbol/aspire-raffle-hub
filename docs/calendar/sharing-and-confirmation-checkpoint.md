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
