# Issue #9 — security review packet / decision proposal (DRAFT, NOT APPROVED)
Date 2026-11-02. Source baseline integration `0a72ba4e8e1068e5648f565ae7682abb38d617dc`. Related: `issue-9-existing-seller-link-source-audit-20261102.md` and `issue-9-existing-seller-link-recovery-design.md`.

## Decision requested, not yet granted
Proposed future-issued **same-link recovery** using an isolated server-side protected secret vault with per-link authenticated encryption. Director and a designated independent security reviewer must explicitly approve the concrete storage, keys, permissions, session policy and revocation mechanism **before implementation**. The existing current SHA and READY staging must remain untouched until approval and full validation. The product-priority decision is not security approval.

## Required separation
- Existing `campaign_seller_links` rows keep hash, identity and immutable history. **Do not add plaintext or ciphertext in an existing SELECT-eligible/audit-triggered table** without review. Proposed separate private schema/table with deny-by-default privileges; no anon/authenticated SELECT, no generic service exposure, no inclusion in audit-row payload.
- Vault record binds organization, campaign, participant, **seller_user_id**, seller link ID/version, cryptographic algorithm and key identifier as AEAD associated data; wrapped/encrypted token bytes only. No user-identifying data or raw token in error/telemetry/logs.
- Key must live outside the relational database and its backups, with limited deploy-time server access; specify rotation, revocation, compromised key response, authorized operators and backup restore controls. Never commit key to GitHub or expose to client/public bundles.
- Recovery requires explicit logged-in Share action. Independently enforce exact seller ownership, valid linked guardian relationship, current account/organization status, `roster.read_own_family` and `tickets.issue`, campaign ACTIVE and within sales window, current nonrevoked/nonexpired seller link. **Organization managers must not decrypt by virtue of org-wide visibility.**
- Read-after-revoke/rotate race: design atomic/transactional current-link check and retrieval. A response racing with revocation has inherent limits after it leaves server; document linearization point and test behavior rather than promise physical revocation of copies already issued.
- Return only minimal same URL, `Cache-Control: no-store` and referrer constraints. No SSR embedding, local/session storage, query params, analytics, audit token payloads or automatic clipboard. On logout/reload clear live-tab memory; parent must explicitly request it again. Evaluate step-up authentication for sensitive recovery; not decided yet.

## Existing-link migration truth
Legacy hash-only URLs cannot be reconstructed. Parent-supplied URL may be verified against hash with authenticated ownership before re-sharing, but that cannot fix lost originals. A genuinely lost legacy link requires deliberate, warned replacement that invalidates old distribution, or waiting until campaign closure. **No silent rotation; no claim that new crypto recovers existing hashes.**

## Authorization and acceptance matrix
| Scenario | Expected |
|---|---|
| Current active seller, same session after reload/re-login | Exact same URL returned after deliberate click for a newly protected link |
| Two guardians linked to same player | Each gets only their own link; admin cannot cross-read |
| Other family/sibling or other organization | Deny, no link existence information |
| Administrator with organization.manage | Deny decryption by default |
| Guardian removed, account disabled or session expired | Deny |
| Campaign not ACTIVE, deadline past, link revoked/rotated | Deny |
| Concurrent recovery and rotation/revocation | Atomic current-link check, no resurrection or issue-on-read |
| Missing/invalid ciphertext or unavailable key | Fail closed, no auto-replacement |
| Public supporter page | REQUEST-only, zero sale/ticket/money writes |
| Audit/telemetry/DB RLS projections | No plaintext or recoverable secret material |
| 320/360/390px, keyboard, iPhone/Android | Accessible 44px controls, explicit Share distinct from Sell In Person / Requests |

## Proposed implementation sequencing (NOT authorized)
1. Independent security sign-off on key custody, separate vault/table and DB roles, algorithm/API, authorized server function, logging, session step-up, revocation transaction semantics and incident response.
2. Isolated synthetic-only implementation with fresh DB, pgTAP/RLS/permissions, concurrency/audit, lint/types/unit/build, browser and privacy leak tests. Manual per-file and full diff review; no retries hiding failures.
3. Director acceptance of unassisted phone workflow. Only then separately approve nonproduction promotion and exact-head CI/Hosted QA/login/public privacy smoke plus matching READY Netlify staging.
4. Production remains out of scope. November 19 director GO/NO-GO, November 23 conditional launch; legal, cash/check custody and drawing gates remain independent.

## Approval record (intentionally blank)
- Director design approval: **PENDING**
- Independent security owner / reviewer: **PENDING**
- Key custody/operator and rotation plan: **PENDING**
- Session step-up policy: **PENDING**
- Legacy-link UX / migration handling: **PENDING**
- Permission and DB exposure review: **PENDING**
- Authorization to implement sensitive design: **NOT GRANTED**
