# Seller Sharing & Parent/Player Seller Toolkit

_Last updated: 2026-10-15_

Implementation/QA runbook: `docs/seller-sharing-operations.md`. The implementation
uses derived active/expired state, one-time token display, immutable request bodies,
append-only statuses and explicit family/admin inbox projections. Retention/privacy
support approval and staging gateway rate-limit verification remain launch gates.

## Purpose

Give an authorized family/seller a safe, easy way to share their raffle campaign with friends and relatives while preserving the Aspire pilot rules:

- no online raffle-ticket checkout
- no public ticket reservation
- no public ticket issuance
- no public access to private family, buyer, money, roster, or audit data
- the authorized seller records the sale only after receiving an approved offline payment

The public experience is an **interest/request page**, not a purchase page.

## Primary user journey

1. A family opens **My fundraising**.
2. They select a linked player.
3. They copy or share an opaque seller link using:
   - Copy link
   - Text / SMS
   - Email
   - WhatsApp
   - QR code
4. A supporter opens the public page.
5. The supporter sees the approved campaign identity, raffle summary, ticket price, sales close date, drawing date, and seller guidance.
6. The supporter submits a nonbinding request such as:
   - name
   - preferred contact method
   - optional email or phone
   - requested ticket quantity
   - optional note
7. The system does **not** collect payment, reserve inventory, issue ticket numbers, or confirm entry.
8. The authorized family/seller follows up, receives approved offline payment, and records the sale through the authenticated seller workflow.
9. The seller can mark the request as contacted, completed, declined, or expired without rewriting sale/ticket history.

## Scope boundary

This slice includes:

- opaque seller links
- public campaign/seller request page
- request inbox for the authorized family/seller
- copy/SMS/email/WhatsApp/QR sharing actions
- parent/player Seller Toolkit
- abuse controls and privacy protections
- request status management
- request-to-record-sale handoff guidance

This slice does **not** include:

- online payment
- card/ACH checkout
- ticket reservation
- ticket issuance from the public page
- automatic sale creation
- automatic buyer receipt delivery
- public player roster/profile pages
- public leaderboards
- campaign boosts or promotional multipliers
- any change to ticket odds, price, eligibility, inventory, or drawing rules

## Public identity and consent

Public pages should default to the organization/campaign identity.

Recommended default display:

- organization name/logo
- campaign name
- campaign description/rules summary
- ticket price
- sales close date
- draw date
- support contact
- generic seller wording such as **“Support this Aspire fundraiser”**

Optional participant identity may be enabled only through an explicit, stored campaign/guardian consent decision. For the pilot, safest default is:

- do not expose player full name publicly
- do not expose team, age group, household, guardian, email, phone, sales totals, assigned tickets, or ticket span publicly
- allow an optional approved alias/first-name-only label later if consent policy is finalized

## Proposed routes

Authenticated:

- `/o/[orgSlug]/fundraising/[campaignId]`
- `/o/[orgSlug]/fundraising/[campaignId]/requests`

Public:

- `/s/[opaqueSellerToken]`
- `/s/[opaqueSellerToken]/request`

Optional protected request confirmation:

- `/requests/confirm/[opaqueRequestToken]`

Do not put organization IDs, campaign IDs, participant IDs, player IDs, household IDs, or user IDs in public URLs.

## Data model

### `campaign_seller_links`

Append-safe, revocable sharing identity.

Suggested fields:

- `id uuid primary key`
- `organization_id uuid not null`
- `campaign_id uuid not null`
- `participant_id uuid not null`
- `seller_user_id uuid not null`
- `opaque_token_hash text unique not null`
- `public_alias text null`
- `status text` — active / revoked / expired
- `created_by uuid not null`
- `created_at timestamptz not null`
- `revoked_at timestamptz null`
- `expires_at timestamptz null`

Rules:

- token values are generated server-side with high entropy
- store only a one-way hash in Postgres
- one active link may be reused or rotated by the authorized seller
- revocation creates audit evidence; do not silently reuse a revoked token
- links never grant authenticated application access

### `seller_interest_requests`

Nonbinding public requests.

Suggested fields:

- `id uuid primary key`
- `organization_id uuid not null`
- `campaign_id uuid not null`
- `seller_link_id uuid not null`
- `participant_id uuid not null` — attribution only; never returned publicly
- `request_token_hash text unique not null`
- `supporter_name text not null`
- `supporter_email text null`
- `supporter_phone text null`
- `preferred_contact text null`
- `requested_quantity integer not null`
- `note text null`
- `status text` — new / contacted / completed / declined / expired
- `completed_sale_id uuid null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`
- `completed_at timestamptz null`
- `status_changed_by uuid null`

Rules:

- request creates no inventory hold and no sale/ticket/money event
- `completed_sale_id` may link to an existing recorded sale only after the seller records it through the normal authenticated sale RPC
- request status changes are append-audited
- request contacts are visible only to the linked family seller and appropriately authorized admins
- captains do not automatically receive supporter contact information

### `seller_request_events`

Append-only request history for status changes, notes, revocation, and completion linkage.

Do not overload the financial/ticket ledgers; request events are not sales, receipts, or tickets.

## Server/database operations

Prefer RPCs for multi-record and authorization-sensitive writes.

Suggested RPCs:

- `create_or_rotate_seller_link`
- `revoke_seller_link`
- `public_seller_page`
- `submit_seller_interest_request`
- `seller_request_inbox`
- `update_seller_request_status`
- `link_request_to_recorded_sale`

### Public projection

`public_seller_page` must return a narrow projection only:

- organization/campaign public identity
- approved campaign dates/rules summary
- ticket price
- optional consented alias
- whether requests are currently open
- no internal IDs
- no contact roster
- no sales totals unless separately approved
- no ticket inventory or ticket numbers
- no private support notes

## Authorization and RLS

### Public

- no direct table access
- public page/request submission through narrow security-definer RPCs or server routes
- exact allowlist of accepted fields
- strict quantity and text length limits
- campaign must be ACTIVE and before sales close
- link must be active, unexpired, and campaign-bound

### Family seller

Can:

- create/rotate/revoke links only for currently linked family participants enrolled in the campaign
- read and manage requests only for their active seller links/current family scope
- record a sale only through the existing authorized sale RPC
- link a completed request only to a sale they are authorized to see/use

Cannot:

- broaden family scope through team/captain permissions
- view other family requests
- expose buyer data publicly
- issue tickets or reserve inventory from a request

### Admin

Authorized organization/campaign admins may:

- view request counts and operational status
- revoke abusive seller links
- inspect request history for support/audit purposes
- not manufacture a sale from a request without using the normal sale workflow

### Captain/team manager

- may see aggregate follow-up counts if approved
- should not see supporter email/phone by default
- must not gain family request contact access merely because of team scope

## Abuse and privacy controls

Required:

- rate limits per IP + seller link + campaign window
- generic success response to reduce enumeration
- duplicate/spam throttling
- honeypot and/or lightweight bot protection
- maximum quantity and text lengths
- validated email/phone formats without requiring both
- no raw public token logging
- no supporter data in public URLs
- no search indexing for public seller pages unless explicitly approved
- `X-Robots-Tag: noindex` for pilot pages
- request retention policy documented before launch
- request export/delete/support procedure documented

Do not add CAPTCHA unless abuse proves it necessary; start with low-friction controls suitable for family sharing.

## Sharing UX

Authenticated seller card should include:

- **Share fundraiser** primary action
- Copy link
- Text message
- Email
- WhatsApp
- Show QR code
- Preview supporter page
- View requests
- Revoke/replace link under a secondary menu

Suggested share copy:

> I’m helping raise funds for Aspire. Raffle tickets are $5 each. Use this page to let me know how many you’d like, and I’ll follow up with payment and ticket details.

Do not say **Buy now**, **Purchase**, **Checkout**, **Reserve tickets**, or **Your entry is confirmed** on the public request experience.

## Public page content

Recommended sections:

1. Organization/campaign header
2. Why the fundraiser matters
3. Ticket price and key dates
4. Simple request form
5. What happens next
6. Raffle rules / eligibility link
7. Support/contact information

Required notice near the request action:

> This request does not reserve or issue raffle tickets. Your seller will follow up to confirm payment and provide ticket information.

## Seller request inbox

Seller-facing inbox should show:

- supporter name
- requested quantity
- preferred contact method
- request age/time
- status
- contact action shortcuts
- **Record sale** handoff
- completed sale reference after linkage

Suggested statuses:

- New
- Contacted
- Completed
- Declined
- Expired

Status changes should not edit the original request body.

## Record-sale handoff

From a request, **Record sale** may prefill:

- buyer name
- email/phone
- quantity
- request reference in notes

It must not:

- bypass ticket availability checks
- bypass campaign state/date rules
- bypass family scope
- bypass full-face-value validation
- bypass idempotency
- create payment/custody evidence

After a successful sale, the seller may link the request to that sale in a separate authorized operation.

## Parent/Player Seller Toolkit

Add a lightweight toolkit beside sharing tools.

### Start here

- Know your goal
- Share with people you already know
- Explain what the fundraiser supports
- Follow up respectfully
- Do not promise a ticket before payment and sale confirmation
- Never post private ticket numbers or buyer details publicly

### Suggested messages

Text:

> Hi! I’m helping Aspire raise funds through our raffle. Tickets are $5 each. This link lets you tell me how many you’d like, and I’ll follow up with payment and ticket details: [link]

Follow-up:

> Just checking back on the Aspire raffle. No pressure—sales close [date]. I’m happy to help if you’d like tickets.

Thank-you:

> Thank you for supporting Aspire! I’ve received your payment and will send/confirm your ticket details through our approved process.

### Selling checklist

- Share your link
- Follow up with interested supporters
- Receive approved offline payment
- Record the sale in Raffle Hub
- Confirm ticket details
- Turn money in according to club instructions
- Check your outstanding balance

### Safety / integrity reminders

- Never reuse a voided ticket number
- Never record a sale before approved payment is received
- Never create a second sale because a submission result is uncertain—use the preserved retry
- Requests do not guarantee tickets
- Money turned in is separate from recorded sales

## Analytics

Pilot analytics should remain operational and privacy-conscious:

- active seller links
- link opens (aggregate)
- new requests
- request-to-recorded-sale conversion
- average response time
- expired/declined requests

Do not create public seller rankings or expose supporter identities in analytics dashboards.

## Testing

### Database / authorization

- opaque token lookup returns only narrow public projection
- expired/revoked link denied
- inactive/closed campaign denied appropriately
- cross-tenant link/request denial
- unlinked family cannot create/manage link
- combined captain/family roles do not broaden family scope
- admin support access remains permission-bound
- public request creates no sale, ticket allocation, ticket event, money event, custody event, or drawing change
- duplicate/idempotent request submission behavior defined and tested
- request completion links only to an authorized existing sale

### Browser

- family generates/rotates a link
- copy/SMS/email/WhatsApp actions contain correct URL and compliant wording
- QR renders and resolves
- public page works signed out at 360px
- request submission confirmation clearly states nonbinding status
- request appears only in authorized family inbox
- Record sale handoff prefills but still executes normal sale workflow
- completed request links to sale
- captain cannot see private request contacts
- revoked link stops working
- no horizontal overflow at 360px

### Security

- rate-limit behavior
- enumeration resistance
- token entropy/hash storage
- no supporter data in logs/URLs
- noindex response header/meta
- CSP/current web-security compatibility

## Acceptance gate

Seller Sharing is accepted when:

- a family can safely generate and share an opaque link
- a signed-out supporter can submit a nonbinding request
- the request never reserves or issues a ticket and never collects payment
- the authorized seller can view/follow up and use the normal sale workflow
- family/admin/captain scopes remain correct
- public privacy and abuse controls pass
- mobile UX passes
- Seller Toolkit guidance is available beside the sharing workflow
- CI, pgTAP, concurrency/regression checks, and hosted QA are green

## Implementation order

1. Schema/RPC/RLS and pgTAP tests
2. Public projection and request route
3. Family link management and request inbox
4. Share actions + QR
5. Record-sale handoff
6. Seller Toolkit content
7. Browser/security tests
8. Hosted QA
9. Operator/family review

Keep PR #2 draft/unmerged unless the project state explicitly advances the release gate.
