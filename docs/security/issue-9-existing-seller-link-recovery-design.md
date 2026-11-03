# Issue #9 — Returning-parent existing seller-link recovery: security decision record (DRAFT)

Status: **DESIGN / THREAT MODEL ONLY — NOT APPROVED FOR IMPLEMENTATION**  
Baseline: nonproduction integration `0a72ba4e8e1068e5648f565ae7682abb38d617dc`.  
Target checkpoints: Director GO/NO-GO 2026-11-19; conditional launch 2026-11-23.  
Director product direction: prioritize ability to re-share the **same still-valid seller URL** after re-login/reload. This **does not approve** storage, key, policy or schema changes.

## Current constraint and a critical incompatibility

Current link secrets are stored hash-only. One-way hashing cannot reproduce an original bearer URL. **Existing legacy links cannot be recovered from their hashes**. A secure recovery feature can only (1) return the same original URL if the parent supplies it for explicit verification, or (2) recover a URL originally captured under a separately approved protected design at creation. Do not advertise legacy links as recoverable. Do not silently invalidate existing distributed links or QR codes.

## Options for security review (none implemented)

1. **Parent-supplied original URL revalidation (lowest storage risk):** On a deliberate, authenticated action, parent pastes their previously saved URL. Server verifies its token against the existing hash and checks current tenant/campaign/seller entitlement, expiration and revocation. The browser may share that user-supplied URL in the live tab. It cannot fix a genuinely lost link; do not retain in local/session storage or logs.
2. **Envelope-encrypted recovery for newly issued links (requires explicit approval):** On initial link creation, preserve existing hash verification and store a *separate* authenticated-encrypted representation of the token. Protect wrapping keys outside the DB; strictly limit decryption to authenticated server-only handler; verify tenant, parent/seller ownership, campaign active status, current link identity and nonrevocation *before* returning token. Store a link-version/identifier binding as authenticated data so stale ciphertext cannot be substituted. Design and review key rotation, errors, migrations, backup access, rate limiting, operator permissions, and emergency revocation. **Not retroactive** for hashes already stored.
3. **Deliberate replacement with old-link revocation (existing fallback):** Only after explicit clear confirmation; existing shared URLs/printed QR codes become invalid. Never auto-replace on opening Share or re-login.

**Provisional recommendation for decision review:** option 2 for *future issuance* if security owner approves key custody and narrow endpoint, paired with option 1 for parents who still hold an existing original URL. For genuinely lost legacy URLs, show honest inability to recover and offer explicitly confirmed replacement, not transparent auto-rotation. This recommendation is not authorization.

## Required proposed request flow

- Only after explicit parent click **Share Raffle** in an authenticated, current session.
- Server checks tenant and family authorization plus seller/player/campaign ownership, link active/current version, expiration, revocation, campaign lifecycle and privilege scope before any retrieval.
- Response is `Cache-Control: no-store`, never embedded in SSR HTML or navigable query parameters. No token in server/client logging, telemetry, error reporting, audit event payloads, third-party share preview, clipboard except on explicit user action, or local/session storage. Display/select/copy only within current live user interaction. Review browser history, referrer, and QR exposure.
- An audit event records only actor, link record ID/version, scope, action, result, timestamp and request correlation ID; **never plaintext, ciphertext or derivable link token**.
- Revalidate entitlement on each recovery; reject disabled account, wrong household, cross-tenant and stale session. Never bypass existing RLS; use least-privilege server access with ownership checks and deny-by-default semantics.
- Existing public supporter URL remains REQUEST-only with no automatic financial/ticket issuance. Revocation/rotation must preserve one active current link semantics and remain atomic under concurrent share/rotate/revoke.
- UI preserves Progress First, one-active-campaign direct entry, and separately labeled Share / Sell In Person / Requests. Accessible 44px minimum targets at 320/360/390px and visible focus/keyboard navigation.

## Threats and approval questions

| Threat | Mitigation to specify and independently test |
|---|---|
| Stolen parent session or shared device | Session re-auth/step-up policy for recovery, idle timeout, no-store, logout cleanup, explicit action |
| Cross-family or cross-tenant access | Server-side authorization + negative RLS/privacy tests; no parent-controlled lookup alone |
| DB dump/backups | AEAD encryption, external key custody, separation of duties, rotation/revocation plan |
| Secret exposure by logs/monitoring | Redaction contract with negative assertions and sanitized audit |
| Replay after rotation/revocation | Current link version binding, transactional checks and concurrent tests |
| Misbinding ciphertext to another seller | Authenticated associated data for tenant, seller and link ID/version |
| Abuse/rate exhaustion | Rate limits and alert thresholds without logging secrets |
| Legacy hash-only URLs | Explicit non-recoverability; user-supplied verification or knowingly confirmed replacement |

**Security approval required before source implementation:** choose exact recovery design, whether step-up authentication is required, key custody and operational recovery ownership, storage lifetime and deletion, scope of decrypt access, handling of preexisting lost links, logging/redaction, and incident-response/key-compromise procedure. Director and designated security reviewer must explicitly approve. Do not use production Supabase, production deployment, credentials, billing, payment methods or real family/payment data.

## Evidence and gates

- First, inspect actual seller-link issuance, hash lookup, share endpoint/UI, revoke/rotate, RLS and audit code and write an explicit data-flow map with file/line references. This document records *requirements*, not a completed source audit.
- Synthetic isolated tests: authorized same-link retrieval twice across reload/relogin; denial to sibling/other family/tenant; revoked/rotated/expired/suspended campaign; multiple-device/session invalidation; concurrent decrypt/revoke; malformed ciphertext and key rotation; absent token in HTML, headers, logs and audit; public supporter REQUEST-only and zero Share financial writes.
- Full from-scratch migrations, generated type parity, pgTAP/RLS/security, concurrency/audit, lint/types/unit/build and retry-free browser acceptance at exact isolated head; file/diff review; do not weaken assertions or increase timeouts to mask failures.
- **No promotion without separate design approval**. After any approved nonproduction promotion: exact-head normal CI, Hosted QA login/public privacy smoke and matching published READY Netlify staging. PR #2 stays draft/unmerged.
- Human/legal/operational GO gates remain independent: unassisted parent phone testing, Texas raffle legal authority and rules, approved cash/check custody, physical drawing process, director production-readiness authorization.

## Decision requested

Approve or reject **a specific security design**, not simply the product goal. If approval or evidence is unavailable by November 19, mark the November 23 launch at risk and retain the verified hash-only save/reuse fallback rather than bypassing gates.
