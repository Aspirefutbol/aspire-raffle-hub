# Issue #9 source audit — existing seller links (2026-11-02)

**Scope:** read-only inspection of integration SHA `0a72ba4e8e1068e5648f565ae7682abb38d617dc`; no implementation approval, no schema/security change. Companion to [design decision record](issue-9-existing-seller-link-recovery-design.md). File/line references below are from this exact commit.

## Confirmed source/data flow

1. **Authentication/action gate** — `lib/sharing/actions.ts:6-15`: `manageSellerLink` uses `orgAction(..., "roster.read_own_family",...)` plus explicit `tickets.issue`, authenticated Supabase client and `manage_seller_link` RPC. The action currently returns `token` only on new issuance and does not expose a recovery method.
2. **Database creation and revocation** — `supabase/migrations/20261017000100_seller_sharing.sql:65-83`: `manage_seller_link` validates `can_manage_seller_participant`, family read permission for creation, locks the campaign record, revokes the caller's previously active links, requires an ACTIVE/open campaign, generates 32 random bytes encoded as 64 hex chars, stores `sha256(token)` in `opaque_token_hash`, and returns plaintext token once. A revocation action returns only `revoked:true`. Existing transaction semantics should be checked in any concurrent revision.
3. **Storage and scoping** — same migration `:2-10,33-63`: link row contains organization/campaign/participant/seller user IDs, hash, expiry and revocation; one-active unique index covers **(participant_id, seller_user_id)**, not just participant, so two authorized guardians could hold distinct links for the same participant. RLS SELECT uses `can_manage_seller_participant`, which also allows `organization.manage` for scoped metadata access. Existing row-change audit trigger and immutable-history trigger require explicit security review before adding any recoverable secret column.
4. **Public request validation** — same migration `:85-100,105-128`: `public_seller_page` hashes the bearer token for lookup, requires nonrevoked/unexpired link, active/open campaign, active organization/player/participant and active seller membership/guardian relationship. Anonymous request submission returns a generic accepted response under invalid/revoked conditions. Public route uses a separate publishable Supabase client without inherited authenticated session (`lib/sharing/public.ts:1-17`). **Never use public validation as authorization for parent recovery.**
5. **Parent UI** — `components/sharing/seller-tools.tsx:20-35,72-109,139-205`: URL is kept in React state/ref only, not restored on reload. Parent must explicitly confirm Create/Revoke; Create replaces and invalidates previous links and QR codes. Quick share uses native share or clipboard for *already-held* URL only. A first-time save/send reminder and explanatory fallback are present. `ParentQuickShareContext` registers only the current live-tab function.

## Security-design findings

- **Critical: legacy hash-only cannot be recovered.** Existing seller URLs still in parents' messages can be revalidated if supplied voluntarily; lost URLs have no plaintext from which recovery can be performed. New encrypted storage cannot retroactively recover them. Never claim otherwise or silently rotate.
- **Critical: distinguish `participant_id` and `seller_user_id`.** Multi-guardian/dual-role scenarios mean “recover my link” must select the current authenticated seller's *own* link, not the first active link for that player or a link belonging to another guardian. An administrator who can read link metadata **must not** inherit decrypt capability.
- **Critical: do not put recoverable token material in the existing RLS SELECT row.** It currently permits authorized metadata reads, including organization managers, and `audit_row_change` sees inserted/updated row values. Any proposed ciphertext storage must be separated and audited for privilege and trigger data exposure. This is a design constraint, not a chosen storage implementation.
- **Critical: use current revocation/expiry and identity checks at time of recovery.** Recovery must never re-enable revoked links or return previously valid but now expired/ineligible URLs. Handle concurrent rotation/recovery with an explicit transaction/isolation test; require negative cross-org, second guardian and admin cases.
- **Important: link creation currently requires `tickets.issue`.** Do not expand permissions or merge a new recovery capability into a broader role without explicit authorization and RLS review.
- **Important: action error text currently mentions replacement on failed confirmation.** Any proposed new flow must avoid encouraging destructive rotation following a recoverable read failure. No UI change is implemented in this audit.

## Existing synthetic coverage reviewed

`supabase/tests/seller_sharing.test.sql`: test actors include distinct families, shared-family guardian, unlinked member, org-wide admin, second organization, and mixed roles; checks hash-only storage, public privacy, denied other-family/other-org operations, guest access, immutable link identity, guardian removal invalidation, and request/sale separation.  
`e2e/sharing.spec.ts`: tests single-link creation, confirmation cancellation, rapid double-tap guard, same-live-tab share/clipboard flow, manual fallback, public REQUEST, QR/mobile targets, offline sale handoff, rotation and revocation. **No true after-reload original URL recovery can pass with current storage design.**

## Additional exact-head tests to design (do not falsely mark implemented)

1. Two distinct authorized guardians of the *same* participant each re-share **only their own** still-valid link after re-login; no leakage of sibling or other guardian's URL.
2. Admin with `organization.manage` can view allowed metadata but **cannot** recover any parent's plaintext URL unless explicitly approved and scoped (default: deny).
3. Stale session, revoked membership, archived guardian link, disabled seller, closed/expired campaign, revoked or rotated link: no recovery.
4. Concurrent Recover/Rotate/Revoke: cannot return link if revocation wins; no new issuance from a read; unchanged money, ticket, inventory and audit-ledger balances.
5. New protected secret is never exposed in RLS projections, audit rows, SSR, telemetry, errors, logs, browser persistence, or public anonymous responses.
6. On page reload, recovery requires explicit parent action, returns the exact same URL/token for newly protected links, then cleanly falls back to manual share if clipboard is denied.
7. 320/360/390px controls at least 44px, visible keyboard focus, no hidden confirmation and no confusing Share versus Sell In Person/Requests.

## Status/approval gate

This is **source-backed reconnaissance only**, not completed solution implementation or security certification. Design approval still required for key custody, per-seller authorization, storage placement, step-up/session policy, migration of newly issued links, incident response, expiry/deletion, and concurrency semantics. No source code, migration, token storage, audit policy, production configuration or hosted staging was changed. CI is not a substitute for formal approval. Retain November 19 GO/NO-GO and November 23 conditional launch; do not cut gates to meet date.
