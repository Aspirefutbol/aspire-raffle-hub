# Aspire Raffle Hub — Final Production Readiness Audit

_Audit date: 2026-10-21_

## Executive verdict

**Current live-operation verdict: NO-GO for real families / real tickets / real money.**

This is a controlled pre-launch NO-GO, not a product failure. The raffle product and local CI baseline are strong, but the production cutover is intentionally incomplete. The remaining blockers are explicit environment/configuration, hosted-schema parity, legal/compliance approval, and operational ownership items.

Production must remain free of live raffle data until every item in the GO section is closed.

## Environments audited

### Supabase staging

- Project: Aspire Raffle Hub Staging
- Project ref: `ixhpidqhqzbpfbklofrs`
- Region: `us-east-2`
- Status: ACTIVE_HEALTHY
- Hosted rehearsal data exists here only.
- At audit start, hosted staging migration history stopped at `20261020181102_compliance_attestation_server_guard`.
- The branch also contains:
  - `20261020190000_prize_compliance_records`
  - `20261020193000_texas_compliance_auto_required`
  - `20261020202500_ticket_prize_receipt_fallback`
- Therefore hosted staging was three migrations behind the green branch at audit start.

Remediation committed during this audit:

- Hosted QA now links the staging project itself.
- It previews pending migrations.
- It applies only committed migrations with `db push`.
- It verifies migration history.
- It regenerates linked TypeScript types and diffs them against the committed contract.
- It lints the linked staging schema before the Netlify deploy.
- It continues to enforce leaked-password protection and hosted privacy smoke checks.

This item is closed only after the new Hosted QA run passes and the remote migration list contains the full branch history.

### Supabase production

- Project: Aspire Raffle Hub Production
- Project ref: `bsjjzewifpbngbasdvew`
- Region: `us-east-2`
- Status: ACTIVE_HEALTHY
- Organization plan: Pro
- Production database currently contains:
  - 0 auth users
  - 0 organizations
  - 0 campaigns
  - 0 raffle sales
  - 0 tickets
- Every existing public table reports RLS enabled.

Production is intentionally pre-launch and contains no live family or raffle data.

At audit start, production migration history stopped at `20261019205330_function_privilege_hardening`. It does not yet contain the current compliance/prize migrations. Do not repair this manually in the Dashboard.

Remediation committed during this audit:

- Production database migrations may run only from merged `main`.
- The job remains manual and protected by the GitHub `production` environment.
- It uses the repo-pinned Supabase CLI via `npm ci`.
- It previews pending migrations with a dry run.
- It runs linked schema lint before and after the migration.
- It applies only committed migrations.
- It verifies remote migration history.
- It regenerates production TypeScript types and diffs them against the committed contract.
- It queries Supabase Security Advisors after migration.
- It blocks security-advisor ERROR findings, leaked-password-protection regressions, and any anonymous SECURITY DEFINER RPC outside the two approved supporter endpoints.

Approved anonymous privileged endpoints:

- `public_seller_page`
- `submit_seller_interest_request`

Production migrations must not be run from the feature branch.

## Supabase advisor baseline

Current production Security Advisor findings:

- 2 anonymous SECURITY DEFINER warnings — intentional supporter endpoints listed above.
- 60 authenticated SECURITY DEFINER warnings — these are part of the RPC authorization architecture and must continue to be protected by internal permission checks, explicit EXECUTE grants, RLS, and the existing pgTAP/function-privilege regression suite.
- No Security Advisor ERROR finding was observed during this audit.

Current production Performance Advisor findings include:

- unindexed foreign keys
- multiple permissive policies
- unused indexes
- auth DB connection configuration information

These are not classified as blockers for the first small controlled pilot because production currently contains no data and the accepted test suite exercises the authorization model. They should be revisited before broader club-wide scale. Do not bulk-add indexes merely to clear an advisor count without query evidence.

## Backups and recovery

The Supabase organization is on Pro. Current Supabase documentation provides automatic daily database backups for Pro projects with 7-day retention.

Status:

- Daily managed backup capability: AVAILABLE through the Pro plan.
- Point-in-Time Recovery: NOT VERIFIED / separate add-on.
- Restore drill: NOT YET VERIFIED.

Decision required before broad rollout:

- Aspire must decide whether a daily-backup recovery point is acceptable for the controlled pilot or whether a lower RPO justifies PITR.

A PITR purchase is not automatically required by this audit; the recovery objective must be an explicit business decision.

## Netlify staging

- Site: `aspire-raffle-hub-staging`
- Plan: Pro
- Current accepted deploy title at audit start referenced branch commit `54614ea`.
- Site points to the staging Supabase project.
- Server secret is configured on staging.
- Hosted QA workflow has now been hardened to migrate and verify the remote database before each deploy.
- Netlify CLI is pinned to a fixed version in the workflow rather than using `@latest`.

## Netlify production

- Site: `aspirerafflehub`
- Plan: Pro
- Current primary URL: `https://aspirerafflehub.netlify.app`
- The published site at audit start is an old manual October 2 single-page deploy, not the current Raffle Hub application.
- Production public Supabase URL/key point to the correct production Supabase project.
- `SUPABASE_SECRET_KEY` is currently not configured on the production Netlify site.

The missing server secret is a real functional blocker: the application intentionally refuses admin invitation operations when `SUPABASE_SECRET_KEY` is absent.

Remediation committed during this audit:

- Added a manual Production App Deploy workflow.
- It runs only from merged `main`.
- It requires the protected `production` environment.
- It waits for full CI on the exact main commit.
- It deploys atomically to the existing production Netlify site.
- It uses a fixed Netlify CLI version.
- It runs production login and public-supporter privacy smoke checks after deployment.

The production app must not be deployed until the Netlify production server secret and Auth settings below are confirmed.

## Production Auth / email configuration — manual verification required

The available connectors do not expose all hosted Supabase Auth configuration, so these remain explicit launch checks:

- [ ] Production Auth Site URL is the intended production URL/custom domain.
- [ ] Allowed redirect URLs include only intended production authentication callbacks.
- [ ] Custom SMTP is configured for production Auth email delivery.
- [ ] Production invite and magic-link templates are configured and tested.
- [ ] Leaked-password protection remains enabled.
- [ ] Public self-signup remains disabled.
- [ ] Anonymous sign-in remains disabled.
- [ ] Production `SUPABASE_SECRET_KEY` is stored as a Netlify secret and is never client-prefixed or committed.

## Current Texas CREA alignment

The controlled-pilot software path is intentionally conservative:

- offline cash/check sale recording
- public Seller Sharing is request-only
- no public online raffle checkout
- fixed ticket price/numbering
- structured prize records
- ticket disclosure generation
- raffle-year count
- drawing date and evidence
- prize possession/bond evidence
- non-cash prize controls
- append-only correction/custody/drawing history

Current Texas statutory assumptions used by the product must still be approved for Aspire's actual legal entity and raffle by the appropriate reviewer before live operation. Software checks are not legal authorization.

## External legal/compliance GO items — Aspire owned

Before any live raffle:

- [ ] Confirm the qualified legal entity that will conduct the raffle.
- [ ] Confirm the legal name/address that must appear on the ticket.
- [ ] Confirm CREA qualification and authority for the planned raffle.
- [ ] Approve official rules.
- [ ] Approve prize descriptions, sources, values and possession/bond evidence.
- [ ] Approve ticket price, numbering, payment method and delivery procedure.
- [ ] Approve promotion/sales method and who is authorized to sell.
- [ ] Approve sales dates, cutoff, drawing method/date/location and record retention.
- [ ] Confirm charitable use of proceeds.

Any uncertainty around the legal entity/name must be resolved before creating the production organization record or printing live tickets.

## Operational GO items — Aspire owned

Named owners must be assigned before first live sale:

- [ ] Physical cash receiver
- [ ] Physical check receiver
- [ ] Turn-in frequency / deadline owner
- [ ] Money-entry operator
- [ ] Independent receipt verifier
- [ ] Bank deposit owner
- [ ] Deposit-evidence retention owner/location
- [ ] Returned-check follow-up owner
- [ ] Drawing operator
- [ ] Drawing witness requirement
- [ ] Drawing evidence custodian
- [ ] Director certifier
- [ ] Family/operator support owner

## Technical GO sequence

Do not reorder these steps.

1. Current feature CI is green.
2. Hardened Hosted QA applies all committed migrations to staging.
3. Hosted staging type parity, schema lint, deploy, and smoke checks pass.
4. Perform focused hosted smoke of the structured prize/compliance path.
5. Resolve all production Auth/email/server-secret items.
6. Resolve legal/compliance and operational ownership items.
7. Merge PR #2 to `main`.
8. Confirm CI passes on the exact merged main commit.
9. Run the manual Production Bootstrap workflow from `main`.
10. Verify production migration history, linked types, schema lint, and Security Advisors.
11. Run the manual Production App Deploy workflow from the same approved main commit.
12. Complete production synthetic smoke only.
13. Record launch evidence and obtain explicit leadership GO.
14. Only then create the live organization/campaign and permit real sales.

## Final GO / NO-GO rule

The first live Aspire raffle is **GO only when every external, operational, Auth/configuration, database, deployment and smoke item above is closed with evidence.**

Until then:

**NO-GO for real families, real raffle tickets, or real money.**

Synthetic staging work remains permitted.
