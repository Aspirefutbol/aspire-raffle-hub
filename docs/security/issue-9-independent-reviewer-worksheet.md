# Issue #9 — independent application-security reviewer worksheet

**STATUS: REQUEST FOR REVIEW, NOT AUTHORIZATION TO IMPLEMENT.** Prepared 2026-11-02. Please review alongside [source audit](issue-9-existing-seller-link-source-audit-20261102.md), [threat model](issue-9-existing-seller-link-recovery-design.md) and [approval packet](issue-9-recovery-approval-packet-20261102.md).

**Scope.** Parent desires one-tap reuse of the **same still-valid seller URL** after re-login or reload, without invalidating invitations/QR codes already shared. Existing tokens are 32 random bytes, stored only as SHA-256; historical URLs cannot be reconstructed from those hashes. Encryption is under consideration for **future-issued** links only. Public supporter links are for **nonbinding ticket requests**, not payment, purchase, reservation or ticket issuance.

## Actual source locations at baseline `0a72ba4e8e1068e5648f565ae7682abb38d617dc`

- `supabase/migrations/20261017000100_seller_sharing.sql:2-10`: hash-only `campaign_seller_links` table; unique active links keyed by `(participant_id,seller_user_id)`.
- Same migration `:33-50`: family/organization metadata visibility with RLS (may include an organization manager); this **is not authority to decrypt another seller's link**.
- Same migration `:53-83`: immutable row audit, `SECURITY DEFINER` creation/revocation; plaintext returned only on new link creation.
- Same migration `:85-100`: bearer-token public lookup and campaign/guardian checks; never use this public route to authorize private recovery.
- `lib/sharing/actions.ts:6-15`: authenticated Next server action currently calls the RPC.
- `components/sharing/seller-tools.tsx:20-35,72-109,139-205`: React-memory-only secret, explicit destructive replacement dialog, share and copy.
- `lib/sharing/public.ts:7-16`: isolated publishable-key public client; no inherited auth.
- `supabase/tests/seller_sharing.test.sql`, `e2e/sharing.spec.ts`: existing synthetic regression foundation. A separate **draft-only** co-guardian link ownership regression is proposed; its independent CI result must be checked.

## Questions requiring reviewer's written response

**A. Storage/cryptography**
1. Should retrievable tokens be stored in a separate private schema/table, inaccessible via authenticated/anon SELECT, PostgREST and generic RPC? If not, what prevents existing RLS metadata/admin reads and row-change audit from exposing recoverable token material?
2. Recommend vetted AEAD algorithm, per-record nonce and key identifier, authenticated associated data fields (organization, campaign, participant, **seller_user_id**, link ID/version) and versioned ciphertext format. How is nonce uniqueness and ciphertext substitution prevented? No custom crypto.
3. Where is the data-encryption key and any wrapping key held **outside DB and backups**? Who can use, rotate, revoke, restore or access it? How are key-loss and compromised-key incidents handled? No secrets in repo, CI logs, or browser.
4. What is the retention/erasure model for ciphertext when campaign closes, seller loses guardianship, tokens are revoked and backups age out? Do ledger/audit requirements conflict?

**B. Authentication/authorization**
5. Is recovery constrained to the **exact authenticated seller_user_id** in the link row (not mere participant/household visibility), tenant, active guardian association, both family and ticket permissions, active campaign/window, current unrevoked link and valid session? How should shared-family guardians be handled?
6. Should recovering the link require recent sign-in or step-up? Set a specific freshness/device/session policy that balances parent phone usability with risks of stolen sessions. Do not presume a password re-prompt is available for all login methods.
7. Must organization administrators/managers and support personnel be denied all raw URL recovery by default? What narrowly reviewed emergency path, if any, exists? No admin decryption by privilege inheritance.

**C. Revocation/response safety**
8. How are concurrent recovery/revoke/rotate linearized atomically with the existing `manage_seller_link` transaction? **Actual code detail:** on `p_revoke=true`, a caller with `organization.manage` can revoke *all* active links for one participant, even when multiple guardians each own separate URLs (migration `20261017000100_seller_sharing.sql:72-80`). Specify how a concurrent administrator emergency revoke invalidates recovery for *both* guardians without granting the administrator decryption or exposing which seller's URL existed. Specify precise check/return boundary. No read should issue a new token or resurrect a revoked one; acknowledge that already-returned copies cannot be physically erased.
9. Which server endpoint design ensures authenticated POST + origin/CSRF protection, no-store/private/non-referrer handling, redaction of Next action payloads, Netlify/provider path logs, APM and error reports, and no SSR, browser local/session storage or automatic clipboard? Verify these controls rather than assuming Next/Supabase defaults.
10. What abuse monitoring/rate limits, audit redactions and fail-closed errors are sufficient without collecting bearer tokens? How are blocked requests distinguished without enumeration?

**D. Legacy support and launch**
11. Existing hash-only URLs genuinely lost cannot be recovered. Is parent-supplied original URL verification (ownership-bound) acceptable as a separate low-risk feature, or should launch use first-time-save guidance and deliberate replacement only? Explicitly document which options will *not* work for lost links.
12. Is this design safe to implement in isolated synthetic-only QA before 2026-11-19, or should the conditional 2026-11-23 launch use the **existing hash-only flow** with unassisted parent testing and an explicit director exception decision? No assurance is implied by the schedule.

## Return format (for independent reviewer)

- Reviewer identity/role and date:
- Assessment: **APPROVE / APPROVE WITH REQUIRED CHANGES / REJECT / INSUFFICIENT EVIDENCE**
- Highest-risk findings (severity, exact code path, abuse scenario, required mitigation):
- Agreed key custody/crypto design:
- Agreed seller-specific authorization and session policy:
- Agreed revocation transaction and fail-closed path:
- Required test proofs and operational controls:
- Remaining unanswered blockers:

**No software, migration, RLS, encryption, secrets, staging or production changes are authorized by this worksheet.** A written reviewer opinion and director sign-off remain separate gates. No credentials, token URLs, encryption keys or family/payment records should be emailed or posted to the PR.

## November 7 independent source-review addendum — uncertain operations and operator handoff (F1/F2)

**Evidence level:** The observations below describe integration baseline `0a72ba4e8e1068e5648f565ae7682abb38d617dc`, **not** Claude's reported, locally unpushed follow-up (`db33fda`/`e0e8d7d`). These are review/test requirements, not approval for changing SQL, RLS, auth, encryption, keys, or link storage. Review the *actual new pushed diff and exact-head CI* before applying any decision to follow-up code.

**F1 — An unqualified "Disable" retry cannot be promised safe.** `lib/sharing/actions.ts:6-15` sends `{p_organization_id,p_participant_id,p_revoke}` without a particular `campaign_seller_links.id`, expected link version, or operation idempotency key. `supabase/migrations/20261017000100_seller_sharing.sql:65-83` updates **all currently active matching links**, then returns `{"revoked":true}` even if no row changed. Therefore a response cannot prove which link was revoked, whether any was revoked, or whether a later retry would hit a newer link. A timeout may occur after the database committed. Do **not** automatically reissue/rotate on uncertain **Create** or automatically repeat **Disable**; never instruct parents that repeat Disable is harmless until an independent reviewer explicitly approves the exact semantics and tests. A plain guardian's repeated disable after a newly issued link can also disable that new link.

**F2 — A guardian who also has `organization.manage` invokes broad revocation.** The same SQL permits a `p_revoke=true` caller with `organization.manage` to revoke all co-guardians' currently active links for the participant. A user with that admin role **and** `roster.read_own_family` + `tickets.issue` can satisfy the ordinary `manageSellerLink` Next-action checks while the RPC uses the broader administrator branch. This must be treated as **existing, intentionally broad emergency capability**, not an ordinary seller "disable my link" guarantee. No attempt to fix its sensitive role policy is approved here.

**Required independent acceptance evidence before any new support/parent retry guidance:**
- Distinguish confirmed creation, uncertain creation, confirmed disable and uncertain disable in unit/E2E copy. A lost response must not be shown as a confirmed outcome; never auto-rotate, auto-retry or show an unconfirmed URL/QR.
- Two independent synthetic guardians for one player: ordinary seller's disable/rotation affects only their own link; a manager+guardian dual-role case documents current *all-guardian* effect and blocks any blanket "repeat Disable safely" promise; another organization remains isolated.
- Simulate server commit + lost response, duplicate taps, concurrent new Create versus repeated Disable, and administrator emergency revocation. Check public URL validity, audit rows and immutable request/ticket/money ledgers after each order of events. No assertion or timeout weakening.
- A proposed support escalation may investigate **read-only** authorized status/audit, but cannot assert the original hash-only secret was retrieved, disclose bearer links, or use emergency all-guardian revocation as routine support. Operator actions must be attributed, access-scoped and auditable.
- The proposed `mailto:info@aspirefootballclub.com` support address needs a real tappable/focus-visible link with a >=44px target at 320/360/390px. Verify its domain in the actual November campaign's published support contact and copy before approving; do not claim it is already staged from a local patch.
- Name the primary and backup raffle support operators, same-business-day ordinary request owner, immediate suspected-misuse escalation owner, and separately approved **emergency** revoke runbook. Until named and approved, these are **operational launch gates**, not implemented guarantees.
- Review exact changed-file list and stacked ancestry (#17 → #18 → any new Claude PR), full first-attempt database/pgTAP/RLS/concurrency/audit, lint/types/unit/build, retry-free E2E and unassisted phone acceptance. Nonproduction staging only after separate approval and exact-head Hosted QA + published READY deploy.

**Open decision for the independent reviewer:** Does the current SQL/API contract offer any defensible "Disable can be safely repeated" product claim, particularly with admin+guardian dual-role and interleaving Create? If not, specify approved conservative parent copy and read-only support triage **without** introducing sensitive implementation. Security-review acknowledgment and director approval remain separate; neither is recorded by this note.
