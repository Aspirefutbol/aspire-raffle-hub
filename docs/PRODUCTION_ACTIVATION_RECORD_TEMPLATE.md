# Aspire Raffle Hub — Production Activation Record

_Status: DRAFT until final GO_

## Release identity

- Approved production commit SHA:
- Pull request:
- Merge date/time:
- CI run:
- CI result:
- Production Preflight run:
- Preflight result:
- Preflight reviewed by:
- Preflight review date/time:

## Production database activation

- Supabase project: Aspire Raffle Hub Production
- Project ref: `bsjjzewifpbngbasdvew`
- Production Bootstrap run:
- Bootstrap result:
- Migration history verified:
- Generated TypeScript types matched:
- Public-table RLS check passed:
- Anonymous privileged RPC allowlist check passed:
- Trigger-function exposure check passed:
- Supabase Security Advisors passed:
- SSL enforcement verified:
- Operator:
- Date/time:

## Production application activation

- Netlify project: `aspirerafflehub`
- Site ID: `708004ca-d3af-4677-9a5c-c29cb98f914b`
- Production App Deploy run:
- Deploy result:
- Deployed commit SHA:
- Production login smoke:
- Public seller-route privacy smoke:
- Production Site URL:
- Operator:
- Date/time:

## Production Auth/email smoke

Use synthetic/external test data only.

- Synthetic test email:
- Invitation sent:
- Invitation received:
- Invite link returned to production host:
- Sign-in succeeded:
- Magic-link test succeeded:
- Public self-signup confirmed disabled:
- Custom SMTP confirmed:
- Tested by:
- Date/time:

## Backup/recovery/security confirmation

- Backup retention confirmed:
- PITR decision:
- Recovery decision owner:
- Database SSL enforcement:
- Network restriction posture:
- Supabase admin MFA:
- Netlify admin MFA:
- GitHub production-admin MFA:
- Second recoverable Supabase owner/admin confirmed where practical:

## Legal/compliance approval

- Operating legal entity:
- Raffle authority/eligibility approval reference:
- Official rules version:
- Prize/disclosure package version:
- Ticket price:
- Ticket numbering format:
- Permitted payment method(s):
- Sales open:
- Sales close:
- Drawing date/time:
- Drawing method:
- Record-retention approval/reference:
- Reviewer/approver:
- Approval date:

## Named operational owners

- Cash receiver:
- Check receiver:
- Money-entry operator:
- Independent amount verifier:
- Temporary custody owner/location:
- Bank deposit operator:
- Deposit-evidence custodian:
- Discrepancy-resolution owner:
- Returned-check owner:
- Drawing freeze/export operator:
- Physical/external drawing operator:
- Witness(es):
- Result recorder:
- Director certifier:
- Drawing-evidence custodian:
- User/support escalation owner:

## Live campaign review

- Live campaign ID:
- Campaign name:
- Ticket price verified:
- Prize records verified:
- Charitable purpose verified:
- Rules verified:
- Sales dates verified:
- Drawing date verified:
- Support contact verified:
- Legal operator identity/address verified:
- Reviewer 1:
- Reviewer 2:
- Review date/time:

## Final GO / NO-GO

Every item below must be YES.

- [ ] Exact production commit passed CI.
- [ ] Read-only Production Preflight passed and was reviewed.
- [ ] Production Bootstrap passed.
- [ ] Production App Deploy passed.
- [ ] Synthetic production smoke passed.
- [ ] Production invitation/email path passed.
- [ ] Legal/compliance approval complete.
- [ ] Cash/check/deposit/returned-check owners assigned.
- [ ] Drawing/witness/evidence owners assigned.
- [ ] Backup/recovery/security posture confirmed.
- [ ] Exact live campaign reviewed by two authorized people.
- [ ] No unresolved blocker remains in `PRODUCTION_READINESS_AUDIT.md`.

Decision:

- [ ] GO
- [ ] NO-GO

Decision maker:
Date/time:
Notes:

## First-live-campaign closeout

Complete after the first controlled campaign:

- Close-sales evidence:
- Frozen snapshot ID/version:
- Manifest hash:
- Export evidence/checksum:
- Drawing result evidence:
- Certification event:
- Final reconciliation result:
- Final audit/hash-chain verification:
- Incidents/exceptions:
- Post-campaign review owner/date:
