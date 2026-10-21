# Aspire Raffle Hub — Production Readiness Audit

_Audit date: 2026-10-21_

## Executive verdict

**CURRENT VERDICT: NO-GO FOR LIVE RAFFLE OPERATION**

The hosted staging product path is accepted and the current feature branch is green. The remaining blockers are production activation/configuration and Aspire operational/legal ownership, not known core application defects.

Do not accept real families, real raffle ticket sales, or real money in production until every **BLOCKER** below is closed and the final GO/NO-GO checklist in `PRODUCTION_GO_LIVE_RUNBOOK.md` is signed off.

## Verified staging baseline — PASS

- Hosted operator rehearsal completed end to end.
- Current feature branch CI passes lint, TypeScript, unit tests, build, fresh migrations, pgTAP, generated-type parity, concurrency checks, audit checks, and browser E2E.
- PR #2 remains draft and unmerged.
- Offline cash/check-only Texas pilot constraints remain in the product.
- Public Seller Sharing remains request-only and does not issue tickets or take payment.
- Drawing remains physical/external; the application freezes, exports, records evidence/results, certifies, and verifies integrity.

## Production database

### Production project identity — PASS

Verified Supabase production project:

- Name: Aspire Raffle Hub Production
- Ref: `bsjjzewifpbngbasdvew`
- Region: `us-east-2`
- PostgreSQL: 17.11
- Current project status: healthy

### Production migration parity — BLOCKER

Production currently ends at:

`20261019205330_function_privilege_hardening.sql`

The current accepted branch contains five additional migrations that are **not yet applied to production**:

1. `20261020170805_controlled_pilot_compliance.sql`
2. `20261020181102_compliance_attestation_server_guard.sql`
3. `20261020190000_prize_compliance_records.sql`
4. `20261020193000_texas_compliance_auto_required.sql`
5. `20261020202500_ticket_prize_receipt_fallback.sql`

These contain the controlled-pilot compliance, attestation, structured prize, automatic Texas compliance, and ticket-disclosure work accepted in staging.

**Required resolution:** merge an explicitly approved commit to `main`, allow full CI on that exact main commit to pass, then run the protected manual `Production Bootstrap` workflow. Review the dry-run migration preview before applying.

Do not manually patch production to skip the migration workflow.

### Production bootstrap workflow — PASS WITH ENVIRONMENT DEPENDENCY

`.github/workflows/production-bootstrap.yml` is appropriately conservative:

- manual dispatch only
- executes only from `main`
- uses GitHub `production` environment
- waits for full CI on the exact production commit
- installs dependencies from lockfile
- resolves the production Supavisor connection
- previews migration list and `db push --dry-run`
- applies tracked migrations only
- verifies migration history
- generates production TypeScript types and diffs them against committed types
- checks Supabase Security Advisors
- uses a pinned production project ref

**VERIFY before launch:** the GitHub `production` environment must actually require an authorized reviewer. Workflow syntax alone does not guarantee that a reviewer rule is configured.

### Supabase Security Advisors — PASS WITH EXPECTED WARNINGS

Current production Security Advisors report:

- no verified ERROR-level blocker surfaced in this audit
- exactly **2 anonymous SECURITY DEFINER RPC warnings**, matching the two intentional public Seller Sharing endpoints:
  - `public_seller_page`
  - `submit_seller_interest_request`
- approximately **60 authenticated SECURITY DEFINER warnings**

The authenticated functions are an expected architectural pattern only if every callable function performs its own caller/tenant/permission checks. Current staging pgTAP, permission tests, RLS tests, and hosted role rehearsals support that design.

**Required launch check:** after production migrations, rerun Security Advisors and the production workflow security gate. Any new anonymous privileged RPC outside the two approved endpoints is a blocker.

### Performance Advisors — POST-LAUNCH / CAPACITY REVIEW

Production currently reports a large number of INFO-level unindexed foreign-key findings and several multiple-permissive-policy warnings.

These are **not current first-pilot launch blockers** because:

- the first pilot is intentionally small
- accepted functional/concurrency tests are green
- these findings are performance-oriented, not current integrity failures

However, they should be tracked before broad rollout or significant volume. Do not blindly add 100+ indexes; use observed query patterns and production telemetry.

## Production web application

### Production Netlify project identity — PASS

Verified project:

- Name: `aspirerafflehub`
- Site ID: `708004ca-d3af-4677-9a5c-c29cb98f914b`
- Plan: Team Pro
- Primary current URL: `https://aspirerafflehub.netlify.app`

### Current production deployment — BLOCKER

The currently published deploy dates to **2026-10-02** and is a manual/drop deploy containing a simple generated page rather than the accepted Raffle Hub Next.js application.

It is not the current staging-approved application and has no source commit reference.

**Required resolution:** do not treat the current public site as the live app. After approved merge + production DB bootstrap, use the protected `Production App Deploy` GitHub workflow to deploy the exact approved `main` commit.

### Production application deploy workflow — PASS WITH ENVIRONMENT DEPENDENCY

`.github/workflows/production-deploy.yml`:

- manual dispatch only
- executes only from `main`
- uses GitHub `production` environment
- waits for CI success on the exact commit
- uses a pinned Netlify CLI version
- deploys to the explicit production site ID
- smoke-tests `/login`
- smoke-tests the public seller-link route
- verifies the public route carries `noindex`
- verifies an invalid public token does not expose the request form

**VERIFY before launch:** GitHub `production` environment reviewer protection is actually configured.

### Production Netlify environment — BLOCKER

Current production site variables verified:

- `NEXT_PUBLIC_SITE_URL` — present
- `NEXT_PUBLIC_SUPABASE_URL` — present and points to the production Supabase project
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — present

Missing from the production site:

- **`SUPABASE_SECRET_KEY` — not present**

The application uses the server-only secret for exact-email account lookup and invitation delivery. It must be stored only as a Netlify secret and must never use a `NEXT_PUBLIC_` prefix.

**Required resolution:** create the production `SUPABASE_SECRET_KEY` as a secret-scoped Netlify environment variable before production smoke/invitation testing.

## Supabase Auth / email — BLOCKER UNTIL VERIFIED

Before live users are invited, verify in the production Supabase Auth settings:

- production Site URL points to the intended production host/custom domain
- redirect allowlist contains only intended production callbacks
- custom SMTP is configured
- invite template is installed/tested
- magic-link template is installed/tested
- leaked-password protection remains enabled
- production invitation can be received and accepted using a synthetic external address

Supabase's built-in mail service is not appropriate for production invitation delivery.

## Backup, recovery, and platform account security — VERIFY

Current product code cannot prove the following dashboard/account settings. They must be confirmed manually before GO:

- database SSL enforcement
- database network restrictions appropriate for operations
- Supabase account MFA
- preferably Supabase organization MFA enforcement
- more than one recoverable Supabase organization owner where practical
- backup retention
- PITR decision / recovery-point objective
- named restore/recovery decision owner
- Netlify account/team MFA and least-privilege access
- GitHub account MFA for production administrators

For a system handling family data and money records, recovery must be decided before the first live transaction, not after an incident.

## GitHub repository protections — BLOCKER UNTIL VERIFIED

Verified:

- default branch is `main`
- no repository rulesets are currently returned by GitHub

Unable to verify with the connected GitHub integration:

- classic `main` branch-protection settings (GitHub returns 403 to this integration)
- required reviewers on the GitHub `production` environment

**Required resolution:** manually verify or configure:

- no unreviewed direct pushes to `main`
- PR/approval requirement for `main`
- required status check for full CI
- production environment requires an authorized human reviewer
- only appropriate administrators can approve production bootstrap/deploy

Until this is verified, production workflows are safe by design but not proven safe by repository policy.

## Upcoming Supabase platform change — VERIFY BEFORE 2026-10-30

Supabase is enforcing explicit Data API exposure/grants for existing projects on **2026-10-30**.

The application already uses deliberate ACL hardening and explicit function grants in important areas, but the production readiness review should include a final Data API table/function grant check before that platform cutoff.

**Required resolution:** after the final migrations are applied, run current Security Advisors and verify every app-required table/RPC remains intentionally reachable to its required role and no unintended table/function is exposed.

## Legal/compliance — BLOCKER

The software records and enforces the controlled workflow; it does not establish legal raffle authority.

Before GO, Aspire leadership plus the appropriate legal/compliance reviewer must approve:

- correct operating legal entity
- eligibility/authority to conduct the raffle
- official rules
- prize disclosures and prize evidence
- ticket pricing/numbering/delivery/payment method
- sales dates and cutoff
- drawing process
- winner/result documentation
- recordkeeping and retention obligations

## Operational ownership — BLOCKER

Named owners are still required for:

- physical cash receiver(s)
- physical check receiver(s)
- turn-in cadence
- money-entry operator
- independent amount verifier
- temporary physical custody
- bank deposit operator
- deposit-evidence retention
- discrepancy resolution
- returned-check follow-up
- drawing freeze/export operator
- physical/external drawing operator
- witness(es)
- result recorder
- Director certifier
- drawing-evidence custodian
- user/support escalation owner

These should be names/roles, not “the club” or “admin”.

## Final launch sequence

Do not improvise the order.

1. Close legal/compliance decisions.
2. Assign operations owners.
3. Verify GitHub `main` + production-environment protections.
4. Configure production Auth URL/redirects/SMTP/templates.
5. Add Netlify server-only `SUPABASE_SECRET_KEY`.
6. Confirm backup/PITR/MFA/recovery posture.
7. Approve and merge PR #2 to `main`.
8. Require full CI PASS on the exact `main` commit.
9. Run Production Bootstrap; review dry-run first.
10. Confirm migration/type/security-advisor parity.
11. Run Production App Deploy for the same exact commit.
12. Run production synthetic smoke and invitation test.
13. Create exact live campaign.
14. Two authorized people review live campaign settings/disclosures.
15. Leadership performs final GO/NO-GO.
16. Only then invite real families / record live tickets or money.

## Audit status summary

| Area | Status |
|---|---|
| Staging product acceptance | PASS |
| Current branch CI | PASS |
| Production Supabase identity/health | PASS |
| Production DB current migration parity | **BLOCKER** |
| Production bootstrap workflow design | PASS |
| Production security advisor critical state | PASS / expected warnings |
| Production Netlify site identity | PASS |
| Current production app deploy | **BLOCKER** |
| Production Netlify public vars | PASS |
| Production server-only secret | **BLOCKER** |
| Production Auth/SMTP/invite path | **BLOCKER / VERIFY** |
| Backup/PITR/MFA/recovery posture | VERIFY |
| GitHub main/environment protections | **BLOCKER / VERIFY** |
| Legal/compliance approval | **BLOCKER** |
| Cash/check/drawing/support ownership | **BLOCKER** |
| Broad-scale DB performance tuning | POST-LAUNCH |
| Supabase Oct. 30 Data API grant transition | VERIFY |

## Bottom line

**Raffle Hub is staging-ready, but not yet production-live-ready.**

That is a healthy result. The audit found no reason to redesign the core application. The remaining work is a controlled production activation and governance checklist. We should preserve the green staging baseline and close these blockers deliberately rather than rushing a merge or deployment.
