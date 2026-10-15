# Seller Sharing implementation and operator QA

This feature creates nonbinding requests only. It never takes payment, holds tickets,
issues entries, or writes sales/custody/drawing facts. The existing authenticated sale
RPC remains the only handoff. Status completion separately references an authorized,
non-reversed sale for the same tenant, campaign and participant. A table-level
completion constraint and association trigger independently enforce that scope. Terminal statuses
cannot be rewritten; original request bodies and status events are immutable.

## Seller operation

Open My fundraising → raffle → linked player → Share fundraiser. The server creates
a 256-bit random token and stores only SHA256. Copy, SMS, email, WhatsApp, preview,
and downloadable QR use that URL. QR generation runs locally; no QR service receives
the token. Tokens are shown once and intentionally are not stored in browser storage.
Save the link yourself; returning to the page and generating a replacement revokes
that account's previous link for this player. Each linked guardian can have their
own active link. Revoke any saved seller link works even after navigation/reload.
Rotation/revocation preserves history and requests. Links expire at sales close.

Public identity is organization/campaign only. No participant aliases or consent
settings are introduced. Current active guardian, membership, family permission,
player/enrollment status, campaign window and link validity are checked on every
public lookup/submission. Captains gain no supporter contact access from team scope.
Current linked family can follow up on household requests, including a co-guardian's
requests; removed family access immediately loses the inbox. Organization managers
can inspect/revoke through authorized database operations; no broad role is added.

Private requests show at most 200 newest records, including retained requests after
link revocation. Mark contacted, declined or expired as appropriate. For a real sale:
receive approved offline cash/check, use Record sale, verify the issued ticket result,
then Link sale and complete request. Prefilled contacts/quantity/notes remain editable
and all existing availability, full-price, state, scope and retry checks still apply.
No automatic money receipt is created. A later sale reversal does not erase request
history or automatically reopen the request; inspect the normal sale correction flow.

## Abuse and privacy

Strict field allowlist, preferred contact validation, quantity 1–100, name 200,
email 254, phone 50 and note 1,000 characters. The web handler caps streamed bodies
at 8 KiB, rejects cross-origin browser POSTs and uses a honeypot. Database validation
also applies to callers bypassing the web handler. Public responses deliberately
match for missing/revoked links, duplicates, throttling and invalid submissions.
Confirmation says "if your request can be accepted" and never promises a ticket.
Exact same-key retries and identical content within 24 hours create one request.
Changed content with an already-used key is ignored, never overwrites the original.

Durable atomic hourly limits: API-source IP 10, seller link 20, campaign 200.
IP is derived from the rightmost gateway-appended forwarded hop, never a public RPC
argument; its SHA256 digest is retained, not the IP itself. A reverse proxy/server
may aggregate supporters under one API-source IP, so the conservative IP limit may
throttle several supporters together. Verify staging gateway behavior during hands-on
QA before live outreach; don't trust a caller-selected forwarding header to relax it.
Counters serialize alongside the campaign lock; they work across workers/instances.
Rate-limited responses are deliberately generic. No CAPTCHA or paid service.

Pages are dynamic, no-store, noindex/nofollow, with no-referrer. No analytics or
public request lookup is added. Never add raw token, request-body or contact logging.
Infrastructure access logs may include URL paths: restrict provider log access and
retention, and redact `/s/*` paths in any downstream log/export tooling before launch.

## Retention and support gate

Synthetic pilot QA data only until Aspire approves a production retention schedule.
No automatic request deletion or public export endpoint exists. Preserve audit and
sale associations. Authorized organization management can review requests via the
RLS-scoped tables/RPC; support exports must be made through that permission scope,
transferred privately, and excluded from source control. Revoke the link for abuse.
Privacy deletion/redaction requests must go to the organization's support contact;
a reviewed privileged redaction migration and audit-retention decision are required,
rather than bypassing immutable history. Proposed live retention is 90 days after
campaign closure for request contact data, subject to legal/recordkeeping approval.
That approval and the redaction/export support runbook remain a launch gate, not a
claim that this hands-on QA slice is ready for real supporter data.

## Hosted QA and hands-on checklist

Keep PR #2 draft/unmerged. Existing site: aspire-raffle-hub-staging. Existing staging
Supabase only: ixhpidqhqzbpfbklofrs. Never reset or seed hosted data. The hosted lane
must apply migration `20261017000100_seller_sharing` and `20261017000200_seller_request_association_guard` before deploying the new UI.
The feature branch workflow uses existing staging GitHub secrets for Supabase and
Netlify; no new project or paid capability. The push/dispatch lane waits for the complete CI run on the exact
feature commit before applying migrations or deploying. It refuses other branches.

Review with synthetic supporters:

1. Family creates a link; copy/SMS/email/WhatsApp contain the correct link and price.
2. Scan/download QR; confirm it opens the signed-out supporter page at 360px.
3. Verify no player/team/household identity, stock, ticket numbers or balances leak.
4. Submit an interest request; confirm no ticket/sale/receipt was created.
5. Family inbox shows request; other family/captain/tenant sees no contact details.
6. Mark contacted; receive synthetic offline payment; use the ordinary sale form.
7. Verify the sale result, then separately link it and complete the request.
8. Revoke/replace the link; old link is unavailable, requests/history remain.
9. Review Toolkit scripts and safety reminders on desktop and phone.
10. Validate API-source IP aggregation/rate behavior and support procedures above.

Full regression includes pgTAP, local real concurrency groups, unit/catalog tests,
lint/typecheck, generated-type parity, production build, full browser suite including
Mailpit invitation/auth and audit continuity. Hands-on hosted approval remains required.

## Local validation, 2026-10-15

- Clean local migration/reset and seed completed; generated types match the running schema.
- All 875 pgTAP assertions pass, including 66 sharing assertions.
- All 161 unit tests, lint, typecheck and production build pass.
- All 18 real concurrency groups pass: 4 sale, 4 drawing, 5 custody, 5 sharing.
- Full seeded browser regression: 28 passed, including auth/Mailpit invitations,
  uncertain response retries, real QR decoding, signed-out privacy, ordinary offline
  sale handoff, terminal completion, revocation and 360px mobile checks.
- Audit checkpoints before/after the browser run verify prior chains extend;
  local checkpoints are unsigned (no checkpoint signing key configured).

These are local results. Check the feature commit's CI and Hosted QA Deploy run
before claiming staging is refreshed. Operator/family hands-on acceptance is pending.

## Hosted authentication

The pinned Supabase CLI 2.118 supports Management API temporary login roles. The
hosted lane uses only the existing `SUPABASE_ACCESS_TOKEN` and
`NETLIFY_AUTH_TOKEN` GitHub secrets. The lane first runs
`supabase link --project-ref ixhpidqhqzbpfbklofrs` to establish the IPv4-compatible
connection, then runs migrations and pgTAP with `--linked`; no stored database password,
connection-string secret, database-password rotation, or new hosted project is needed.
The CLI obtains temporary credentials for this existing project through its official
Management API. Full CI must still pass before any hosted migration or deploy.
