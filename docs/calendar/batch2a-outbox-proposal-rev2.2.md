# Aspire South Calendar — Batch 2A: durable confirmation outbox (revision 2.2, complete)

**Document type:** complete design and security proposal, for the final independent review before implementation
**Status:** NOT APPROVED FOR IMPLEMENTATION. Direction approved conceptually by Marc. Nothing here has been implemented, migrated, executed or pushed.
**Prepared:** 2026-11-09 by Claude (implementation lane)
**Revises:** revision 2.1 (`docs/calendar/batch2a-outbox-proposal-rev2.1.md` @ `38428689`), following ChatGPT's independent review on issue #30 (comment 6752846853). Revision 2.1 itself built on revision 2, which addressed the six findings on revision 1.
**This revision (2.2):** answers each issue #30 finding in §0.5. It fixes the fingerprint key format, makes the audit coverage check robust to malformed data, adds independently computed golden vectors (§4.3), narrows the deadlock claim to what can actually be shown, and adds explicit gates for refund code and 2B identity. **Unchanged from 2.1:** Marc's decisions as fixed rules (§0.4, §14), and §17's **verification focus** on four areas:
1. the refund/claim locking model (§17.1)
2. recipient fingerprints and key management (§17.2)
3. two-person authorization (§17.3)
4. audit-event integrity (§17.4)

**Self-contained:** this document includes all of revision 2; no other document is needed.
**Repository:** `Aspirefutbol/aspire-raffle-hub`
**Baseline:** `feat/calendar-fundraiser-aspire-south` at `3d3a639352e32a7295d62453128fd0a90d9f2566` (Batch 1 integrated; PR #19 CI run 42558696194 green)

> **The SQL here is a reviewed specification, not tested code.** It was written against the schema at `3d3a639`, but no Postgres was available in the preparing environment, so it has not been parsed or executed. CI's local database is the first place it will run.

---

## 0. What changed in this revision

### 0.1 The six required corrections

| # | Review finding | Change | Section |
|---|---|---|---|
| 1 | Define canonical serialization; enforce digest integrity, not just hash format | The canonical byte format is now specified exactly, matching Batch 1. **The database recomputes both digests itself**, rejects any intent whose digests differ, and stores only its own values. Claim re-verifies the stored payload before releasing it. Golden vectors are shared by the TypeScript and SQL tests. | §4 |
| 2 | Explicit org-scoped reviewer authorization; address the platform-admin bypass and identity handling | Reviewer rights are explicit per-organization designations in an append-only table, and they expire. The check **never calls `has_org_permission` or `is_platform_admin`**. Identity comes only from `auth.uid()`, checked against live membership on every call. MFA (`aal2`) is required by default. | §5 |
| 3 | Refund-versus-claim and refund-versus-acknowledgement concurrency | Refund-aware claim, acknowledge and lease expiry. One lock order: only enqueue and language recording lock a reservation. **This also fixes a deadlock cycle in revision 1.** Eight refund-race scenarios are added to the concurrency test. | §6, §11.3 |
| 4 | Durable evidence and an audited reason for manual resolution, especially epoch restarts | Every resolution requires an allowlisted reason, an evidence kind, an evidence reference and the epoch the reviewer examined. **An epoch restart needs provider evidence, an explicit acknowledgement of duplicate risk, a still-PAID reservation, and a second, different reviewer.** Each decision is written to the append-only event log and to the organization's hash-chained `public.audit_events`. | §7 |
| 5 | Keep recipient-conflict detection after purge, without keeping unnecessary personal data | Conflicts are detected with **per-row salted fingerprints** of the canonical facts and content. These survive purge. The unsalted digests, recipient and bodies are cleared at purge. This also closes a leak in revision 1: its kept `facts_digest` was an unsalted hash of the donor's email. | §8 |
| 6 | Better recovery for reservations with a missing donor language | Missing language is reported (blocked reason and backlog counts). An authorized reviewer can record the language once, with evidence and an audit entry. It is never overwritten and never guessed. Capturing it at checkout comes in 2B. | §9 |

### 0.2 Other changes

- The intent parser rejects unknown JSON keys and wrongly typed values. The recipient must match the reservation exactly; revision 1 lowercased it first.
- The TEST recipient allowlist (D6) is **enforced in the claim query from day one**. A row whose recipient is not allowlisted can never be claimed. The table is created empty.
- New hold reason: `stored_payload_integrity_failure`.
- New column `sent_after_refund` marks a send that raced a refund.

### 0.3 Unchanged, as the review asked

- private-schema architecture
- no grants by default
- the SQL state machine
- conservative retry rules (window 0: every unknown outcome is held)
- isolated CI testing

### 0.4 Changes in revision 2.1

| Area | Change | Section |
|---|---|---|
| Marc's decisions | **MFA and the two-person restart are now fixed in code**, with no policy switch to turn them off. Reviewer appointment by designated Aspire directors only; platform staff only when explicitly authorized for the organization; allowlists managed by designated Aspire administrators (2B); no language fallback; 30-day retention. | §5, §7, §14 |
| Fingerprints | **Keyed** fingerprints replace plain salted hashes: `HMAC-SHA256(K_v, salt ‖ ':' ‖ canonical)`, with versioned keys held in Supabase Vault, never in migrations or Git. They fail closed when a key is unavailable. Rotation, compromise and loss are specified. | §8, §10.3, §10.6, §17.2 |
| Locking | Full lock inventory and ordering proof, now including the audit hash-chain's advisory lock and foreign-key share locks. Purge now uses `SKIP LOCKED`. Calendar functions require `READ COMMITTED`. **One decision per transaction.** A future refund must use `FOR NO KEY UPDATE`. | §6.2, §17.1 |
| Two-person rule | At approval the requester must **still** be a current reviewer. The approver must explicitly acknowledge the evidence and the duplicate risk. Concurrent approvals are serialized. | §7.2, §17.3 |
| Audit integrity | Each audit row carries the id of its source event (1:1 link). New `verify_notification_audit_coverage(org)` reports missing, orphaned or duplicated audit rows. `public.audit_context()` is included, as the existing writers do. | §10.7, §10.13, §17.4 |
| Tests | Key-management, two-person, audit-coverage and new lock-order scenarios. | §11 |

### 0.5 Responses to the independent review (issue #30)

The review recommended approving with corrections and holding implementation authorization. Each item:

| # | Finding | Disposition | Change in 2.2 | Section |
|---|---|---|---|---|
| 1 | `v_now` undeclared in enqueue | **Not reproduced.** In 2.1, `v_now timestamptz := clock_timestamp();` is the third declaration of `enqueue_donor_confirmation` (line 6 of the function, line 838 of the 2.1 document) and is used once, in the insert. **The requested test is adopted:** a mandatory pgTAP test executes enqueue on a valid PAID reservation and asserts the stored row. Since nothing has been parsed by Postgres yet, that test is what will settle it. | Test X1 | §11.2 |
| 2 | Key encoding and validation | **Accepted; this was a real defect.** 2.1 fed the Base64 *characters* into HMAC and checked only a minimum length. One key format is now defined: **canonical padded Base64 of exactly 32 random bytes (44 characters)**. The function checks the exact format, decodes it, requires 32 bytes, and returns NULL on any malformed, short, long, non-canonical or unreadable secret, so callers fail closed. **The migration aborts if Vault is absent**, so there is no silent downgrade and the question comes back for decision. | §10.3, §10.6, tests K1–K11 | §10.3, §10.6, §17.2, §11.2 |
| 3 | Prove JS↔SQL byte identity in Postgres | **Accepted.** Golden vectors are now fixed in this document (§4.3): 2 facts and 8 content vectors, covering U+2028/U+2029, U+007F, non-BMP emoji, control characters, escaping, HTML and maximum lengths. The expected hashes were computed with a **second, independent JSON implementation** (Python `json`, compact, raw UTF-8). CI must reproduce the same hex from **Node's `JSON.stringify`** (through Batch 1's own `assertCalendarIntentIntegrity`) **and** from **Postgres**: three-way agreement. A mismatch fails the build and is never normalized away. U+0000 and lone surrogates are negative tests. | §4.3, tests G1–G4 | §4.3, §11.1 |
| 4 | Narrow the deadlock claim | **Accepted.** The claim is now: lock ordering *argued* for 2A's functions, **conditional on N1–N4**; tests show **no deadlocks observed** in the tested interleavings, which is not proof over all schedules. **Future refund and 2B wrapper code is explicitly gated** on a reviewed N1–N4 compliance check plus its own concurrency tests. | §6.2, §17.1, §1.1, §14 | §6.2, §11.3, §17.1 |
| 5 | Trusted auth context at the 2B call boundary | **Accepted as a 2B gate.** New §12.3: reviewer functions may only ever be granted to `authenticated` (reached through PostgREST with a verified JWT), never to a login role that could set `request.jwt.claims` itself. A 2B test must prove a worker connection that forges claims is refused. Separate identities and re-checking designation and payment status at approval are already enforced in 2A (T1, T3, T8). No grants in 2A. | §12.3 | §12.3, §17.3 |
| 6 | Retention, recovery and coverage robustness | **Accepted.** `verify_notification_audit_coverage` no longer casts unchecked metadata. Malformed or missing source ids are reported as `malformed_audit_metadata` instead of throwing or hiding a gap. New tests for replay after purge combined with a template change, with key rotation and with key loss. Helpers stay ungranted; grants are duty-scoped in 2B. | §10.13, tests P1–P4, A1–A2 | §10.13, §11.2 |
| K1 | Vault-keyed HMAC, no silent fallback | **Adopted.** The fallback to unkeyed salted fingerprints is **removed**. If Vault is unavailable in CI or in an approved hosted environment, implementation stops and returns to the director. | §17.2, §14 | |
| — | Appointer versus reviewer separation | **Routed to the director as D2e.** The review recommends separating the appointing director from day-to-day review in that organization. Already enforced: no self-appointment (CHECK), and one person can never act as both restart reviewers (T1). | §14 | |

---

## 1. Scope

### 1.1 What Batch 2A implements, what 2B implements, and what Batch 3 implements

| Area | **Batch 2A** (this approval) | **2B** (separate approval) | **Batch 3** (separate approval) |
|---|---|---|---|
| Outbox, events, policy tables | ✅ | | |
| Canonical serialization and DB-side digest recomputation | ✅ | TypeScript↔SQL parity in the adapter | |
| Enqueue, claim, acknowledge, expire, status functions | ✅ (no grants) | Grants to the D1 identities | Worker calls them |
| Refund-aware claim, ack and expiry; lock-order rule | ✅ | | The real refund function must follow the rule (§6.2) |
| Reviewer designation table and check function | ✅ (no grants; table empty) | Functions to grant and revoke designations; reviewer UI or wrapper | |
| Resolution with evidence, two-reviewer restart, audit entries | ✅ (no grants) | Reviewer UI | |
| Salted fingerprints and payload purge | ✅ (not scheduled) | | Schedule the purge |
| `supporter_language` column; record-language function; backlog report | ✅ (no grants) | `reserve()` captures the language at checkout; sweep skip reason | |
| TEST recipient allowlist table, enforced at claim | ✅ (table empty) | Functions to manage the allowlist | |
| Fingerprint key table, keyed fingerprints, fail closed without a key | ✅ (CI tests create a throwaway key) | | Hosted key provisioning: separate approval and runbook |
| Appointing reviewers (designated Aspire directors only); allowlist management (designated Aspire administrators) | ❌ | ✅ | |
| Settlement and worker database roles (D1) | ❌ | ✅ | |
| Refund function, 2B wrappers, worker: **gated** on an independent N1–N4 lock-order check and their own concurrency tests (§17.1) | ❌ | ✅ (gated) | ✅ (gated) |
| PAID-snapshot loader SQL function | ❌ | ✅ | |
| TypeScript Postgres adapter; contract amendment (drop `now` and `reviewerId` from the interface) | ❌ | ✅ | |
| Worker, email provider, sender domain, DNS, bounces | ❌ | ❌ | ✅ |
| Any hosted (staging or production) migration | ❌ | ❌ | separate approval |

### 1.2 Not touched by Batch 2A

- `app/`, `components/`, `lib/sharing/` and `lib/calendar/stripe-test-*`
- `reserve()` and every other existing calendar function
- `package.json`, `package-lock.json`, `.github/workflows/`, `netlify.toml`
- PR #15, the option (b) personal-link design, `main` and `feat/phase-1-fundraising-slice`

---

## 2. Facts from the codebase that shape the design

| Fact at `3d3a639` | Design consequence |
|---|---|
| Batch 1 digest = `sha256(JSON.stringify(array))` over a fixed-order array. Facts are 15 elements, the 11th being the days array; content is 4 elements. | SQL reproduces the same bytes (§4). No Batch 1 change is needed. |
| `assertCalendarIntentIntegrity` recomputes digests in TypeScript, but its helpers are not exported | The golden-vector test can drive the public `assertCalendarIntentIntegrity` with known hex values, so no export is needed. |
| `public.has_org_permission()` returns **true for every platform admin** | The reviewer check must not use it (§5). |
| `public.platform_admins`, `public.organization_members` (`status`) and `public.organizations` (`status`) exist | The reviewer check reads live membership. |
| `public.audit_events` is append-only and hash-chained per organization (`zz_audit_events_hash_chain`). `security definer` functions insert into it directly. CI's audit checkpoint verifies the chain. | Manual decisions are mirrored there for tamper evidence (§7.3). |
| `public.hash_chain_append()` only works on `public` tables | `calendar_private.notification_events` is append-only but not hash-chained. The hash-chain evidence lives in `audit_events`. |
| **No refund function exists.** `REFUNDED` appears only in constraints and read models. | Refund races are tested with a simulated refund transaction. §6.2 sets the locking rule a future refund function must follow. |
| `reservations.supporter_email` is stored lowercased by `reserve()`. There is no language column. | Exact recipient match; language column added (§9). |
| `calendar_private` is not exposed through PostgREST | Workers need direct connections, and reviewers need a reviewed wrapper (2B). |

---

## 3. Architecture and lifecycle

```
verified TEST settlement (exists, no grant) ─► trusted TS: load PAID snapshot, prepare intent (Batch 1)
        │
        ▼
enqueue_donor_confirmation(intent)            locks reservation FOR SHARE, then the outbox row
   • parses strictly; rebuilds facts from the reservation
   • RECOMPUTES both digests; rejects any mismatch; stores its own digests and salted fingerprints
        │
        ▼
notification_outbox (one row per reservation, never deleted)
   ├─ claim_donor_confirmation(worker, provider_account)      outbox row only (SKIP LOCKED)
   │     • allowlisted recipients only (D6) • reservation PAID? • stored payload intact? • window and provider
   ├─ acknowledge_donor_confirmation(key, lease, outcome…)    outbox row only; refund-aware
   ├─ expire_donor_confirmation_leases()                      outbox rows only; refund-aware
   ├─ resolve_donor_confirmation(… reason, evidence, epoch)   explicit org reviewer; evidence required
   ├─ approve_epoch_restart(key, request, epoch)              a SECOND reviewer
   ├─ record_supporter_language(reservation, lang, evidence)  reservation only; set once
   ├─ read_donor_confirmation_status / read_confirmation_backlog / list_missing_donor_confirmations
   └─ purge_donor_confirmation_payloads()                     final rows; keeps salted fingerprints
notification_events (append-only) ─ mirrored decisions ─► public.audit_events (hash chain per org)
```

### 3.1 Lifecycle

`SENT` and `DEAD_LETTER` are final. Every transition is one Batch 1 allows.

| From | Event | To | Reason / rule |
|---|---|---|---|
| (none) | enqueue | `PENDING` | Reservation `PAID`, language known, every fact and both digests verified |
| `PENDING` | claim: recipient not allowlisted | `PENDING` | Never selected. Stays queued and harmless (D6). |
| `PENDING` | claim: reservation not `PAID` | `DELIVERY_UNCERTAIN` | `reservation_no_longer_paid` (D3) |
| `PENDING` | claim: stored payload fails digest re-verification | `DELIVERY_UNCERTAIN` | `stored_payload_integrity_failure` |
| `PENDING` | claim after an unknown outcome; window elapsed or 0 | `DELIVERY_UNCERTAIN` | `idempotency_window_elapsed_before_retry` |
| `PENDING` | claim after an unknown outcome; other provider account | `DELIVERY_UNCERTAIN` | `provider_changed_after_unknown_outcome` |
| `PENDING` | claim | `SENDING` | Database lease id; stored payload returned |
| `SENDING` | ack `accepted` | `SENT` | `sent_after_refund = true` if the reservation is no longer `PAID` |
| `SENDING` | ack `rejected_permanent` | `DEAD_LETTER` | `rejected_permanent` |
| `SENDING` | ack `rejected_retryable`; reservation not `PAID` | `DELIVERY_UNCERTAIN` | `reservation_no_longer_paid` |
| `SENDING` | ack `rejected_retryable` | `PENDING` / `DEAD_LETTER` | backoff / `retry_exhausted` |
| `SENDING` | ack `unknown` or lease expiry; reservation not `PAID` | `DELIVERY_UNCERTAIN` | `reservation_no_longer_paid` |
| `SENDING` | ack `unknown` or lease expiry | `PENDING` / `DELIVERY_UNCERTAIN` | Batch 1 unknown-outcome rules |
| `DELIVERY_UNCERTAIN` | reviewer: accepted, with provider evidence | `SENT` | §7 |
| `DELIVERY_UNCERTAIN` | reviewer: abandon, with evidence | `DEAD_LETTER` | `abandoned_after_review` |
| `DELIVERY_UNCERTAIN` | reviewer A requests a restart, with evidence | `DELIVERY_UNCERTAIN` | Restart request recorded |
| `DELIVERY_UNCERTAIN` | reviewer B (≠ A) approves the restart | `PENDING` | New epoch → new provider idempotency key |
| `SENT` / `DEAD_LETTER` | purge after retention | unchanged | Payload and unsalted digests cleared; fingerprints kept |

---

## 4. Canonical serialization and digest integrity (finding 1)

### 4.1 Canonical byte format (normative)

Both digests are `lowercase_hex(SHA-256(UTF-8 bytes of C))`, where C is a compact JSON array with no whitespace. This is exactly what Batch 1's `JSON.stringify` produces today.

**Facts array, 15 elements, in this order:**

```
[ key, kind, mode, organizationId, campaignId, participantId, reservationId,
  recipient, language, currency, [day1,day2,…], multiplier, baseCents,
  additionalImpactCents, totalCents ]
```

**Content array, 4 elements, in this order:**

```
[ templateVersion, subject, text, html ]
```

**Encoding rules:**

1. **Separators.** `,` between elements and `[`/`]` around arrays. No spaces.
2. **Strings.** A JSON string per ECMAScript `JSON.stringify`:
   - escape `"` as `\"` and `\` as `\\`
   - escape U+0008, U+000C, U+000A, U+000D and U+0009 as `\b \f \n \r \t`
   - escape every other code point below U+0020 as `\u00xx` (lowercase hex)
   - leave everything else unescaped, including `/`, U+007F, non-ASCII letters and U+2028/U+2029
3. **Integers.** Base-10, no sign for non-negative values, no leading zeros, no exponent, no decimal point. All values are far below 2^53.
4. **UUIDs.** Lowercase canonical text, 8-4-4-4-12. This is what Postgres outputs, and it is what the loader must pass through unchanged.
5. **Days.** Ascending, unique, integers 1–31.
6. **Recipient.** Exactly as stored in `reservations.supporter_email` (already lowercased by `reserve()`). No further normalization on either side.
7. **Text validity.** Strings must be valid Unicode. Postgres `text` cannot hold lone UTF-16 surrogates, so an intent containing one fails at insert as `INVALID_INTENT`.

### 4.2 Enforcement at the trusted boundary

The **database is the final trusted boundary**, because it is the only writer of the outbox.

1. **Enqueue builds the facts array from the locked reservation row**, not from the intent: scope, recipient, language, sorted days, multiplier and amounts. It also builds the content array from the intent's template version, subject, text and html.
2. **It computes both SHA-256 digests itself.** If either differs from the intent's `factsDigest` or `contentDigest`, it raises `INVALID_INTENT` and writes nothing. A mismatch means tampering or TS/SQL serialization drift. Either way, refusing is correct.
3. **It stores only its own digests**, and derives the salted fingerprints from the same canonical strings (§8).
4. **Claim re-verifies the stored payload.** Before releasing a row, claim recomputes both digests from the stored columns. On mismatch the row is held as `stored_payload_integrity_failure` and nothing is returned. That catches any write that bypassed the functions.
5. **Defence in depth (2B).** The TypeScript adapter still calls `assertCalendarIntentIntegrity` before calling enqueue.

### 4.3 Golden vectors (three independent implementations must agree)

**Source of truth.** Each vector's canonical bytes follow §4.1. The expected SHA-256 values below were computed by an **independent implementation** of those rules: Python's `json.dumps(value, ensure_ascii=False, separators=(",", ":"))`, encoded as UTF-8. For valid Unicode it escapes exactly as ECMAScript `JSON.stringify` does: `"`, `\\`, the short forms `\b \f \n \r \t`, other code points below U+0020 as lowercase `\u00xx`, and nothing else.

**Agreement required in CI** (implementation step; a failure blocks the build and is never "fixed" by changing payloads):

1. **Node.** `lib/calendar/notification-digest-vectors.test.ts` runs each vector through Batch 1's own code: an intent built with these exact strings and the constant digests must be accepted by `assertCalendarIntentIntegrity`, and rejected after any one-character change.
2. **Postgres.** pgTAP asserts that `outbox_facts_canonical`/`outbox_content_canonical` followed by `outbox_sha256_hex` return the same constants, and that the canonical byte length (`octet_length(convert_to(..., 'UTF8'))`) equals the table's value.
3. **This table**, the independent reference.

**Inputs** (written as ASCII JSON with `\u` escapes so they are unambiguous; the canonical form uses the decoded characters as raw UTF-8). C8 is `[T, "S"×300, "t"×20000, "h"×100000]` with `T = "calendar-donor-confirmation/2026-11-07.1"`.

```json
{
"F1": ["calendar:test:11111111-1111-4111-8111-111111111111:44444444-4444-4444-8444-444444444444:donor-confirmation:v1","calendar_donor_confirmation","test","11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444","donor@example.test","en","usd",[7],1,700,0,700],
"F2": ["calendar:test:11111111-1111-4111-8111-111111111111:55555555-5555-4555-8555-555555555555:donor-confirmation:v1","calendar_donor_confirmation","test","11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","55555555-5555-4555-8555-555555555555","donante+prueba@example.test","es","usd",[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31],5,49600,198400,248000],
"C1": ["calendar-donor-confirmation/2026-11-07.1","Thank you","Thank you for sponsoring day 7.","<p>Thank you for sponsoring day 7.</p>"],
"C2": ["calendar-donor-confirmation/2026-11-07.1","\u00a1Gracias!","Patrocin\u00f3 el d\u00eda 7. \u00bfPreguntas?","<p>\u00a1Gracias! Patrocin\u00f3 el <b>d\u00eda 7</b>.</p>"],
"C3": ["calendar-donor-confirmation/2026-11-07.1","He said \"hi\"","path\\to/file \\\\ end","<a href=\"/x/y\">a\\b</a>"],
"C4": ["calendar-donor-confirmation/2026-11-07.1","tab\there","line1\nline2\r\nline3\b\f\u0001\u001f end","<p>ab</p>"],
"C5": ["calendar-donor-confirmation/2026-11-07.1","x\u2028y","p1\u2029p2 del\u007fend","<p>\u2028</p>"],
"C6": ["calendar-donor-confirmation/2026-11-07.1","\u26bd Goal! \ud83c\udf89","Gracias \ud83d\ude00 \u2014 d\u00eda 31 \ud83c\udfc6","<p>\ud83c\udf89</p>"],
"C7": ["calendar-donor-confirmation/2026-11-07.1","Tom & Ana","<script>alert(1)</script>","<p>Tom &amp; Ana &lt;3 <script>x</script></p>"]
}
```

| Vector | What it covers | Canonical bytes | SHA-256 |
|---|---|---|---|
| F1 | one day, 1×, `en` | 354 | `9a328211277fcd1e52889caaf6fd448591bf7c37ef7fe557620d0d0aecd121ac` |
| F2 | all 31 days, 5×, `es`, plus-addressed recipient | 455 | `f4dbbc350b676747d72ae1232b7b9cb44fb3183f76d10a5f988c1bbddc0cab43` |
| C1 | plain ASCII | 131 | `257c4e3869ca092780a2574bbae129c80af977679f52093ede9b9c5b1e9aac82` |
| C2 | Spanish accents, `¡` and `¿` | 143 | `ac1de67b6bbf8866837ad11ccacdf3ef3bcab5a0fa767576e78694dcca7b3e78` |
| C3 | `"`, `\`, `/` | 114 | `c3e16b36a478a07e811e2a034001feb42728842fa8a7db4f6a50005887262537` |
| C4 | `\t \n \r \b \f`, U+0001, U+001F | 112 | `dfd6bcefdd7107a96d46348ce6a184108a854f47f1f11ee217306a6e7a4f0586` |
| C5 | U+2028, U+2029, U+007F (all unescaped) | 83 | `7000ae7dff172cf141bb4eae76a27ba26fd2db521908390652d81c7671adf272` |
| C6 | non-BMP emoji (surrogate pairs in UTF-16) | 107 | `c417cb50583225a167cbfffbd04aaf0c62297cbeb17430d2a2768962fcb589f1` |
| C7 | HTML entities and `<script>` text | 132 | `5bbdfcda8d2aa331945c9d4a39df418d0c4c7d2777dadb2ad334634ebdad8a4f` |
| C8 | maximum lengths: subject 300, text 20000, html 100000 | 120353 | `dafdf437f8938a9bb464318112170dd9974e3143b9b1fdf5bfc73e7d79cd5050` |

**Negative vectors** (must be rejected, never hashed): a string containing U+0000 (Postgres `text` cannot store it), and a lone UTF-16 surrogate (`JSON.stringify` would escape it as `\udxxx`, but it can't round-trip through Postgres). Both must end as `INVALID_INTENT` with no row written.

**Not yet verified:** these constants have not yet been checked against Node or Postgres. Neither was available when this revision was prepared. The CI agreement above is the first time they are compared.

---

## 5. Explicit organization-scoped reviewer authorization (finding 2)

### 5.1 Model

- **Designations.** Reviewer rights are rows in `calendar_private.notification_reviewer_events`, an append-only log of `GRANTED` and `REVOKED` events per (organization, user). A user's latest event decides their current state.
- **Every grant expires.** `expires_at` must fall within 366 days of the grant; 2B's grant function will default to 180 days, so access has to be re-certified.
- **Two bases**, both always explicit for one organization:
  - `org_member`: the user must currently be an **active member** of that **active** organization.
  - `platform_staff`: the user must currently be in `public.platform_admins`, **and** must have been explicitly designated for that organization. Being a platform admin alone grants nothing.

### 5.2 The check

The check is `calendar_private.is_notification_reviewer(org)`.

- **Identity** comes only from `auth.uid()`, the `sub` of the JWT verified by the platform. No function takes a reviewer id parameter. If there is no session, the answer is `false`.
- **MFA is mandatory** (Marc's decision). The JWT's `aal` claim must be `aal2`. This is fixed in the function, with no policy setting that could switch it off.
- **Stale tokens are safe.** Membership, organization status, platform-admin status, the designation and its expiry are all read live at call time. A JWT issued before someone was removed or revoked does not help them.
- **No bypass.** The check never calls `public.has_org_permission` or `public.is_platform_admin`, so the existing platform-admin shortcut does not apply.
- **No information leak.** Every denial raises the same `NOT_AUTHORIZED`, whether the key is unknown, belongs to another organization, or the user is not a reviewer.

### 5.3 What 2A does and does not include

- **2A creates the designation table empty and adds no way to write to it.** Only CI tests, running as the owner, insert designations.
- **2B adds the appoint and revoke functions**, under Marc's decisions:
  - **Only designated Aspire directors may appoint or revoke reviewers.** A separate, explicit list of appointers is proposed in §17.3; organization-admin permissions do not qualify.
  - **Platform staff may review an organization only when explicitly appointed for it** (`platform_staff` basis). Being a platform admin never qualifies on its own.
  - Nobody can appoint themselves; a CHECK constraint already exists.
  - Appointers must use MFA.
  - Every change is written to `audit_events`.

---

## 6. Refund concurrency and locking (finding 3)

### 6.1 Behaviour

| Race | Result |
|---|---|
| Refund commits before claim | Claim holds the row as `reservation_no_longer_paid` and returns nothing for it |
| Refund commits after claim, then ack `accepted` | `SENT`, with `sent_after_refund = true` and event code `reservation_refunded_during_send` (the email was already out) |
| Refund during `SENDING`, then ack `rejected_retryable` | `DELIVERY_UNCERTAIN` / `reservation_no_longer_paid` (no retry) |
| Refund during `SENDING`, then ack `unknown` or lease expiry | `DELIVERY_UNCERTAIN` / `reservation_no_longer_paid` (may have been sent; a reviewer reconciles) |
| Refund during `SENDING`, then ack `rejected_permanent` | `DEAD_LETTER` / `rejected_permanent` |
| Refund before enqueue | Enqueue fails `SCOPE_MISMATCH` (not `PAID`) |
| Refund concurrent with enqueue | They serialize on the reservation lock. The other side either sees `PAID` and enqueues (claim then holds it) or sees `REFUNDED` and rejects. |
| Refund, then a restart request or approval | Refused: a restart requires a still-`PAID` reservation |

### 6.2 Lock-order rule (normative)

Locks are acquired only in the global order **reservation row (R) → outbox row (O) → organization audit lock (A)**. The full inventory and proof are in §17.1.

| Operation | Locks, in order |
|---|---|
| enqueue | R `FOR SHARE` → O (insert, or `FOR UPDATE` on replay) |
| claim, lease expiry, purge | O only, `FOR UPDATE SKIP LOCKED` (never waits). Reservation status is a **plain, unlocked read**. |
| acknowledge | O `FOR UPDATE`. Unlocked status read. |
| resolve, approve restart | O `FOR UPDATE` → A (audit insert, last). Unlocked status read. |
| record language | R `FOR UPDATE` → A (audit insert, last). No O. |
| **future refund function** (normative rule) | R `FOR NO KEY UPDATE` only; **never an O**; if it writes `audit_events`, last. |

**Further rules:**
- One decision function per transaction.
- Calendar functions run at `READ COMMITTED`; they refuse anything else.
- 2B wrappers must not make an audited `public` write before calling a calendar function in the same transaction.

**No 2A function locks an outbox row and then a reservation row**, so 2A's own paths cannot form a lock cycle among themselves. This holds only while code outside 2A follows rules N1–N4 (§17.1). Tests can show that no deadlock was *observed* in the tested interleavings; they can't prove it for every schedule.

**Why revision 1 was wrong.** Claim locked the outbox row and then the reservation `FOR SHARE`. Postgres queues a new row lock behind a waiting conflicting one. With enqueue holding the reservation share lock, a refund waiting for `FOR UPDATE`, and enqueue waiting on the claimed outbox row, claim's share request would have queued behind the refund: a cycle, and a deadlock error.

The cost of reading unlocked is a small window: a refund can commit between claim's status read and the send. That is the "refund during send" case above. It is detected at acknowledgement and recorded, which is the same result locking could guarantee once the email has left anyway.

---

## 7. Evidence and audit for manual resolution (finding 4)

### 7.1 Required inputs

`resolve_donor_confirmation` takes the following. None of them is free text, so no personal data can be typed into the record.

- `p_resolution`: `provider_confirmed_accepted`, `provider_confirmed_not_accepted` or `abandon`
- `p_reason_code`: from an allowlist for that resolution
- `p_evidence_kind`: `provider_api_lookup`, `provider_dashboard`, `provider_support_case`, `donor_statement` or `internal_record`
- `p_evidence_ref`: an external reference such as a provider event id or support-case id. It must match `^[A-Za-z0-9._:+/-]{1,128}$`; `@` is not allowed, which keeps email addresses out.
- `p_expected_epoch`: the epoch the reviewer examined. A mismatch raises `STALE_REVIEW`.
- `p_provider_message_id`: for `accepted` only
- `p_duplicate_risk_acknowledged`: for restarts only

| Resolution | Allowed reasons | Evidence rule | Other requirements |
|---|---|---|---|
| `provider_confirmed_accepted` | `provider_reports_accepted` | `provider_api_lookup`, `provider_dashboard` or `provider_support_case` | provider message id required |
| `abandon` | `reservation_refunded`, `donor_contacted_directly`, `duplicate_risk_unacceptable`, `provider_status_unavailable`, `recipient_invalid`, `integrity_failure` | any kind, with a reference | — |
| `provider_confirmed_not_accepted` (epoch restart) | `provider_reports_not_accepted` | **`provider_api_lookup` or `provider_support_case` only** (a dashboard that shows nothing is not proof) | `p_duplicate_risk_acknowledged = true`; reservation still `PAID`; hold reason is not `stored_payload_integrity_failure`; **a second reviewer must approve** |

### 7.2 Two-person epoch restart

- **Reviewer A** submits `provider_confirmed_not_accepted`. The row **stays** `DELIVERY_UNCERTAIN` and records a restart request (request id, requester, time and epoch).
- **Reviewer B** must be different from A (`auth.uid() <> restart_requested_by`) and must be a current reviewer of the same organization. B calls `approve_epoch_restart(key, request_id, expected_epoch)` within the policy TTL (default 7 days). The reservation must still be `PAID` at that moment. Approval moves the row to `PENDING` with a new epoch.
- A different resolution by either reviewer (accepted or abandon) supersedes a pending request.
- **The two-person rule is mandatory** (Marc's decision) and coded into the functions. No setting can make a restart single-step.
- At approval, the **requester must still be a current reviewer**. The approver must explicitly acknowledge that they reviewed the evidence and accept the duplicate risk. All invariants are listed in §17.3.

### 7.3 Durable records

Every decision writes two records, both with no donor data:

1. **`calendar_private.notification_events`** (append-only): event type, epoch, reviewer user id, resolution, reason, evidence kind and evidence reference.
2. **`public.audit_events`** (append-only and hash-chained per organization; checked by CI's audit checkpoint):
   - `actor_id = auth.uid()`
   - `action` is `CALENDAR_NOTIFICATION_RESOLVED`, `CALENDAR_NOTIFICATION_RESTART_REQUESTED`, `CALENDAR_NOTIFICATION_RESTART_APPROVED` or `CALENDAR_SUPPORTER_LANGUAGE_RECORDED`
   - `entity_type = 'calendar_notification'` and `entity_id` = the reservation id
   - `metadata = {key, from_epoch, to_epoch, resolution, reason_code, evidence_kind, evidence_ref}`

---

## 8. Conflict detection after purge, with minimal personal data (finding 5)

- At enqueue, each row gets a random salt (`fingerprint_salt = gen_random_uuid()::text`, 122 random bits), the active key version `v`, and two **keyed** fingerprints:
  - `facts_fingerprint = hex(HMAC-SHA256(K_v, salt || ':' || facts_canonical))`. This covers the recipient, language, scope, days and amounts.
  - `content_fingerprint = hex(HMAC-SHA256(K_v, salt || ':' || content_canonical))`
- `K_v` is a 256-bit secret held in Supabase Vault under a versioned name. It is never in a migration, in Git or in an application environment variable. Each row records `fingerprint_key_version`, so it is always verified with the key that made it. The full key lifecycle is in §17.2.
- **Conflict detection uses only the fingerprints**, before and after purge, with identical logic. A later intent with a different recipient changes `facts_canonical`, so it changes the fingerprint and raises `PAYLOAD_CONFLICT`, even after the address has been purged.
- **Purge clears** `recipient`, `subject`, `text_body`, `html_body`, **and** the unsalted `facts_digest` and `content_digest`.
- **Purge keeps** the salt, both fingerprints, `facts` (days and amounts; no contact data), `language`, state, provider message id and history.
- **Why the change matters:** revision 1 kept the unsalted `facts_digest`. Given the row's other stored facts, that hash let anyone with database access test a guessed email, and match it across tables. The per-row salt prevents precomputed and cross-row matching.
- **What the key adds over revision 2:**
  - A stolen backup, a database dump, or read access to `calendar_private` tables **without Vault** can no longer test a guessed address, because Vault secrets are encrypted with a root key held outside the database.
  - Someone with full owner or superuser access can still read Vault, and so test a specific guess. That is no more than they can already learn by reading `reservations.supporter_email` directly (D7). The attacker classes are set out in §17.2.

---

## 9. Missing donor language: prevention, detection and recovery (finding 6)

| Stage | Mechanism | Batch |
|---|---|---|
| **Prevent** | `reserve()` records the language the donor actually chose with the EN/ES selector at checkout. Never inferred from browser headers, the organization or the player. | 2B (changes a reviewed function; separate approval) |
| **Fail closed** | Enqueue raises `INVALID_PAID_RECORD` while `supporter_language` is null. Nothing is sent in a guessed language. | 2A |
| **Detect** | `list_missing_donor_confirmations` returns `language_missing` per candidate. `read_confirmation_backlog(org)` returns donor-free counts: missing-language, missing-other, the oldest missing age, and outbox counts by state and hold reason. | 2A (2B adds the `language_missing` skip reason to the sweep report) |
| **Recover** | `record_supporter_language(reservation, language, evidence_kind, evidence_ref)`. The caller must be an explicit reviewer of the organization. The reservation must be `PAID` and its language still null; **set once, never overwritten**. Evidence kind is `checkout_record` (for example the Stripe Checkout session locale, if the app set it from the donor's choice), `donor_statement` or `internal_record`. Writes an append-only `reservation_language_events` row and an `audit_events` entry. The next recovery sweep then enqueues normally. | 2A (no grants) |
| **Optional fallback** | A bilingual EN+ES confirmation template for unknown language, so nobody has to guess. This is a product decision (D4b) and is not part of 2A. | — |

---

## 10. Proposed SQL

Proposed file: `supabase/migrations/2026MMDD000100_calendar_notification_outbox.sql`. The order below is the planned migration order.

### 10.1 Reservation language

```sql
alter table calendar_private.reservations
  add column supporter_language text
    check (supporter_language is null or supporter_language in ('en', 'es'));
comment on column calendar_private.reservations.supporter_language is
  'Donor-chosen confirmation language. NULL = unknown: no confirmation may be enqueued. '
  'Set by reserve() (2B) or once by record_supporter_language() with evidence. Never inferred.';
```

### 10.2 Policy (one row)

```sql
create table calendar_private.notification_policy (
  singleton boolean primary key default true check (singleton),
  max_attempts smallint not null check (max_attempts between 1 and 10),
  lease_interval interval not null check (lease_interval between interval '10 seconds' and interval '15 minutes'),
  retry_base interval not null check (retry_base >= interval '1 second'),
  retry_cap interval not null,
  provider_idempotency_window interval not null check (provider_idempotency_window >= interval '0'),
  idempotency_safety_margin interval not null check (idempotency_safety_margin >= interval '0'),
  payload_retention interval not null check (payload_retention between interval '1 day' and interval '400 days'),
  -- MFA for reviewers and the two-person restart are fixed in code (Marc's decisions), not settings.
  restart_request_ttl interval not null default interval '7 days'
    check (restart_request_ttl between interval '1 hour' and interval '30 days'),
  updated_at timestamptz not null default clock_timestamp(),
  check (retry_cap >= retry_base),
  check (provider_idempotency_window = interval '0'
         or provider_idempotency_window > lease_interval + idempotency_safety_margin)
);
insert into calendar_private.notification_policy
  (max_attempts, lease_interval, retry_base, retry_cap,
   provider_idempotency_window, idempotency_safety_margin, payload_retention)
values (5, interval '2 minutes', interval '30 seconds', interval '1 hour',
        interval '0', interval '1 hour', interval '30 days');
```

At implementation, the bounds are aligned with Batch 1's `validateCalendarOutboxPolicy`, and a test pins them.

### 10.3 Fingerprint keys and outbox

```sql
-- K1: Supabase Vault is required. Abort the migration if it is absent, so there is
-- no silent downgrade; the question goes back to the director.
do $$
begin
  if to_regclass('vault.decrypted_secrets') is null then
    raise exception 'Supabase Vault (vault.decrypted_secrets) is required for calendar outbox fingerprints';
  end if;
end $$;

-- Versioned fingerprint keys. Only the Vault secret NAME is stored here; the secret itself
-- lives in Supabase Vault and is never in a migration, in Git or in an app environment variable.
create table calendar_private.notification_fingerprint_keys (
  version integer primary key check (version >= 1),
  vault_secret_name text not null unique check (vault_secret_name ~ '^calendar_outbox_fp_v[0-9]+$'),
  created_at timestamptz not null default clock_timestamp(),
  activated_at timestamptz,
  retired_at timestamptz,
  check (retired_at is null or (activated_at is not null and retired_at >= activated_at))
);
-- At most one active key.
create unique index calendar_fp_one_active on calendar_private.notification_fingerprint_keys ((true))
  where activated_at is not null and retired_at is null;
-- Key versions are never deleted (rows keep referencing them).
create trigger calendar_fp_keys_no_delete before delete
  on calendar_private.notification_fingerprint_keys for each row execute function public.prevent_ledger_mutation();

create table calendar_private.notification_outbox (
  key text primary key,
  kind text not null check (kind = 'calendar_donor_confirmation'),
  mode text not null check (mode = 'test'),
  organization_id uuid not null,
  campaign_id uuid not null,
  participant_id uuid not null,
  reservation_id uuid not null unique,

  -- Payload (cleared by purge).
  recipient text check (recipient is null or length(recipient) between 3 and 254),
  subject text check (subject is null or length(subject) between 1 and 300),
  text_body text check (text_body is null or length(text_body) between 1 and 20000),
  html_body text check (html_body is null or length(html_body) between 1 and 100000),
  -- Unsalted Batch 1 digests, DB-computed (cleared by purge).
  facts_digest text check (facts_digest is null or facts_digest ~ '^[0-9a-f]{64}$'),
  content_digest text check (content_digest is null or content_digest ~ '^[0-9a-f]{64}$'),

  -- Kept for the life of the row.
  language text not null check (language in ('en', 'es')),
  facts jsonb not null check (jsonb_typeof(facts) = 'object'),
  template_version text not null
    check (template_version ~ '^calendar-donor-confirmation/[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]+$'),
  fingerprint_salt text not null check (length(fingerprint_salt) = 36),
  fingerprint_key_version integer not null references calendar_private.notification_fingerprint_keys (version),
  facts_fingerprint text not null check (facts_fingerprint ~ '^[0-9a-f]{64}$'),
  content_fingerprint text not null check (content_fingerprint ~ '^[0-9a-f]{64}$'),

  state text not null default 'PENDING'
    check (state in ('PENDING', 'SENDING', 'SENT', 'DELIVERY_UNCERTAIN', 'DEAD_LETTER')),
  next_attempt_at timestamptz,
  lease_id uuid unique,
  lease_worker_id text check (lease_worker_id is null or lease_worker_id ~ '^[A-Za-z0-9._:@<>+-]{1,256}$'),
  lease_expires_at timestamptz,
  epoch integer not null default 1 check (epoch >= 1),
  epoch_started_at timestamptz,
  epoch_attempts smallint not null default 0 check (epoch_attempts >= 0),
  epoch_unknown_outcome boolean not null default false,
  epoch_provider_account text
    check (epoch_provider_account is null or epoch_provider_account ~ '^[A-Za-z0-9._:@<>+-]{1,256}$'),
  total_attempts integer not null default 0,
  provider_message_id text
    check (provider_message_id is null or provider_message_id ~ '^[A-Za-z0-9._:@<>+-]{1,256}$'),
  sent_at timestamptz,
  sent_after_refund boolean not null default false,
  hold_reason text check (hold_reason is null or hold_reason in (
    'no_provider_idempotency', 'unknown_outcome_attempts_exhausted',
    'unknown_outcome_outside_idempotency_window', 'idempotency_window_elapsed_before_retry',
    'provider_changed_after_unknown_outcome', 'retry_exhausted', 'rejected_permanent',
    'abandoned_after_review', 'reservation_no_longer_paid', 'stored_payload_integrity_failure')),
  restart_request_id uuid,
  restart_requested_by uuid,
  restart_requested_at timestamptz,
  payload_purged_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  foreign key (reservation_id, organization_id, campaign_id, participant_id)
    references calendar_private.reservations (id, organization_id, campaign_id, participant_id),
  check (key = 'calendar:test:' || organization_id::text || ':' || reservation_id::text
               || ':donor-confirmation:v1'),
  check (total_attempts >= epoch_attempts),
  check ((state = 'SENDING') = (lease_id is not null and lease_worker_id is not null and lease_expires_at is not null)),
  check ((state = 'PENDING') = (next_attempt_at is not null)),
  check ((state = 'SENT') = (provider_message_id is not null and sent_at is not null)),
  check ((state in ('DELIVERY_UNCERTAIN', 'DEAD_LETTER')) = (hold_reason is not null)),
  check (not sent_after_refund or state = 'SENT'),
  check ((restart_request_id is null) = (restart_requested_by is null)
         and (restart_request_id is null) = (restart_requested_at is null)),
  check (restart_request_id is null or state = 'DELIVERY_UNCERTAIN'),
  check (payload_purged_at is null or state in ('SENT', 'DEAD_LETTER')),
  check ((payload_purged_at is null) =
         (recipient is not null and subject is not null and text_body is not null
          and html_body is not null and facts_digest is not null and content_digest is not null))
);

create index calendar_outbox_due_idx on calendar_private.notification_outbox (next_attempt_at, created_at, key)
  where state = 'PENDING';
create index calendar_outbox_lease_idx on calendar_private.notification_outbox (lease_expires_at)
  where state = 'SENDING';
create index calendar_outbox_org_state_idx on calendar_private.notification_outbox (organization_id, state);
```

### 10.4 Append-only logs, reviewer designations, language evidence, allowlist

```sql
create table calendar_private.notification_events (
  id bigint generated always as identity primary key,
  key text not null references calendar_private.notification_outbox (key),
  organization_id uuid not null,
  event_type text not null check (event_type in (
    'ENQUEUED', 'CLAIMED', 'ACCEPTED', 'REJECTED_PERMANENT', 'REJECTED_RETRYABLE', 'UNKNOWN',
    'LEASE_EXPIRED', 'HELD', 'RESOLVED', 'RESTART_REQUESTED', 'RESTART_APPROVED', 'PURGED')),
  epoch integer not null,
  attempt smallint,
  lease_id uuid,
  worker_id text check (worker_id is null or worker_id ~ '^[A-Za-z0-9._:@<>+-]{1,256}$'),
  provider_account text check (provider_account is null or provider_account ~ '^[A-Za-z0-9._:@<>+-]{1,256}$'),
  code text check (code is null or code ~ '^[a-z0-9_.-]{1,64}$'),
  reviewer_user_id uuid,
  resolution text check (resolution is null or resolution in
    ('provider_confirmed_accepted', 'provider_confirmed_not_accepted', 'abandon')),
  reason_code text check (reason_code is null or reason_code ~ '^[a-z0-9_]{1,64}$'),
  evidence_kind text check (evidence_kind is null or evidence_kind in
    ('provider_api_lookup', 'provider_dashboard', 'provider_support_case', 'donor_statement', 'internal_record')),
  evidence_ref text check (evidence_ref is null or evidence_ref ~ '^[A-Za-z0-9._:+/-]{1,128}$'),
  restart_request_id uuid,
  occurred_at timestamptz not null default clock_timestamp(),
  check ((event_type in ('RESOLVED', 'RESTART_REQUESTED', 'RESTART_APPROVED'))
         = (reviewer_user_id is not null)),
  check (event_type not in ('RESOLVED', 'RESTART_REQUESTED')
         or (reason_code is not null and evidence_kind is not null and evidence_ref is not null))
);
create index calendar_outbox_events_key_idx on calendar_private.notification_events (key, occurred_at);

-- Explicit, expiring reviewer designations (append-only; latest event wins).
create table calendar_private.notification_reviewer_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id),
  user_id uuid not null,
  event_type text not null check (event_type in ('GRANTED', 'REVOKED')),
  basis text check (basis in ('org_member', 'platform_staff')),
  expires_at timestamptz,
  actor_user_id uuid,
  reason_code text check (reason_code is null or reason_code ~ '^[a-z0-9_]{1,64}$'),
  occurred_at timestamptz not null default clock_timestamp(),
  check ((event_type = 'GRANTED') = (basis is not null and expires_at is not null)),
  check (expires_at is null
         or (expires_at > occurred_at and expires_at <= occurred_at + interval '366 days')),
  check (actor_user_id is null or actor_user_id <> user_id)      -- no self-designation
);
create index calendar_reviewer_latest_idx
  on calendar_private.notification_reviewer_events (organization_id, user_id, occurred_at desc, id desc);

-- Evidence for languages recorded after checkout (append-only).
create table calendar_private.reservation_language_events (
  id bigint generated always as identity primary key,
  reservation_id uuid not null references calendar_private.reservations (id),
  organization_id uuid not null,
  language text not null check (language in ('en', 'es')),
  evidence_kind text not null check (evidence_kind in ('checkout_record', 'donor_statement', 'internal_record')),
  evidence_ref text not null check (evidence_ref ~ '^[A-Za-z0-9._:+/-]{1,128}$'),
  actor_user_id uuid not null,
  occurred_at timestamptz not null default clock_timestamp()
);

-- D6: TEST recipients that may ever be claimed. Created empty; managed in 2B.
create table calendar_private.test_recipient_allowlist (
  organization_id uuid not null references public.organizations (id),
  recipient text not null check (recipient = lower(btrim(recipient)) and length(recipient) between 3 and 254),
  added_by uuid,
  added_at timestamptz not null default clock_timestamp(),
  primary key (organization_id, recipient)
);

-- Immutability.
create trigger calendar_notification_events_immutable before update or delete
  on calendar_private.notification_events for each row execute function public.prevent_ledger_mutation();
create trigger calendar_reviewer_events_immutable before update or delete
  on calendar_private.notification_reviewer_events for each row execute function public.prevent_ledger_mutation();
create trigger calendar_language_events_immutable before update or delete
  on calendar_private.reservation_language_events for each row execute function public.prevent_ledger_mutation();
-- Outbox rows are never deleted: the sweep would treat a missing row as "never queued".
create trigger calendar_notification_outbox_no_delete before delete
  on calendar_private.notification_outbox for each row execute function public.prevent_ledger_mutation();
```

### 10.5 RLS and table privileges

```sql
do $$
declare t text;
begin
  foreach t in array array['notification_policy', 'notification_outbox', 'notification_events',
                           'notification_reviewer_events', 'reservation_language_events',
                           'test_recipient_allowlist', 'notification_fingerprint_keys'] loop
    execute format('alter table calendar_private.%I enable row level security', t);
    execute format('revoke all on calendar_private.%I from public, anon, authenticated, service_role', t);
  end loop;
end $$;
-- No policies, by design: default deny for any role ever granted access by mistake.
```

### 10.6 Canonical serialization, digests and fingerprints

```sql
-- One JSON string element, as ECMAScript JSON.stringify writes it (verified by golden vectors).
create function calendar_private.outbox_json_string(p text)
returns text language sql immutable strict set search_path = '' as $$
  select to_json(p)::text;
$$;

create function calendar_private.outbox_sha256_hex(p text)
returns text language sql immutable strict set search_path = '' as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex');
$$;

-- Facts array (15 elements). Plain || so ANY null input yields NULL (no silent shift).
create function calendar_private.outbox_facts_canonical(
  p_key text, p_org uuid, p_campaign uuid, p_participant uuid, p_reservation uuid,
  p_recipient text, p_language text, p_days integer[], p_multiplier integer,
  p_base bigint, p_additional bigint, p_total bigint)
returns text language sql immutable set search_path = '' as $$
  select '['
    || calendar_private.outbox_json_string(p_key) || ','
    || '"calendar_donor_confirmation","test",'
    || calendar_private.outbox_json_string(p_org::text) || ','
    || calendar_private.outbox_json_string(p_campaign::text) || ','
    || calendar_private.outbox_json_string(p_participant::text) || ','
    || calendar_private.outbox_json_string(p_reservation::text) || ','
    || calendar_private.outbox_json_string(p_recipient) || ','
    || calendar_private.outbox_json_string(p_language) || ','
    || '"usd",'
    || '[' || array_to_string(p_days, ',') || '],'
    || p_multiplier::text || ',' || p_base::text || ',' || p_additional::text || ',' || p_total::text
    || ']';
$$;

create function calendar_private.outbox_content_canonical(
  p_template text, p_subject text, p_text text, p_html text)
returns text language sql immutable set search_path = '' as $$
  select '[' || calendar_private.outbox_json_string(p_template) || ','
             || calendar_private.outbox_json_string(p_subject) || ','
             || calendar_private.outbox_json_string(p_text) || ','
             || calendar_private.outbox_json_string(p_html) || ']';
$$;

-- Key material for one version, from Supabase Vault.
-- KEY FORMAT (the only one accepted): canonical padded Base64 of exactly 32 random bytes,
-- i.e. 44 characters, 42 Base64 characters + one of [AEIMQUYcgkosw048] + '='.
-- The DECODED 32 bytes are the HMAC key; the Base64 text never is.
-- Returns NULL (callers fail closed) when the version is unknown or never activated, the
-- secret is missing, malformed, non-canonical, not decodable, or does not decode to 32 bytes.
create function calendar_private.outbox_fingerprint_key(p_version integer)
returns bytea language plpgsql stable security definer set search_path = '' as $$
declare
  v_secret text;
  v_key bytea;
begin
  select s.decrypted_secret into v_secret
  from calendar_private.notification_fingerprint_keys k
  join vault.decrypted_secrets s on s.name = k.vault_secret_name
  where k.version = p_version and k.activated_at is not null;
  if v_secret is null or v_secret !~ '^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$' then
    return null;
  end if;
  begin
    v_key := decode(v_secret, 'base64');
  exception when others then
    return null;
  end;
  if v_key is null or octet_length(v_key) <> 32 then
    return null;
  end if;
  return v_key;
end $$;

create function calendar_private.outbox_active_fingerprint_key_version()
returns integer language sql stable security definer set search_path = '' as $$
  select version from calendar_private.notification_fingerprint_keys
  where activated_at is not null and retired_at is null;
$$;

-- Keyed, per-row-salted fingerprint: HMAC-SHA256(K_v, salt || ':' || canonical).
-- pgcrypto's hmac() is strict, so a missing key yields NULL and every caller FAILS CLOSED on NULL.
create function calendar_private.outbox_fingerprint(p_key_version integer, p_salt text, p_canonical text)
returns text language sql stable security definer set search_path = '' as $$
  select encode(extensions.hmac(convert_to(p_salt || ':' || p_canonical, 'UTF8'),
                                calendar_private.outbox_fingerprint_key(p_key_version), 'sha256'), 'hex');
$$;

-- Batch 1 calendarProviderIdempotencyKey(): 'afc-cal-' + 48 hex of sha256('<key>#epoch-<n>').
create function calendar_private.outbox_provider_key(p_key text, p_epoch integer)
returns text language sql immutable strict set search_path = '' as $$
  select 'afc-cal-' || left(calendar_private.outbox_sha256_hex(p_key || '#epoch-' || p_epoch), 48);
$$;

-- Canonical facts of a STORED row (used by claim's integrity re-check). NULL after purge.
create function calendar_private.outbox_row_facts_canonical(o calendar_private.notification_outbox)
returns text language sql immutable set search_path = '' as $$
  select calendar_private.outbox_facts_canonical(
    o.key, o.organization_id, o.campaign_id, o.participant_id, o.reservation_id,
    o.recipient, o.language,
    array(select e.value::integer
          from jsonb_array_elements_text(o.facts->'days') with ordinality as e(value, n) order by e.n),
    (o.facts->>'multiplier')::integer, (o.facts->>'baseCents')::bigint,
    (o.facts->>'additionalImpactCents')::bigint, (o.facts->>'totalCents')::bigint);
$$;
```

### 10.7 Shared helpers

```sql
create function calendar_private.outbox_status(o calendar_private.notification_outbox)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('key', o.key, 'state', o.state, 'epoch', o.epoch,
    'epochAttempts', o.epoch_attempts, 'totalAttempts', o.total_attempts,
    'nextAttemptAt', o.next_attempt_at, 'holdReason', o.hold_reason,
    'templateVersion', o.template_version, 'sentAfterRefund', o.sent_after_refund,
    'restartPending', o.restart_request_id is not null);
$$;

-- Calendar functions rely on READ COMMITTED (unlocked status reads see the latest commit).
create function calendar_private.outbox_require_read_committed()
returns void language plpgsql stable set search_path = '' as $$
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'INVALID_TRANSITION' using errcode = '25000';
  end if;
end $$;

-- Explicit, org-scoped designation of a NAMED user (no session claims).
-- NEVER uses has_org_permission / is_platform_admin. Reads live membership and status.
create function calendar_private.is_designated_reviewer(p_organization_id uuid, p_user_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare g calendar_private.notification_reviewer_events;
begin
  if p_user_id is null or p_organization_id is null then return false; end if;
  select * into g from calendar_private.notification_reviewer_events
    where organization_id = p_organization_id and user_id = p_user_id
    order by occurred_at desc, id desc limit 1;
  if not found or g.event_type <> 'GRANTED' or g.expires_at <= clock_timestamp() then return false; end if;
  if not exists (select 1 from public.organizations o where o.id = p_organization_id and o.status = 'active') then
    return false;
  end if;
  if g.basis = 'org_member' then
    return exists (select 1 from public.organization_members m
                   where m.organization_id = p_organization_id and m.user_id = p_user_id and m.status = 'active');
  elsif g.basis = 'platform_staff' then
    return exists (select 1 from public.platform_admins pa where pa.user_id = p_user_id);
  end if;
  return false;
end $$;

-- The CALLER is a reviewer of this organization: session identity, MFA (fixed), designation.
create function calendar_private.is_notification_reviewer(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and coalesce(auth.jwt()->>'aal', '') = 'aal2'
     and calendar_private.is_designated_reviewer(p_organization_id, auth.uid());
$$;

-- Mirror one decision into the org's hash-chained audit trail. Always the LAST lock taken (§17.1).
-- 1:1 link to its source event; no donor data; includes the platform's audit_context().
create function calendar_private.outbox_audit(
  p_org uuid, p_action text, p_reservation uuid, p_source text, p_source_event_id bigint, p_metadata jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_source not in ('notification_events', 'reservation_language_events') or p_source_event_id is null then
    raise exception 'INVALID_TRANSITION' using errcode = '23514';
  end if;
  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_org, auth.uid(), p_action, 'calendar_notification', p_reservation,
          p_metadata || jsonb_build_object('source', p_source, 'source_event_id', p_source_event_id)
                     || public.audit_context());
end $$;

create function calendar_private.outbox_hold(p_key text, p_reason text, p_now timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare o calendar_private.notification_outbox;
begin
  update calendar_private.notification_outbox set
    state = 'DELIVERY_UNCERTAIN', next_attempt_at = null, hold_reason = p_reason,
    lease_id = null, lease_worker_id = null, lease_expires_at = null, updated_at = p_now
  where key = p_key and state in ('PENDING', 'SENDING')
  returning * into o;
  if found then
    insert into calendar_private.notification_events (key, organization_id, event_type, epoch, code)
    values (o.key, o.organization_id, 'HELD', o.epoch, p_reason);
  end if;
end $$;

-- Unknown outcome (ack 'unknown' or lease expiry). Caller holds the outbox row lock.
-- Refund-aware: a non-PAID reservation is held for review (unlocked read; see §6.2).
create function calendar_private.outbox_after_unknown(p_key text, p_now timestamptz)
returns calendar_private.notification_outbox
language plpgsql security definer set search_path = '' as $$
declare
  pol calendar_private.notification_policy;
  o calendar_private.notification_outbox;
  v_status text;
  v_next timestamptz;
  v_hold text;
begin
  select * into strict pol from calendar_private.notification_policy;
  select * into strict o from calendar_private.notification_outbox where key = p_key;
  select status into v_status from calendar_private.reservations where id = o.reservation_id;

  if v_status is distinct from 'PAID' then
    v_hold := 'reservation_no_longer_paid';
  elsif pol.provider_idempotency_window = interval '0' then
    v_hold := 'no_provider_idempotency';
  elsif o.epoch_attempts >= pol.max_attempts then
    v_hold := 'unknown_outcome_attempts_exhausted';
  else
    v_next := p_now + least(pol.retry_cap, pol.retry_base * power(2, greatest(o.epoch_attempts - 1, 0)));
    if v_next + pol.idempotency_safety_margin > o.epoch_started_at + pol.provider_idempotency_window then
      v_hold := 'unknown_outcome_outside_idempotency_window';
    end if;
  end if;

  update calendar_private.notification_outbox set
    epoch_unknown_outcome = true,
    lease_id = null, lease_worker_id = null, lease_expires_at = null,
    state = case when v_hold is null then 'PENDING' else 'DELIVERY_UNCERTAIN' end,
    next_attempt_at = case when v_hold is null then v_next else null end,
    hold_reason = v_hold, updated_at = p_now
  where key = p_key
  returning * into o;
  if v_hold is not null then
    insert into calendar_private.notification_events (key, organization_id, event_type, epoch, code)
    values (o.key, o.organization_id, 'HELD', o.epoch, v_hold);
  end if;
  return o;
end $$;
```

### 10.8 Enqueue (digest recomputation, salted fingerprints)

```sql
create function calendar_private.enqueue_donor_confirmation(p_intent jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r calendar_private.reservations;
  existing calendar_private.notification_outbox;
  v_now timestamptz := clock_timestamp();
  v_key text; v_org uuid; v_campaign uuid; v_participant uuid; v_reservation uuid;
  v_recipient text; v_language text; v_template text; v_subject text; v_text text; v_html text;
  v_in_facts_digest text; v_in_content_digest text;
  v_days integer[]; v_sorted_days integer[];
  v_multiplier integer; v_base bigint; v_additional bigint; v_total bigint;
  v_facts_canonical text; v_content_canonical text; v_salt text;
  v_key_version integer; v_facts_fp text; v_content_fp text;
begin
  -- 1. Strict parse: exact key set, exact JSON types, no coercion.
  begin
    if jsonb_typeof(p_intent) <> 'object'
       or exists (select 1 from jsonb_object_keys(p_intent) k where k not in (
            'key', 'kind', 'mode', 'organizationId', 'campaignId', 'participantId', 'reservationId',
            'recipient', 'language', 'facts', 'templateVersion', 'subject', 'text', 'html',
            'factsDigest', 'contentDigest'))
       or exists (select 1 from jsonb_object_keys(p_intent->'facts') k where k not in (
            'currency', 'days', 'multiplier', 'baseCents', 'additionalImpactCents', 'totalCents'))
       or p_intent->>'kind' is distinct from 'calendar_donor_confirmation'
       or p_intent->>'mode' is distinct from 'test'
       or p_intent->'facts'->>'currency' is distinct from 'usd'
       or jsonb_typeof(p_intent->'facts'->'days') <> 'array'
       or exists (select 1 from jsonb_array_elements(p_intent->'facts'->'days') e where jsonb_typeof(e) <> 'number')
       or exists (select 1 from unnest(array['multiplier', 'baseCents', 'additionalImpactCents', 'totalCents']) f
                  where jsonb_typeof(p_intent->'facts'->f) <> 'number')
       or exists (select 1 from unnest(array['key', 'organizationId', 'campaignId', 'participantId', 'reservationId',
                    'recipient', 'language', 'templateVersion', 'subject', 'text', 'html',
                    'factsDigest', 'contentDigest']) f
                  where jsonb_typeof(p_intent->f) is distinct from 'string') then
      raise exception 'INVALID_INTENT' using errcode = '23514';
    end if;
    v_key := p_intent->>'key';
    v_org := (p_intent->>'organizationId')::uuid;
    v_campaign := (p_intent->>'campaignId')::uuid;
    v_participant := (p_intent->>'participantId')::uuid;
    v_reservation := (p_intent->>'reservationId')::uuid;
    v_recipient := p_intent->>'recipient';          -- exact; no normalization (§4.1 rule 6)
    v_language := p_intent->>'language';
    v_template := p_intent->>'templateVersion';
    v_subject := p_intent->>'subject';
    v_text := p_intent->>'text';
    v_html := p_intent->>'html';
    v_in_facts_digest := p_intent->>'factsDigest';
    v_in_content_digest := p_intent->>'contentDigest';
    v_multiplier := (p_intent->'facts'->>'multiplier')::integer;
    v_base := (p_intent->'facts'->>'baseCents')::bigint;
    v_additional := (p_intent->'facts'->>'additionalImpactCents')::bigint;
    v_total := (p_intent->'facts'->>'totalCents')::bigint;
    select array_agg(e.value::integer order by e.n) into v_days     -- order AS GIVEN
      from jsonb_array_elements_text(p_intent->'facts'->'days') with ordinality as e(value, n);
  exception when others then
    raise exception 'INVALID_INTENT' using errcode = '23514';
  end;

  -- 2. Lock the reservation (the only lock taken before the outbox row; §6.2).
  select * into r from calendar_private.reservations where id = v_reservation for share;
  if not found or r.status <> 'PAID' or r.organization_id <> v_org
     or r.campaign_id <> v_campaign or r.participant_id <> v_participant then
    raise exception 'SCOPE_MISMATCH' using errcode = '23514';
  end if;
  if r.supporter_language is null then
    raise exception 'INVALID_PAID_RECORD' using errcode = '23514';        -- D4: fail closed
  end if;
  select array_agg(d order by d) into v_sorted_days from unnest(r.days) as d;

  -- 3. Every fact must equal the committed reservation exactly.
  if v_key is distinct from 'calendar:test:' || r.organization_id::text || ':' || r.id::text || ':donor-confirmation:v1'
     or v_recipient is distinct from r.supporter_email
     or v_language is distinct from r.supporter_language
     or v_days is distinct from v_sorted_days
     or v_multiplier is distinct from r.multiplier
     or v_base is distinct from r.base_cents
     or v_additional is distinct from r.additional_impact_cents
     or v_total is distinct from r.total_cents then
    raise exception 'SCOPE_MISMATCH' using errcode = '23514';
  end if;

  -- 4. The DB computes the canonical forms (facts from the RESERVATION) and both digests.
  v_facts_canonical := calendar_private.outbox_facts_canonical(
    v_key, r.organization_id, r.campaign_id, r.participant_id, r.id, r.supporter_email,
    r.supporter_language, v_sorted_days, r.multiplier, r.base_cents, r.additional_impact_cents, r.total_cents);
  v_content_canonical := calendar_private.outbox_content_canonical(v_template, v_subject, v_text, v_html);
  if v_facts_canonical is null or v_content_canonical is null
     or calendar_private.outbox_sha256_hex(v_facts_canonical) is distinct from v_in_facts_digest
     or calendar_private.outbox_sha256_hex(v_content_canonical) is distinct from v_in_content_digest then
    raise exception 'INVALID_INTENT' using errcode = '23514';             -- tamper or drift
  end if;

  -- 5. Atomic insert-once with DB-computed digests and KEYED, per-row salted fingerprints.
  --    No active key, or an unreadable key: fail closed (nothing queued).
  v_salt := gen_random_uuid()::text;
  v_key_version := calendar_private.outbox_active_fingerprint_key_version();
  v_facts_fp := calendar_private.outbox_fingerprint(v_key_version, v_salt, v_facts_canonical);
  v_content_fp := calendar_private.outbox_fingerprint(v_key_version, v_salt, v_content_canonical);
  if v_key_version is null or v_facts_fp is null or v_content_fp is null then
    raise exception 'FINGERPRINT_KEY_UNAVAILABLE' using errcode = '55000';
  end if;
  begin
    insert into calendar_private.notification_outbox (
      key, kind, mode, organization_id, campaign_id, participant_id, reservation_id,
      recipient, subject, text_body, html_body, facts_digest, content_digest,
      language, facts, template_version, fingerprint_salt, fingerprint_key_version,
      facts_fingerprint, content_fingerprint,
      state, next_attempt_at, created_at, updated_at)
    values (
      v_key, 'calendar_donor_confirmation', 'test', r.organization_id, r.campaign_id, r.participant_id, r.id,
      r.supporter_email, v_subject, v_text, v_html,
      calendar_private.outbox_sha256_hex(v_facts_canonical), calendar_private.outbox_sha256_hex(v_content_canonical),
      r.supporter_language,
      jsonb_build_object('currency', 'usd', 'days', to_jsonb(v_sorted_days), 'multiplier', r.multiplier,
        'baseCents', r.base_cents, 'additionalImpactCents', r.additional_impact_cents, 'totalCents', r.total_cents),
      v_template, v_salt, v_key_version, v_facts_fp, v_content_fp,
      'PENDING', v_now, v_now, v_now)
    on conflict (key) do nothing;
  exception when check_violation or not_null_violation or string_data_right_truncation then
    raise exception 'INVALID_INTENT' using errcode = '23514';
  end;
  if found then
    insert into calendar_private.notification_events (key, organization_id, event_type, epoch)
    values (v_key, r.organization_id, 'ENQUEUED', 1);
    return jsonb_build_object('key', v_key, 'status', 'queued');
  end if;

  -- 6. Replay: compare KEYED fingerprints with the row's OWN key version (works before and
  --    after purge; §8). If that key is unavailable, fail closed: never guess "already_queued".
  select * into strict existing from calendar_private.notification_outbox where key = v_key for update;
  v_facts_fp := calendar_private.outbox_fingerprint(existing.fingerprint_key_version, existing.fingerprint_salt, v_facts_canonical);
  v_content_fp := calendar_private.outbox_fingerprint(existing.fingerprint_key_version, existing.fingerprint_salt, v_content_canonical);
  if v_facts_fp is null or v_content_fp is null then
    raise exception 'FINGERPRINT_KEY_UNAVAILABLE' using errcode = '55000';
  end if;
  if v_facts_fp <> existing.facts_fingerprint
     or (existing.template_version = v_template and v_content_fp <> existing.content_fingerprint) then
    raise exception 'PAYLOAD_CONFLICT' using errcode = '23514';
  end if;
  return jsonb_build_object('key', v_key, 'status', 'already_queued');
end $$;
```

### 10.9 Claim (allowlist, refund check, integrity re-check, window and provider)

```sql
create function calendar_private.claim_donor_confirmation(p_worker_id text, p_provider_account text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  pol calendar_private.notification_policy;
  o calendar_private.notification_outbox;
  v_now timestamptz := clock_timestamp();
  v_lease uuid;
  v_status text;
  i integer := 0;
begin
  perform calendar_private.outbox_require_read_committed();
  if p_worker_id is null or p_worker_id !~ '^[A-Za-z0-9._:@<>+-]{1,256}$'
     or p_provider_account is null or p_provider_account !~ '^[A-Za-z0-9._:@<>+-]{1,256}$' then
    raise exception 'INVALID_TRANSITION' using errcode = '23514';
  end if;
  select * into strict pol from calendar_private.notification_policy;

  while i < 25 loop
    i := i + 1;
    select ob.* into o from calendar_private.notification_outbox ob
      where ob.state = 'PENDING' and ob.next_attempt_at <= v_now
        and exists (select 1 from calendar_private.test_recipient_allowlist a       -- D6
                    where a.organization_id = ob.organization_id and a.recipient = ob.recipient)
      order by ob.next_attempt_at, ob.created_at, ob.key
      for update of ob skip locked
      limit 1;
    if not found then return null; end if;

    -- D3 refund check: plain read, no reservation lock (§6.2).
    select status into v_status from calendar_private.reservations where id = o.reservation_id;
    if v_status is distinct from 'PAID' then
      perform calendar_private.outbox_hold(o.key, 'reservation_no_longer_paid', v_now);
      continue;
    end if;

    -- Integrity: the stored payload must still hash to the DB-computed digests.
    if calendar_private.outbox_sha256_hex(calendar_private.outbox_row_facts_canonical(o)) is distinct from o.facts_digest
       or calendar_private.outbox_sha256_hex(calendar_private.outbox_content_canonical(
            o.template_version, o.subject, o.text_body, o.html_body)) is distinct from o.content_digest then
      perform calendar_private.outbox_hold(o.key, 'stored_payload_integrity_failure', v_now);
      continue;
    end if;

    -- Claim-time recheck after an unknown outcome (window anchored to epoch start).
    if o.epoch_unknown_outcome then
      if pol.provider_idempotency_window = interval '0'
         or v_now + pol.lease_interval + pol.idempotency_safety_margin
              > o.epoch_started_at + pol.provider_idempotency_window then
        perform calendar_private.outbox_hold(o.key, 'idempotency_window_elapsed_before_retry', v_now);
        continue;
      end if;
      if o.epoch_provider_account is distinct from p_provider_account then
        perform calendar_private.outbox_hold(o.key, 'provider_changed_after_unknown_outcome', v_now);
        continue;
      end if;
    end if;

    v_lease := gen_random_uuid();
    update calendar_private.notification_outbox set
      state = 'SENDING', next_attempt_at = null,
      lease_id = v_lease, lease_worker_id = p_worker_id, lease_expires_at = v_now + pol.lease_interval,
      epoch_started_at = coalesce(epoch_started_at, v_now),
      epoch_attempts = epoch_attempts + 1, epoch_provider_account = p_provider_account,
      total_attempts = total_attempts + 1, updated_at = v_now
    where key = o.key
    returning * into o;
    insert into calendar_private.notification_events
      (key, organization_id, event_type, epoch, attempt, lease_id, worker_id, provider_account)
    values (o.key, o.organization_id, 'CLAIMED', o.epoch, o.epoch_attempts, v_lease, p_worker_id, p_provider_account);

    return jsonb_build_object(
      'key', o.key, 'leaseId', v_lease, 'leaseExpiresAt', o.lease_expires_at,
      'epoch', o.epoch, 'attempt', o.epoch_attempts,
      'providerIdempotencyKey', calendar_private.outbox_provider_key(o.key, o.epoch),
      'delivery', jsonb_build_object('recipient', o.recipient, 'subject', o.subject,
                                     'text', o.text_body, 'html', o.html_body));
  end loop;
  return null;
end $$;
```

### 10.10 Acknowledge (refund-aware)

```sql
create function calendar_private.acknowledge_donor_confirmation(
  p_key text, p_lease_id uuid, p_outcome text,
  p_provider_message_id text default null, p_code text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  pol calendar_private.notification_policy;
  o calendar_private.notification_outbox;
  v_now timestamptz := clock_timestamp();
  v_code text := case when p_code ~ '^[a-z0-9_.-]{1,64}$' then p_code else 'unspecified' end;
  v_attempt smallint;
  v_status text;
begin
  perform calendar_private.outbox_require_read_committed();
  select * into strict pol from calendar_private.notification_policy;
  select * into o from calendar_private.notification_outbox where key = p_key for update;
  if not found then raise exception 'NOT_FOUND' using errcode = '23514'; end if;
  if o.state <> 'SENDING' or o.lease_id is distinct from p_lease_id then
    raise exception 'STALE_LEASE' using errcode = '23514';
  end if;
  v_attempt := o.epoch_attempts;
  select status into v_status from calendar_private.reservations where id = o.reservation_id;  -- unlocked

  if p_outcome = 'accepted' then
    if p_provider_message_id is null or p_provider_message_id !~ '^[A-Za-z0-9._:@<>+-]{1,256}$' then
      raise exception 'INVALID_TRANSITION' using errcode = '23514';
    end if;
    update calendar_private.notification_outbox set
      state = 'SENT', provider_message_id = p_provider_message_id, sent_at = v_now,
      sent_after_refund = (v_status is distinct from 'PAID'),
      lease_id = null, lease_worker_id = null, lease_expires_at = null, hold_reason = null, updated_at = v_now
    where key = p_key returning * into o;
    insert into calendar_private.notification_events (key, organization_id, event_type, epoch, attempt, lease_id, code)
    values (o.key, o.organization_id, 'ACCEPTED', o.epoch, v_attempt, p_lease_id,
            case when o.sent_after_refund then 'reservation_refunded_during_send' end);

  elsif p_outcome = 'rejected_permanent' then
    update calendar_private.notification_outbox set
      state = 'DEAD_LETTER', hold_reason = 'rejected_permanent',
      lease_id = null, lease_worker_id = null, lease_expires_at = null, updated_at = v_now
    where key = p_key returning * into o;
    insert into calendar_private.notification_events (key, organization_id, event_type, epoch, attempt, lease_id, code)
    values (o.key, o.organization_id, 'REJECTED_PERMANENT', o.epoch, v_attempt, p_lease_id, v_code);

  elsif p_outcome = 'rejected_retryable' then
    insert into calendar_private.notification_events (key, organization_id, event_type, epoch, attempt, lease_id, code)
    values (o.key, o.organization_id, 'REJECTED_RETRYABLE', o.epoch, v_attempt, p_lease_id, v_code);
    if v_status is distinct from 'PAID' then
      perform calendar_private.outbox_hold(p_key, 'reservation_no_longer_paid', v_now);
      select * into strict o from calendar_private.notification_outbox where key = p_key;
    elsif o.epoch_attempts >= pol.max_attempts then
      update calendar_private.notification_outbox set
        state = 'DEAD_LETTER', hold_reason = 'retry_exhausted',
        lease_id = null, lease_worker_id = null, lease_expires_at = null, updated_at = v_now
      where key = p_key returning * into o;
    else
      update calendar_private.notification_outbox set
        state = 'PENDING',
        next_attempt_at = v_now + least(pol.retry_cap, pol.retry_base * power(2, greatest(o.epoch_attempts - 1, 0))),
        lease_id = null, lease_worker_id = null, lease_expires_at = null, updated_at = v_now
      where key = p_key returning * into o;
    end if;

  elsif p_outcome = 'unknown' then
    insert into calendar_private.notification_events (key, organization_id, event_type, epoch, attempt, lease_id, code)
    values (o.key, o.organization_id, 'UNKNOWN', o.epoch, v_attempt, p_lease_id, v_code);
    o := calendar_private.outbox_after_unknown(p_key, v_now);               -- refund-aware

  else
    raise exception 'INVALID_TRANSITION' using errcode = '23514';
  end if;
  return calendar_private.outbox_status(o);
end $$;
```

### 10.11 Lease expiry

```sql
create function calendar_private.expire_donor_confirmation_leases()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o calendar_private.notification_outbox;
  v_now timestamptz := clock_timestamp();
  v_requeued integer := 0; v_uncertain integer := 0;
begin
  perform calendar_private.outbox_require_read_committed();
  for o in select * from calendar_private.notification_outbox
           where state = 'SENDING' and lease_expires_at <= v_now
           order by lease_expires_at for update skip locked limit 200
  loop
    insert into calendar_private.notification_events (key, organization_id, event_type, epoch, attempt, lease_id)
    values (o.key, o.organization_id, 'LEASE_EXPIRED', o.epoch, o.epoch_attempts, o.lease_id);
    o := calendar_private.outbox_after_unknown(o.key, v_now);     -- never "not sent"; refund-aware
    if o.state = 'PENDING' then v_requeued := v_requeued + 1; else v_uncertain := v_uncertain + 1; end if;
  end loop;
  return jsonb_build_object('requeued', v_requeued, 'uncertain', v_uncertain);
end $$;
```

### 10.12 Resolution with evidence, and two-person restart

```sql
create function calendar_private.resolve_donor_confirmation(
  p_key text, p_resolution text, p_reason_code text, p_evidence_kind text, p_evidence_ref text,
  p_expected_epoch integer, p_provider_message_id text default null,
  p_duplicate_risk_acknowledged boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  pol calendar_private.notification_policy;
  o calendar_private.notification_outbox;
  v_uid uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_status text;
  v_request uuid;
  v_event_id bigint;
begin
  perform calendar_private.outbox_require_read_committed();
  select * into strict pol from calendar_private.notification_policy;
  select * into o from calendar_private.notification_outbox where key = p_key for update;
  if v_uid is null or not found or not calendar_private.is_notification_reviewer(o.organization_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';             -- same error for every denial
  end if;
  if o.state <> 'DELIVERY_UNCERTAIN' then raise exception 'INVALID_TRANSITION' using errcode = '23514'; end if;
  if p_expected_epoch is distinct from o.epoch then raise exception 'STALE_REVIEW' using errcode = '23514'; end if;
  if p_evidence_ref is null or p_evidence_ref !~ '^[A-Za-z0-9._:+/-]{1,128}$'
     or p_evidence_kind not in ('provider_api_lookup', 'provider_dashboard', 'provider_support_case',
                                'donor_statement', 'internal_record') then
    raise exception 'EVIDENCE_REQUIRED' using errcode = '23514';
  end if;

  if p_resolution = 'provider_confirmed_accepted' then
    if p_reason_code is distinct from 'provider_reports_accepted'
       or p_evidence_kind not in ('provider_api_lookup', 'provider_dashboard', 'provider_support_case')
       or p_provider_message_id is null or p_provider_message_id !~ '^[A-Za-z0-9._:@<>+-]{1,256}$' then
      raise exception 'EVIDENCE_REQUIRED' using errcode = '23514';
    end if;
    update calendar_private.notification_outbox set
      state = 'SENT', provider_message_id = p_provider_message_id, sent_at = v_now, hold_reason = null,
      restart_request_id = null, restart_requested_by = null, restart_requested_at = null, updated_at = v_now
    where key = p_key returning * into o;

  elsif p_resolution = 'abandon' then
    if p_reason_code not in ('reservation_refunded', 'donor_contacted_directly', 'duplicate_risk_unacceptable',
                             'provider_status_unavailable', 'recipient_invalid', 'integrity_failure') then
      raise exception 'EVIDENCE_REQUIRED' using errcode = '23514';
    end if;
    update calendar_private.notification_outbox set
      state = 'DEAD_LETTER', hold_reason = 'abandoned_after_review',
      restart_request_id = null, restart_requested_by = null, restart_requested_at = null, updated_at = v_now
    where key = p_key returning * into o;

  elsif p_resolution = 'provider_confirmed_not_accepted' then
    select status into v_status from calendar_private.reservations where id = o.reservation_id;
    if p_reason_code is distinct from 'provider_reports_not_accepted'
       or p_evidence_kind not in ('provider_api_lookup', 'provider_support_case')
       or p_duplicate_risk_acknowledged is not true then
      raise exception 'EVIDENCE_REQUIRED' using errcode = '23514';
    end if;
    if v_status is distinct from 'PAID' or o.hold_reason = 'stored_payload_integrity_failure' then
      raise exception 'INVALID_TRANSITION' using errcode = '23514';
    end if;
    -- Two-person rule (fixed): record the request only; a DIFFERENT reviewer must approve.
    v_request := gen_random_uuid();
    update calendar_private.notification_outbox set
      restart_request_id = v_request, restart_requested_by = v_uid, restart_requested_at = v_now, updated_at = v_now
    where key = p_key returning * into o;
    insert into calendar_private.notification_events (key, organization_id, event_type, epoch, reviewer_user_id,
      resolution, reason_code, evidence_kind, evidence_ref, restart_request_id)
    values (o.key, o.organization_id, 'RESTART_REQUESTED', o.epoch, v_uid, p_resolution,
            p_reason_code, p_evidence_kind, p_evidence_ref, v_request)
    returning id into v_event_id;
    perform calendar_private.outbox_audit(o.organization_id, 'CALENDAR_NOTIFICATION_RESTART_REQUESTED', o.reservation_id,
      'notification_events', v_event_id,
      jsonb_build_object('key', o.key, 'from_epoch', o.epoch, 'restart_request_id', v_request,
        'reason_code', p_reason_code, 'evidence_kind', p_evidence_kind, 'evidence_ref', p_evidence_ref));
    return calendar_private.outbox_status(o);                 -- waits for a second reviewer

  else
    raise exception 'INVALID_TRANSITION' using errcode = '23514';
  end if;

  insert into calendar_private.notification_events (key, organization_id, event_type, epoch, reviewer_user_id,
    resolution, reason_code, evidence_kind, evidence_ref)
  values (o.key, o.organization_id, 'RESOLVED', o.epoch, v_uid, p_resolution, p_reason_code, p_evidence_kind, p_evidence_ref)
  returning id into v_event_id;
  perform calendar_private.outbox_audit(o.organization_id, 'CALENDAR_NOTIFICATION_RESOLVED', o.reservation_id,
    'notification_events', v_event_id,
    jsonb_build_object('key', o.key, 'epoch', o.epoch, 'resolution', p_resolution, 'reason_code', p_reason_code,
      'evidence_kind', p_evidence_kind, 'evidence_ref', p_evidence_ref));
  return calendar_private.outbox_status(o);
end $$;

create function calendar_private.approve_epoch_restart(
  p_key text, p_restart_request_id uuid, p_expected_epoch integer,
  p_evidence_reviewed boolean, p_duplicate_risk_acknowledged boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  pol calendar_private.notification_policy;
  o calendar_private.notification_outbox;
  v_uid uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_status text;
  v_from integer;
  v_event_id bigint;
begin
  perform calendar_private.outbox_require_read_committed();
  select * into strict pol from calendar_private.notification_policy;
  select * into o from calendar_private.notification_outbox where key = p_key for update;
  if v_uid is null or not found or not calendar_private.is_notification_reviewer(o.organization_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if o.state <> 'DELIVERY_UNCERTAIN' or o.restart_request_id is distinct from p_restart_request_id then
    raise exception 'INVALID_TRANSITION' using errcode = '23514';
  end if;
  if o.restart_requested_by = v_uid then
    raise exception 'SECOND_REVIEWER_REQUIRED' using errcode = '42501';   -- two different people
  end if;
  -- The requester must STILL be a current reviewer of this organization (designation,
  -- expiry, live membership or platform-staff status). MFA was checked at request time.
  if not calendar_private.is_designated_reviewer(o.organization_id, o.restart_requested_by) then
    raise exception 'REQUESTER_NO_LONGER_AUTHORIZED' using errcode = '42501';
  end if;
  -- The approver attests to having reviewed the evidence and accepts the duplicate risk.
  if p_evidence_reviewed is not true or p_duplicate_risk_acknowledged is not true then
    raise exception 'EVIDENCE_REQUIRED' using errcode = '23514';
  end if;
  if p_expected_epoch is distinct from o.epoch then raise exception 'STALE_REVIEW' using errcode = '23514'; end if;
  if o.restart_requested_at + pol.restart_request_ttl < v_now then
    raise exception 'RESTART_REQUEST_EXPIRED' using errcode = '23514';
  end if;
  select status into v_status from calendar_private.reservations where id = o.reservation_id;
  if v_status is distinct from 'PAID' then raise exception 'INVALID_TRANSITION' using errcode = '23514'; end if;

  v_from := o.epoch;
  update calendar_private.notification_outbox set
    state = 'PENDING', next_attempt_at = v_now, hold_reason = null,
    epoch = epoch + 1, epoch_started_at = null, epoch_attempts = 0,
    epoch_unknown_outcome = false, epoch_provider_account = null,
    restart_request_id = null, restart_requested_by = null, restart_requested_at = null, updated_at = v_now
  where key = p_key returning * into o;
  insert into calendar_private.notification_events (key, organization_id, event_type, epoch, reviewer_user_id, restart_request_id)
  values (o.key, o.organization_id, 'RESTART_APPROVED', o.epoch, v_uid, p_restart_request_id)
  returning id into v_event_id;
  perform calendar_private.outbox_audit(o.organization_id, 'CALENDAR_NOTIFICATION_RESTART_APPROVED', o.reservation_id,
    'notification_events', v_event_id,
    jsonb_build_object('key', o.key, 'from_epoch', v_from, 'to_epoch', o.epoch, 'restart_request_id', p_restart_request_id,
      'evidence_reviewed', true, 'duplicate_risk_acknowledged', true));
  return calendar_private.outbox_status(o);
end $$;
```

### 10.13 Language recovery, reporting, purge

```sql
create function calendar_private.record_supporter_language(
  p_reservation_id uuid, p_language text, p_evidence_kind text, p_evidence_ref text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r calendar_private.reservations;
  v_event_id bigint;
begin
  select * into r from calendar_private.reservations where id = p_reservation_id for update;  -- R only, then A
  if auth.uid() is null or not found or not calendar_private.is_notification_reviewer(r.organization_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_language not in ('en', 'es')
     or p_evidence_kind not in ('checkout_record', 'donor_statement', 'internal_record')
     or p_evidence_ref is null or p_evidence_ref !~ '^[A-Za-z0-9._:+/-]{1,128}$' then
    raise exception 'EVIDENCE_REQUIRED' using errcode = '23514';
  end if;
  if r.status <> 'PAID' or r.supporter_language is not null then           -- set once; never overwrite
    raise exception 'INVALID_TRANSITION' using errcode = '23514';
  end if;
  update calendar_private.reservations set supporter_language = p_language, updated_at = clock_timestamp()
    where id = r.id;
  insert into calendar_private.reservation_language_events
    (reservation_id, organization_id, language, evidence_kind, evidence_ref, actor_user_id)
  values (r.id, r.organization_id, p_language, p_evidence_kind, p_evidence_ref, auth.uid())
  returning id into v_event_id;
  perform calendar_private.outbox_audit(r.organization_id, 'CALENDAR_SUPPORTER_LANGUAGE_RECORDED', r.id,
    'reservation_language_events', v_event_id,
    jsonb_build_object('language', p_language, 'evidence_kind', p_evidence_kind, 'evidence_ref', p_evidence_ref));
  return jsonb_build_object('reservationId', r.id, 'language', p_language);
end $$;

create function calendar_private.read_donor_confirmation_status(p_key text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare o calendar_private.notification_outbox;
begin
  select * into o from calendar_private.notification_outbox where key = p_key;
  if not found then return null; end if;
  return calendar_private.outbox_status(o);                          -- donor-free
end $$;

-- Sweep hints for ONE organization; flags missing language. Hints only.
create function calendar_private.list_missing_donor_confirmations(p_organization_id uuid, p_limit integer default 100)
returns table (organization_id uuid, campaign_id uuid, participant_id uuid, reservation_id uuid, language_missing boolean)
language sql stable security definer set search_path = '' as $$
  select r.organization_id, r.campaign_id, r.participant_id, r.id, r.supporter_language is null
  from calendar_private.reservations r
  where r.organization_id = p_organization_id and r.status = 'PAID'
    and not exists (select 1 from calendar_private.notification_outbox o where o.reservation_id = r.id)
  order by r.updated_at, r.id
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

-- Donor-free backlog counts for an org's reviewers.
create function calendar_private.read_confirmation_backlog(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not calendar_private.is_notification_reviewer(p_organization_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'missingLanguage', (select count(*) from calendar_private.reservations r
       where r.organization_id = p_organization_id and r.status = 'PAID' and r.supporter_language is null
         and not exists (select 1 from calendar_private.notification_outbox o where o.reservation_id = r.id)),
    'missingOther', (select count(*) from calendar_private.reservations r
       where r.organization_id = p_organization_id and r.status = 'PAID' and r.supporter_language is not null
         and not exists (select 1 from calendar_private.notification_outbox o where o.reservation_id = r.id)),
    'oldestMissingSince', (select min(r.updated_at) from calendar_private.reservations r
       where r.organization_id = p_organization_id and r.status = 'PAID'
         and not exists (select 1 from calendar_private.notification_outbox o where o.reservation_id = r.id)),
    'byState', (select coalesce(jsonb_object_agg(s.state, s.n), '{}'::jsonb) from (
       select state, count(*) n from calendar_private.notification_outbox
       where organization_id = p_organization_id group by state) s),
    'heldByReason', (select coalesce(jsonb_object_agg(h.hold_reason, h.n), '{}'::jsonb) from (
       select hold_reason, count(*) n from calendar_private.notification_outbox
       where organization_id = p_organization_id and state = 'DELIVERY_UNCERTAIN' group by hold_reason) h));
end $$;

-- D5: clear payload and UNSALTED digests on final rows after retention; keep fingerprints and history.
create function calendar_private.purge_donor_confirmation_payloads()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  pol calendar_private.notification_policy;
  v_now timestamptz := clock_timestamp();
  v_count integer;
begin
  select * into strict pol from calendar_private.notification_policy;
  -- SKIP LOCKED in batches: purge never waits on a row another transaction holds (§17.1).
  with due as (
    select key from calendar_private.notification_outbox
    where state in ('SENT', 'DEAD_LETTER') and payload_purged_at is null
      and updated_at <= v_now - pol.payload_retention
    order by key
    for update skip locked
    limit 500),
  purged as (
    update calendar_private.notification_outbox ob set
      recipient = null, subject = null, text_body = null, html_body = null,
      facts_digest = null, content_digest = null, payload_purged_at = v_now
    from due where ob.key = due.key
    returning ob.key, ob.organization_id, ob.epoch)
  insert into calendar_private.notification_events (key, organization_id, event_type, epoch)
  select key, organization_id, 'PURGED', epoch from purged;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Audit coverage (§17.4): every decision event has exactly one audit row, and every
-- calendar_notification audit row points at an existing decision event. Returns problems only.
create function calendar_private.verify_notification_audit_coverage(p_organization_id uuid)
returns table (source text, source_event_id bigint, problem text)
language sql stable security definer set search_path = '' as $$
  with decisions as (
    select 'notification_events'::text as src, e.id
    from calendar_private.notification_events e
    where e.organization_id = p_organization_id
      and e.event_type in ('RESOLVED', 'RESTART_REQUESTED', 'RESTART_APPROVED')
    union all
    select 'reservation_language_events', l.id
    from calendar_private.reservation_language_events l
    where l.organization_id = p_organization_id),
  raw_audits as (
    -- Never cast unchecked metadata: a malformed id becomes NULL and is reported below.
    select a.id as audit_id,
           a.metadata->>'source' as src,
           case when a.metadata->>'source_event_id' ~ '^[1-9][0-9]{0,17}$'
                then (a.metadata->>'source_event_id')::bigint end as id
    from public.audit_events a
    where a.organization_id = p_organization_id and a.entity_type = 'calendar_notification'),
  audits as (
    select src, id, count(*) as n from raw_audits
    where id is not null and src in ('notification_events', 'reservation_language_events')
    group by src, id)
  select coalesce(d.src, a.src), coalesce(d.id, a.id),
         case when a.id is null then 'missing_audit_event'
              when d.id is null then 'audit_event_without_source'
              else 'duplicate_audit_event' end
  from decisions d
  full join audits a on a.src = d.src and a.id = d.id
  where a.id is null or d.id is null or a.n <> 1
  union all
  -- Malformed rows are reported, never silently dropped. A decision whose only audit row
  -- is malformed is ALSO reported above as missing_audit_event, so no gap is hidden.
  select r.src, null::bigint, 'malformed_audit_metadata'
  from raw_audits r
  where r.id is null or r.src is null or r.src not in ('notification_events', 'reservation_language_events');
$$;
```

### 10.14 Function privileges (2A grants nothing)

```sql
revoke all on function
  calendar_private.outbox_json_string(text), calendar_private.outbox_sha256_hex(text),
  calendar_private.outbox_facts_canonical(text, uuid, uuid, uuid, uuid, text, text, integer[], integer, bigint, bigint, bigint),
  calendar_private.outbox_content_canonical(text, text, text, text),
  calendar_private.outbox_fingerprint_key(integer), calendar_private.outbox_active_fingerprint_key_version(),
  calendar_private.outbox_fingerprint(integer, text, text), calendar_private.outbox_provider_key(text, integer),
  calendar_private.outbox_row_facts_canonical(calendar_private.notification_outbox),
  calendar_private.outbox_status(calendar_private.notification_outbox),
  calendar_private.outbox_require_read_committed(),
  calendar_private.is_designated_reviewer(uuid, uuid),
  calendar_private.is_notification_reviewer(uuid),
  calendar_private.outbox_audit(uuid, text, uuid, text, bigint, jsonb),
  calendar_private.outbox_hold(text, text, timestamptz),
  calendar_private.outbox_after_unknown(text, timestamptz),
  calendar_private.enqueue_donor_confirmation(jsonb),
  calendar_private.claim_donor_confirmation(text, text),
  calendar_private.acknowledge_donor_confirmation(text, uuid, text, text, text),
  calendar_private.expire_donor_confirmation_leases(),
  calendar_private.resolve_donor_confirmation(text, text, text, text, text, integer, text, boolean),
  calendar_private.approve_epoch_restart(text, uuid, integer, boolean, boolean),
  calendar_private.record_supporter_language(uuid, text, text, text),
  calendar_private.read_donor_confirmation_status(text),
  calendar_private.list_missing_donor_confirmations(uuid, integer),
  calendar_private.read_confirmation_backlog(uuid),
  calendar_private.purge_donor_confirmation_payloads(),
  calendar_private.verify_notification_audit_coverage(uuid)
from public, anon, authenticated, service_role;
```

### 10.15 Error tokens

These are fixed messages; no donor data ever appears in one. The 2B adapter maps them to `CalendarOutboxError`.

| Message | errcode | Meaning |
|---|---|---|
| `INVALID_INTENT` | 23514 | Malformed intent, or a digest mismatch (tamper or drift) |
| `INVALID_PAID_RECORD` | 23514 | Language missing |
| `SCOPE_MISMATCH` | 23514 | Not PAID, wrong scope, or a fact differs from the reservation |
| `PAYLOAD_CONFLICT` | 23514 | Same key with different facts, or different content under the same template |
| `NOT_FOUND` / `STALE_LEASE` / `INVALID_TRANSITION` | 23514 | As in Batch 1 |
| `STALE_REVIEW` | 23514 | The reviewer examined a different epoch |
| `EVIDENCE_REQUIRED` | 23514 | Missing or disallowed reason, evidence or acknowledgement |
| `RESTART_REQUEST_EXPIRED` | 23514 | The second approval came after the TTL |
| `NOT_AUTHORIZED` | 42501 | No session, no MFA (`aal2`), not a current reviewer of this organization, or unknown key |
| `SECOND_REVIEWER_REQUIRED` | 42501 | The requester tried to approve their own restart |
| `REQUESTER_NO_LONGER_AUTHORIZED` | 42501 | The restart requester lost reviewer status before approval |
| `FINGERPRINT_KEY_UNAVAILABLE` | 55000 | No active fingerprint key, or the row's key version can't be read. Nothing is queued or answered. |
| `INVALID_TRANSITION` (errcode 25000) | 25000 | A calendar function was called outside `READ COMMITTED` |

---

## 11. Test plan

### 11.1 Golden vectors (§4.3)

- **`lib/calendar/notification-digest-vectors.test.ts`** (new; runs in the existing unit-test step). For each vector, `assertCalendarIntentIntegrity` accepts the intent with the committed hex, and rejects it when a single character changes.
- **pgTAP.** `outbox_facts_canonical`, `outbox_content_canonical` and `outbox_sha256_hex` produce the same hex for every vector; `outbox_provider_key` matches Batch 1's `calendarProviderIdempotencyKey` for 3 keys and epochs.

### 11.2 pgTAP: `supabase/tests/calendar_notification_outbox.test.sql`

Each group runs in its own rolled-back transaction. Test grants and simulated JWTs follow `calendar_reservations.test.sql`.

**Privileges.**
- No privilege for `anon`, `authenticated` or `service_role` on any of the 7 new tables or 28 functions.
- RLS is enabled on all 7 tables, with zero policies.
- Exactly one policy row; out-of-bounds values are rejected.

**Integrity (finding 1).**
- Valid intent: queued; stored digests equal the DB-computed ones; the fingerprints verify.
- Each of these raises `INVALID_INTENT` with no row written:
  - a correct-format but wrong `factsDigest`
  - a wrong `contentDigest`
  - an unknown top-level or facts key
  - a numeric field sent as a string
  - unsorted days (also `SCOPE_MISMATCH` territory)
  - an uppercase UUID in the key
- Tampering with a stored body by direct `UPDATE` (as owner) makes claim hold `stored_payload_integrity_failure` and return nothing for that row.

**Scope.**
- Not PAID, wrong organization, campaign or participant, a changed recipient (including case), or a changed language, days, multiplier or amount: `SCOPE_MISMATCH`.
- Missing language: `INVALID_PAID_RECORD`.

**Replay.**
- Identical replay: `already_queued`.
- Template-only change: `already_queued` with the original content kept.
- Same template, different content: `PAYLOAD_CONFLICT`.
- Different recipient: `PAYLOAD_CONFLICT`.

**Allowlist (D6).**
- A row with a non-allowlisted recipient is never claimed and stays `PENDING`.
- After an allowlist row is added, it is claimable.
- An allowlist row for another organization does not count.

**State machine.**
- backoff 30/60/120 s, then `retry_exhausted`
- permanent rejection keeps only an allowlisted code
- stale ack is fenced; a late ack by the current holder is accepted
- lease expiry is treated as unknown; window 0 holds `no_provider_idempotency`
- with a non-zero test policy: window anchoring, claim-time window hold, provider binding, and definitive rejections alone never trigger the window hold

**Refund (sequential versions of §11.3).**
- refund then claim; refund then ack retryable, unknown and permanent
- refund then lease expiry
- claim, refund, accepted → `sent_after_refund`
- refund then restart request: refused; refund then restart approval: refused

**Reviewer authorization (finding 2).**
- Denied, all with the identical `NOT_AUTHORIZED`:
  - no JWT
  - a member with no designation
  - **a platform admin with no designation**
  - a designation for another organization
  - an expired designation
  - a revoked designation (latest event `REVOKED`)
  - an `org_member` designee whose membership is now `suspended` or `removed`
  - a designee whose organization is not `active`
  - a `platform_staff` designee no longer in `platform_admins`
  - an `aal1` JWT (MFA is always required)
  - an unknown key
- Allowed:
  - an active `org_member` designee with `aal2`
  - an explicitly designated `platform_staff` user
- A self-designation insert fails its CHECK.

**Evidence (finding 4).**
- Each resolution rejects a missing or disallowed reason, evidence kind or reference (including a reference containing `@`).
- `STALE_REVIEW` when the epoch differs.
- A restart without the duplicate-risk acknowledgement, or with `provider_dashboard` evidence: `EVIDENCE_REQUIRED`.
- A restart request leaves the row `DELIVERY_UNCERTAIN`, with the request recorded.
- Approval by the same reviewer: `SECOND_REVIEWER_REQUIRED`.
- Approval after the TTL: `RESTART_REQUEST_EXPIRED`.
- Approval by a second reviewer: epoch 2 and a new provider key.
- Every decision adds exactly one `notification_events` row and one `audit_events` row, with `actor_id = auth.uid()`, the expected action and metadata, and no email or name.
- `verify_hash_chain('audit_events', …)` stays valid.

**Purge (finding 5).**
- Only final rows older than retention are purged.
- All six payload and digest columns are cleared together; salt and fingerprints are kept.
- After purge:
  - an identical replay returns `already_queued`
  - **a replay with a different recipient returns `PAYLOAD_CONFLICT`**
  - a template-only change returns `already_queued`
- `PENDING`, `SENDING` and `DELIVERY_UNCERTAIN` rows are never purged.
- `DELETE` on an outbox row fails.

**Language (finding 6).**
- `list_missing_donor_confirmations` flags `language_missing`.
- `read_confirmation_backlog` counts correctly and is reviewer-only.
- `record_supporter_language`:
  - rejects a non-reviewer, missing evidence, a non-PAID reservation, an already-set language, and a value outside `en`/`es`
  - on success, writes one language event and one audit event
  - a later enqueue then succeeds

**History.** `UPDATE` and `DELETE` fail on all three event tables. No exception message contains the test donor's email or name.

**Revision 2.1 additions.**

*Keys.* Test transactions create throwaway Vault secrets with random 32-byte values; nothing is committed.
- K1: no active key → enqueue raises `FINGERPRINT_KEY_UNAVAILABLE` and writes no row.
- K2: rotation. Rows made under v1; then v2 activated and v1 retired. New rows use v2; replays of v1 rows verify with v1, and a recipient change on a v1 row still raises `PAYLOAD_CONFLICT`.
- K3: a v1 row's Vault secret is removed → replay raises `FINGERPRINT_KEY_UNAVAILABLE`, never `already_queued` and never `PAYLOAD_CONFLICT`.
- K4: two rows with the same email have different fingerprints; a fingerprint never equals the unkeyed SHA-256 of its input.
- K5: superseded by K7–K10 below (exact key format).
- K6: a second active key is rejected by the unique index; deleting a key row fails.

*Two-person rule.*
- Approval by a requester who has since been revoked, expired, suspended or deactivated → `REQUESTER_NO_LONGER_AUTHORIZED`.
- Approval without either acknowledgement → `EVIDENCE_REQUIRED`.
- An `aal1` approver → `NOT_AUTHORIZED`.
- A platform admin without an explicit designation can neither request nor approve.
- There is no policy column that can disable the rule: a schema test asserts the column is absent.

*Audit.*
- After every decision test, `verify_notification_audit_coverage` returns zero rows.
- Inserted as owner, an audit row without a source is reported (`audit_event_without_source`), and a decision event without an audit row is reported (`missing_audit_event`).
- `verify_hash_chain('audit_events', 'organization_id', org)` is ok.
- Every audit row's metadata has `source`, `source_event_id` and `audit_context()` fields, and no email, name or amount.

*Isolation.* Calling claim, acknowledge, expire, resolve or approve under `REPEATABLE READ` raises `INVALID_TRANSITION` (errcode 25000).

**Revision 2.2 additions (issue #30 review).**

*Execution (item 1).*
- **X1:** a real enqueue of a valid PAID test reservation with language set returns `queued`. The stored row has the DB-computed digests, the active key version and both fingerprints, `next_attempt_at = created_at`, and one `ENQUEUED` event.
- **X2:** each new function is executed at least once in a passing path, not only checked by catalog queries.

*Key format (item 2).*
- K7: a canonical 44-character secret decoding to 32 bytes works, and the HMAC equals one computed in the test from the **decoded bytes**, not the Base64 text.
- K8: malformed Base64 (an invalid character, or missing `=`) → `FINGERPRINT_KEY_UNAVAILABLE`.
- K9: decoding to 31 or 33 bytes → unavailable.
- K10: non-canonical padding (last character outside `[AEIMQUYcgkosw048]`) → unavailable.
- K11: the Vault secret row deleted or corrupted after rows were written → replay raises `FINGERPRINT_KEY_UNAVAILABLE` (not `already_queued` or `PAYLOAD_CONFLICT`).
- A retired version still verifies its own rows, and new rows use the active version.
- **Migration test:** running the migration in a database without the `vault` schema aborts with the K1 message. (Run against a scratch database in the CI job.)

*Golden vectors (item 3).*
- G1: Node, through `assertCalendarIntentIntegrity`, equals the §4.3 constants.
- G2: Postgres equals the §4.3 constants and byte lengths.
- G3: changing one character changes the hash on both sides.
- G4: U+0000 and lone-surrogate inputs end as `INVALID_INTENT` with no row.

*Purge, replay and recovery (item 6).*
- P1: after purge, replaying under a **newer template version** → `already_queued`, original fingerprints kept.
- P2: purge, then key rotation (v1 retired, v2 active), then a replay of the v1 row → verified with v1; a different recipient → `PAYLOAD_CONFLICT`.
- P3: purge, then loss of the v1 secret → `FINGERPRINT_KEY_UNAVAILABLE`, row unchanged.
- P4: a purged row is never deleted, and the sweep never lists it again.

*Audit coverage robustness (item 6).*
- A1: audit rows whose `source_event_id` is `"abc"`, `"-1"`, `"1.5"`, `"99999999999999999999"`, missing, or a JSON number with an unknown source → reported as `malformed_audit_metadata`; the function **does not throw**.
- A2: a decision whose only audit row is malformed is reported as `missing_audit_event` as well; the gap is never hidden.

### 11.3 Concurrency: `lib/calendar/notification-outbox.db.test.ts`

This runs in the existing CI step "Unit tests incl. DB catalog parity", using the `docker exec … psql` approach of `package-pricing.db.test.ts`. No workflow or `package.json` change is needed. Separate `psql` processes are coordinated with `pg_advisory_lock` barriers, and `lock_timeout` turns any unexpected wait into a failure. The **simulated refund** is test-only SQL: it locks the reservation `FOR UPDATE`, then sets the reservation and its days to `REFUNDED`. It follows exactly the rule §6.2 sets for a future refund function.

| ID | Scenario | Expected |
|---|---|---|
| C1 | 20 parallel enqueues of one reservation | one `queued`, 19 `already_queued`, one row |
| C2 | 10 parallel claims of one due row | exactly one lease |
| C3 | Claim racing lease expiry | never two `SENDING` attempts for one (epoch, attempt) |
| C4 | Stale ack racing re-claim | the stale ack always gets `STALE_LEASE` |
| R1 | Refund commits, then claim | hold `reservation_no_longer_paid`; nothing returned |
| R2 | Refund holds the reservation `FOR UPDATE` (open transaction) while claim runs | **claim does not block** (completes under a 2 s `lock_timeout`) and sees `PAID` (the refund isn't committed yet) |
| R3 | Claim → refund commits → ack `accepted` | `SENT`, `sent_after_refund = true`, event code `reservation_refunded_during_send` |
| R4 | Claim → refund → ack `rejected_retryable` | `DELIVERY_UNCERTAIN` / `reservation_no_longer_paid` |
| R5 | Claim → refund → ack `unknown`; and claim → refund → lease expiry | `DELIVERY_UNCERTAIN` / `reservation_no_longer_paid`, `epoch_unknown_outcome = true` |
| R6 | Refund transaction open while enqueue runs | enqueue waits, then gets `SCOPE_MISMATCH` after the refund commits, or `queued` if the refund rolls back |
| R7 | Refund racing a restart request and a restart approval | both refused once the refund has committed |
| R8 | 200 randomized interleavings of enqueue, claim, ack, expire, refund, record-language, resolve, approve and purge | **no deadlock (`40P01`) observed** (evidence, not proof); invariants hold: at most one `SENDING` attempt per (key, epoch, attempt); `SENT` at most once; no claim of a row whose reservation was not `PAID` when the claim read it; no outbox row deleted; audit coverage empty |
| R9 | A resolve in org X while another transaction holds X's audit lock (an unrelated audited `public` write, kept open) | resolve waits only at its final audit insert, then completes; no deadlock |
| R10 | Purge running while an enqueue replay holds a final row `FOR UPDATE` | purge skips that row (no wait) and purges it on the next run |
| R11 | A simulated refund using `FOR NO KEY UPDATE` while enqueue inserts (foreign-key share lock) and while record-language runs | enqueue and refund serialize on R; no deadlock; outcome as in R6 |
| C5 | Two different reviewers approve the same restart request concurrently | exactly one succeeds; the other gets `INVALID_TRANSITION` (request already consumed); exactly one `RESTART_APPROVED` event and one audit row |

### 11.4 Existing gates that must stay green

These are everything from run 42558696194: lint, typecheck, 301 unit tests, the build, migrations from scratch, all existing pgTAP files, DB lint, the generated-types check, the four concurrency suites, the audit checkpoint (which now also covers the new `audit_events` rows) and 49 E2E tests.

**Check first:** if `calendar_reservations.test.sql` asserts the exact `reservations` column list, the new column needs a one-line, visible update to that test.

---

## 12. Database identities and permissions

### 12.1 In 2A

| Identity | Access to the new objects |
|---|---|
| `anon`, `authenticated`, `service_role` | none |
| owner (`postgres`) | owns the objects; `security definer` functions run as it |
| CI tests | test-only grants inside rolled-back transactions; JWTs simulated with `request.jwt.claims` (including `aal`) |

### 12.2 Provisional D1 and D2 for 2B (not part of 2A)

| Duty | Identity | `EXECUTE` on |
|---|---|---|
| Settlement and sweep | `calendar_settlement`: NOLOGIN group plus one LOGIN member, direct pooler connection, secret only in the webhook or sweep service | `confirm_test_checkout_paid`, PAID loader (2B), `enqueue_…`, `list_missing_…` |
| Delivery | `calendar_outbox_worker`: same pattern, secret only in the worker (Batch 3) | `claim_…`, `acknowledge_…`, `expire_…_leases`, `read_…_status`, `purge_…` |
| Reviewer | the signed-in user (`authenticated`) through a reviewed wrapper (2B) | `resolve_…`, `approve_epoch_restart`, `record_supporter_language`, `read_confirmation_backlog` (each checks `is_notification_reviewer`) |
| Designation and allowlist management | 2B functions | to be specified in 2B |

Neither LOGIN role has table privileges, is reachable through PostgREST, or uses `service_role`. `USAGE` on `calendar_private` is granted only to these roles.

### 12.3 2B gate: trusted identity at the reviewer call boundary

`auth.uid()` and `auth.jwt()` read the `request.jwt.claims` setting. PostgREST sets it from a JWT whose signature it has verified, **but any session that can run SQL can also set it itself**. The internal checks in §5 are therefore only as trustworthy as the path that reaches them. Before 2B grants anything:

1. **Reviewer functions are granted to `authenticated` only.** That covers `resolve_donor_confirmation`, `approve_epoch_restart`, `record_supporter_language` and `read_confirmation_backlog`. `authenticated` is a NOLOGIN role reached only through PostgREST/Supabase API with a verified JWT. **No LOGIN role** (settlement, worker, operators) may ever hold `EXECUTE` on them, because a direct connection could forge claims.
2. **The 2B wrapper** (a narrowly granted `public` function, or a server action calling through the user's session) is reviewed to show that the claims come from the platform's verified JWT and never from caller input.
3. **A mandatory 2B test** connects as the worker and settlement roles, sets `request.jwt.claims` to a designated reviewer's id with `aal2`, and must get **permission denied** on every reviewer function.
4. **Already enforced in 2A and unchanged:** different requester and approver (T1); the requester re-checked at approval (T3); designation, membership, MFA and payment status re-checked at each call (T2, T8).
5. **No grants exist in 2A.**

---

## 13. Security review (revised)

This is still the implementer's own review. Findings 1–6 are now addressed.

| # | Threat | Severity | Mitigation |
|---|---|---|---|
| S1 | Caller-chosen time | High | No time parameters; `clock_timestamp()` only |
| S2 | Spoofed or implicit reviewer | High | `auth.uid()` only; explicit, expiring per-org designation; live membership; `aal2`; **no platform-admin bypass** |
| S3 | Over-privileged identity | High | 2A has no grants; 2B uses per-duty, function-only roles |
| S4 | Forged or cross-tenant intent | High | Facts rebuilt from the locked PAID reservation; strict parse; key CHECK |
| S5 | Tampered or drifted payload | High | **DB recomputes both digests**; claim re-verifies stored payload; golden vectors |
| S6 | Duplicate send through races | High | PK + UNIQUE; `ON CONFLICT`; `SKIP LOCKED`; lease compare-and-set |
| S7 | Duplicate after deleting a row | High | DELETE blocked; purge clears columns only |
| S8 | Deadlock or stall between refund and outbox paths | High | Single lock order; claim and ack never lock reservations (R2, R8) |
| S9 | Restart causing an unjustified duplicate | High | Provider evidence, duplicate-risk acknowledgement, still-PAID check, **second reviewer**, TTL, epoch check |
| S10 | Refunded donor gets a thank-you | Medium | Hold at claim; refund-aware ack and expiry; a race is flagged `sent_after_refund` |
| S11 | Donor email kept after purge | Medium | Unsalted digests and recipient cleared; per-row salted fingerprints only (limit stated in §8) |
| S12 | Personal data in the audit trail | Medium | No free text; evidence reference pattern excludes `@`; metadata contains ids and codes only |
| S13 | Wrong or guessed language | Medium | Fail closed; set-once recording with evidence; never overwritten |
| S14 | Sending to real donors from TEST | Medium | `mode = 'test'` CHECK; **allowlist enforced in the claim query** |
| S15 | Rewritten history | Medium | Append-only tables; decisions hash-chained in `audit_events` |
| S16 | Stale reviewer decision | Medium | `p_expected_epoch` check (`STALE_REVIEW`) |
| S17 | Policy loosened by a caller | Low | Single policy row with CHECK bounds; MFA and the two-person rule are not settings |
| S18 | Fingerprint key leaked through a dump or backup | Medium | Key held in Vault, encrypted outside the database; versioned; rotation and compromise procedure (§17.2) |
| S19 | Fingerprint key lost | Medium | Fails closed (`FINGERPRINT_KEY_UNAVAILABLE`); never a false "already queued" (§17.2) |
| S20 | A decision without an audit record, or an audit record without a decision | Medium | Same transaction; 1:1 source link; coverage verifier; hash chain (§17.4) |
| S21 | Deadlock via the audit advisory lock | Medium | Audit insert is always the last lock; one decision per transaction (§17.1) |

---

## 14. Decisions

| ID | Marc's decision (2026-11-09) | How 2A reflects it | Still open |
|---|---|---|---|
| D1 | Separate function-only settlement and worker identities | No grants; §12.2 is the 2B design | Role names and secret storage (2B) |
| D2a | **Only designated Aspire directors may appoint reviewers** | No appointment path in 2A; §17.3 proposes the 2B mechanism | The appointer list itself (2B) |
| D2b | **Platform staff review only when explicitly authorized for the organization** | `platform_staff` basis requires an explicit per-organization designation; the platform-admin bypass is not used | — |
| D2c | **MFA mandatory** | `aal2` fixed in `is_notification_reviewer`; no setting | Reviewers must enrol in MFA before 2B |
| D2d | **Two different authorized reviewers to restart** | Fixed in code: request plus approval by a different current reviewer | — |
| D3 | Hold refunded reservations for review | §6 | — |
| D4 | Capture the actual language; fail closed; **no automatic fallback** | §9; no bilingual template | `reserve()` change (2B) |
| D5 | **Provisional 30-day payload retention** | Policy default; purge exists but isn't scheduled | Final period |
| D6 | **TEST allowlists managed by designated Aspire administrators** | Enforced in claim; table empty | Management functions and the administrator list (2B) |
| D7 | Reservation contact-data retention, separately | Not in 2A | Separate decision |
| K1 | Fingerprint key management: **Vault-keyed HMAC, no fallback** (independent review on #30) | §10.3, §10.6, §17.2 | Vault availability to be verified in CI; if unavailable, stop and return to the director |
| D2e | *(open)* Separation of the reviewer-appointing director from review | Already enforced: no self-appointment; one person can't be both restart reviewers (T1) | **Director decision.** The independent review recommends that an appointing director not also act as a reviewer for organizations they appoint for. |
| G1 | *(new)* Gate on future refund, wrapper and worker code | §17.1 | Each requires an independent N1–N4 lock-order check and its own concurrency tests before approval |

**Options for the reviewer to consider:**
- An HMAC fingerprint with a key held outside the database (§8).
- Amending Batch 1 to allow `PENDING → DEAD_LETTER` for refunds, so no review is needed (not proposed).

---

## 15. Files, delivery and rollback

| File | Change |
|---|---|
| `supabase/migrations/2026MMDD000100_calendar_notification_outbox.sql` | new (§10) |
| `supabase/tests/calendar_notification_outbox.test.sql` | new (§11.1–11.2) |
| `lib/calendar/notification-digest-vectors.test.ts` | new (§11.1) |
| `lib/calendar/notification-outbox.db.test.ts` | new (§11.3) |
| `docs/calendar/sharing-and-confirmation-checkpoint.md` | Batch 2A section |
| `lib/database/types.gen.ts` | regenerated; expected unchanged (`calendar_private` is not exposed) |

**Delivery, after approval only:**
1. Recheck the baseline.
2. Branch `claude/calendar-outbox-durable-2a-<date>`.
3. Implement as approved.
4. Run local checks: lint, typecheck, unit tests, build. Database tests run locally only if Docker is available.
5. Push only that branch, as a **DRAFT** PR into the calendar branch for CI evidence. Record head, merge, tree and every job.
6. Integration is a separate approval; it redeploys the synthetic preview, which migrates nothing.
7. No hosted migration in Batch 2.

**Rollback:** 2A is additive (seven tables, one nullable column, 28 functions) and reaches no hosted database. Rolling back means reverting the commit.

---

## 16. Reviewer checklist for the final approval

1. The canonical format (§4.1) matches Batch 1, and the database is the right enforcement point (§4.2).
2. The reviewer model removes the platform-admin bypass and handles stale identity (§5).
3. The lock-order rule is deadlock-free, and the unlocked status read is an acceptable trade-off (§6.2).
4. The refund race outcomes (§6.1, R1–R8).
5. The evidence rules and the two-person restart (§7).
6. Salted fingerprints, and the stated limit (§8).
7. Language recovery (§9).
8. The 2A / 2B / Batch 3 boundary (§1.1).
9. The four verification-focus areas in §17, which Marc asked the final review to verify.

---

## 17. Verification focus for the final review

### 17.1 Refund/claim locking model

**Lock inventory.** Every lock any 2A function takes, plus the rule for the future refund:

| Class | Resource | Mode | Taken by |
|---|---|---|---|
| R | `calendar_private.reservations` row | `FOR SHARE` | enqueue |
| R | same | `FOR UPDATE` | record language |
| R | same | `FOR NO KEY UPDATE` | **future refund** (rule; the simulated refund in tests uses it) |
| R | same | `FOR KEY SHARE` (implicit, foreign-key check) | outbox insert (enqueue) and language-event insert, while the same transaction already holds a stronger R lock |
| O | `notification_outbox` row | insert / `FOR UPDATE` | enqueue (new row / replay) |
| O | same | `FOR UPDATE SKIP LOCKED` | claim, lease expiry, purge |
| O | same | `FOR UPDATE` | acknowledge, resolve, approve |
| O | same | `FOR KEY SHARE` (implicit, foreign-key check) | `notification_events` inserts, while the same transaction already holds O `FOR UPDATE` |
| U | unique index on `key` (speculative insert) | wait | concurrent enqueues of the same key |
| A | per-organization advisory lock `hashtextextended('audit_events:'‖org, 0)` | exclusive, transaction-scoped | the `audit_events` hash-chain trigger: resolve, approve, record language, **and every other audited write in that organization across the platform** |
| — | policy row, key table, Vault, reviewer events, membership | plain reads | many; no locks |

**Global order: R → O (and U) → A.**

| Operation | Acquires (waiting) | Order |
|---|---|---|
| enqueue | R share → U/O | ascending |
| claim / expire / purge | O, SKIP LOCKED only (never waits) | — |
| acknowledge | O | — |
| resolve / approve | O → A | ascending |
| record language | R → A | ascending |
| future refund | R (→ A if it audits, last) | ascending |
| any other audited platform write | A only, unless it then calls into calendar functions (forbidden, below) | — |

**Lock-ordering argument** (for 2A's functions, **conditional on N1–N4**; this is an argument, not a proof over all schedules):
1. A deadlock needs a cycle of transactions, each holding one lock while waiting on another.
2. Every transaction above waits for its locks in strictly ascending class order. Transactions that hold several locks of one class (claim, expire, purge holding several O rows) acquire the additional ones only with `SKIP LOCKED`, which never waits. No transaction waits on more than one R.
3. In any cycle, some transaction would therefore have to wait on a lower class while holding a higher one. No transaction does that.
4. **Revision 1's tuple-lock queueing problem cannot recur.** It needs a transaction waiting on R while holding O. In this design, claim, ack, expire, resolve and approve read the reservation status without locking it.

**Normative rules for code outside 2A**, because the argument depends on them:
- **N1.** A refund function locks only R, with `FOR NO KEY UPDATE`. It never touches outbox rows. If it writes `audit_events`, that is its last write.
- **N2.** One decision function per transaction. Two resolves for different organizations in one transaction would hold A₁ while waiting on O₂.
- **N3.** 2B wrappers must not make an audited `public` write and then call a calendar function in the same transaction (that would take A before R or O).
- **N4.** Calendar functions run at `READ COMMITTED`, enforced by `outbox_require_read_committed()`. The unlocked status reads must see the latest committed refund, and `SKIP LOCKED` semantics assume it.

**Accepted race, with exact semantics.** Claim reads `PAID` and then a refund commits before the provider call. The email is sent, and acknowledge records `sent_after_refund = true` with event code `reservation_refunded_during_send`. Any outcome other than a definitive acceptance or permanent rejection is held as `reservation_no_longer_paid`. Taking R in claim would not close this window anyway, because the email leaves after claim commits. It would only re-introduce the cycle.

**Evidence and its limits:** R1–R11 and C1–C5 (§11.3) exercise the specific races. R8's 200 randomized interleavings can show that **no deadlock was observed** in those runs; they cannot prove deadlock-freedom over all schedules.

**Gate on future code (normative):** N1–N4 constrain code that 2A does not implement. **No refund function, 2B wrapper, worker or other caller of these functions may be approved** without (a) a written check of its lock acquisition against N1–N4, reviewed independently, and (b) its own concurrency tests against enqueue, claim, acknowledge, lease expiry and the audit advisory lock.

### 17.2 Recipient fingerprints and key management

**Construction.** `fp = hex(HMAC-SHA256(K_v, salt ‖ ':' ‖ canonical))`, using pgcrypto `extensions.hmac`, which the repository already uses as `extensions.digest`.
- `salt` is 122 random bits per row.
- `canonical` is the §4.1 byte format.
- `v` is stored on the row.
- **Purpose:** detect a changed recipient or changed facts on replay, including after purge, without keeping the address.

**What each attacker can do:**

| Attacker | Can they test a guessed email against a purged row? | Why |
|---|---|---|
| Application roles (`anon`, `authenticated`, `service_role`) | No | No access to `calendar_private` at all |
| A stolen backup, dump or replica of the tables, or SQL read access to `calendar_private` without Vault | **No** | `K_v` is not in those tables. Vault stores it encrypted, with a root key Supabase holds outside the database. |
| Database owner or superuser | Yes, one guess at a time per row | They can read Vault, but they can equally read `reservations.supporter_email` today (D7), so no new exposure |
| Anyone, using precomputed tables or matching across rows | No | Per-row salt plus a secret key |

**Lifecycle.**
- **Generation (hosted environments; separate approval and runbook).**
  - An authorized operator generates 32 random bytes outside the repository, for example `openssl rand -base64 32`. That produces the **only accepted format**: canonical padded Base64, exactly 44 characters, decoding to exactly 32 bytes (§10.6). Anything else is treated as unavailable.
  - They store the value with `vault.create_secret(<value>, 'calendar_outbox_fp_v1')`.
  - They insert and activate the version-1 row.
  - The value is never in a migration, a commit, a ticket, chat, logs or application environment variables.
- **CI.** Test transactions create random throwaway secrets and roll them back. No committed key exists anywhere.
- **Rotation.**
  - Create the v(n+1) secret.
  - In one transaction, activate v(n+1) and set `retired_at` on vn. The unique index allows only one active key.
  - New rows use v(n+1). Existing rows always verify with their own version, so retired secrets stay in Vault as long as any row references them. Version rows cannot be deleted.
  - *Optional re-keying (2B, operator function):* rows that still have their payload can be re-fingerprinted under the new key. Purged rows cannot be, and keep their version.
- **Compromise.**
  - Rotate immediately.
  - Rows under the leaked version stay guessable by whoever holds that key. Their exposure is the same as the plaintext they replaced, and it is bounded to purged rows.
  - Record the incident in the organization's audit trail (2B operator path).
- **Loss.** If a version's secret is lost, replays of its rows fail closed with `FINGERPRINT_KEY_UNAVAILABLE`. Nothing is queued twice, and nothing is falsely reported as already queued. The sweep reports these rows, and a reviewer can abandon them with evidence.
- **No active key.** Enqueue fails closed, so nothing is queued until a key is provisioned. Batch 3 adds monitoring.

**Dependency: no fallback** (per the issue #30 review).
- This requires Supabase Vault (`vault.decrypted_secrets`) both in the local CI stack and in any hosted project that is later approved.
- The repository's `supabase/config.toml` has `[db.vault]` commented out, and no existing migration uses Vault, so availability is **unconfirmed**.
- The 2A migration **aborts** if `vault.decrypted_secrets` doesn't exist (§10.3). If that happens in CI or in an approved hosted environment, implementation stops and **returns to the director**. There is **no** silent downgrade to unkeyed salted fingerprints.

**Batch 1 unsalted digests** (`facts_digest`, `content_digest`) exist only while the plaintext payload is present, and are cleared at purge. They expose nothing the row doesn't already hold in plaintext.

### 17.3 Two-person authorization

**Identities.** The requester (Q) and the approver (P) are each identified only by `auth.uid()` from a platform-verified JWT. Each must have `aal = aal2` at their own call, and each must pass `is_designated_reviewer(org, uid)`:
- the latest designation event is `GRANTED` and not expired
- the organization is active
- for `org_member`: live active membership; for `platform_staff`: live `platform_admins` membership **plus** the explicit designation

`has_org_permission` and `is_platform_admin` are never consulted.

**Invariants enforced in `resolve_donor_confirmation` and `approve_epoch_restart`.**

| # | Invariant | Mechanism |
|---|---|---|
| T1 | P ≠ Q | `restart_requested_by = auth.uid()` → `SECOND_REVIEWER_REQUIRED` |
| T2 | Q and P are reviewers of **the row's** organization | `is_notification_reviewer(o.organization_id)` at each call |
| T3 | Q is **still** a reviewer when P approves | `is_designated_reviewer(org, Q)` → `REQUESTER_NO_LONGER_AUTHORIZED` |
| T4 | P approves exactly the request and epoch Q created | `p_restart_request_id` and `p_expected_epoch` must match → `INVALID_TRANSITION` / `STALE_REVIEW` |
| T5 | Bounded in time | `restart_request_ttl`, 7 days by default → `RESTART_REQUEST_EXPIRED` |
| T6 | Evidence from the provider, not a dashboard showing nothing | Q's evidence kind ∈ {`provider_api_lookup`, `provider_support_case`} plus a reference |
| T7 | Both accept the duplicate risk on record | Q: `p_duplicate_risk_acknowledged`. P: `p_duplicate_risk_acknowledged` and `p_evidence_reviewed`. |
| T8 | Not for refunded or tampered rows | reservation `PAID` at both calls; hold reason ≠ `stored_payload_integrity_failure` |
| T9 | One approval only | Approval locks O and clears the request in the same transaction. A concurrent second approval sees no request → `INVALID_TRANSITION` (test C5). |
| T10 | Cannot be configured away | No policy column (schema test) |
| T11 | Both decisions durable and attributable | `RESTART_REQUESTED` and `RESTART_APPROVED` events, each with a 1:1 audit row whose `actor_id` is that reviewer (§17.4) |
| T12 | A different outcome supersedes the request | Accepted or abandon clears the pending request |

**Appointment (2B; proposed under D2a).**
- A new append-only `calendar_private.reviewer_appointers` list names the **designated Aspire directors**. Entries are added through a platform-admin path that is itself audited.
- Only listed directors, with `aal2`, may call the 2B `appoint_notification_reviewer` and `revoke_notification_reviewer` functions.
- An appointer cannot appoint themselves (the CHECK already exists in `notification_reviewer_events`).
- Appointments default to 180 days, at most 366.
- Every change writes a `notification_reviewer_events` row (`actor_user_id`) and an `audit_events` row.

**Residual risks** (for the reviewer to accept or mitigate):
- One person holding two reviewer accounts. MFA per account, director-only appointment and audit attribution make this detectable but not impossible to arrange.
- Two colluding reviewers. This is accepted and fully audited.
- An organization with fewer than two reviewers can never restart a delivery; only abandon remains. That is the intended consequence of D2d.
- **An open question for the review:** should a director who appoints reviewers be barred from also being a reviewer, as a separation of duties?

### 17.4 Audit-event integrity

**What each decision writes, in one transaction with the state change.** Either all three commit or none:
1. the outbox state change (or the reservation language)
2. one append-only row in `calendar_private.notification_events` or `reservation_language_events`, whose `id` is captured
3. one `public.audit_events` row:
   - `actor_id = auth.uid()`, a fixed `action`, `entity_type = 'calendar_notification'` and `entity_id` = the reservation id
   - `metadata` = decision fields, plus `source` and `source_event_id` (the 1:1 link), plus `public.audit_context()`, as the existing audit writers do

**Tamper evidence.**
- **`audit_events` is append-only** (the `audit_events_append_only` trigger), and **hash-chained per organization**: `chain_pos`, `prev_hash`, `row_hash = SHA-256(prev_hash ‖ canonical row)`. Positions are assigned under the per-organization advisory lock.
- `public.verify_hash_chain('audit_events', 'organization_id', org)` recomputes the chain, and CI's audit checkpoint verifies the chains and their continuity between runs.
- **`notification_events`** is append-only (trigger) but **not** hash-chained, because `hash_chain_append()` only supports `public` tables. Its integrity for decisions comes from the 1:1 link: `verify_notification_audit_coverage(org)` reports any decision event without exactly one audit row, any calendar audit row without its source event, and any calendar audit row whose source metadata is malformed (`malformed_audit_metadata`). It never throws on corrupt metadata, and never lets a malformed row hide a missing audit event.

**What this protects:**
- Changing, deleting or reordering an audit row breaks the chain.
- Deleting or forging a decision event, or a decision recorded without an audit, shows up in the coverage report.
- A crash between the steps is impossible, because they are one transaction.

**What it does not protect:**
- A superuser who disables the triggers and recomputes the whole chain. That is only detectable against an earlier exported chain head, which CI's audit checkpoint keeps today; a durable external anchor for hosted environments is a later operational decision.
- Non-decision state transitions (claims, acks) are logged in `notification_events` but not mirrored to the hash chain. They are high-volume, non-discretionary worker actions.

**Data minimization.** Audit metadata contains ids, epochs, codes and evidence references (pattern excludes `@`). There is no email, name or amount, and a test asserts this.

**Pre-existing platform behaviour to note.** `audit_events.actor_id` references `auth.users … on delete set null`, but the append-only trigger blocks that update. A reviewer's auth user who has audit rows therefore cannot be hard-deleted. This already applies to every audited actor on the platform and is not introduced by 2A.
