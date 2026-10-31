# Aspire Raffle Hub — Production Manual Setup Checklist

_Last updated: 2026-10-21_

This checklist contains only the production items that require a human administrator in GitHub, Supabase, or Netlify. Do not enter secrets into source control, tickets, screenshots, or chat.

## 1. Netlify production secret

Project: **aspirerafflehub**  
Site ID: `708004ca-d3af-4677-9a5c-c29cb98f914b`

Already verified:

- `NEXT_PUBLIC_SITE_URL=https://aspirerafflehub.netlify.app`
- `NEXT_PUBLIC_SUPABASE_URL=https://bsjjzewifpbngbasdvew.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is present

Still required:

- [ ] Add `SUPABASE_SECRET_KEY` to the Netlify site.
- [ ] Mark it as a secret.
- [ ] Do not use a `NEXT_PUBLIC_` prefix.
- [ ] Scope it to the production application runtime/build contexts required by the site.
- [ ] Do not paste the value into GitHub, docs, or chat.

The production deploy workflow will fail closed if this key is missing.

## 2. Supabase production Auth

Project: **Aspire Raffle Hub Production**  
Project ref: `bsjjzewifpbngbasdvew`

Set/verify:

- [ ] Site URL is exactly `https://aspirerafflehub.netlify.app` until a custom production domain is approved.
- [ ] Redirect allowlist includes the production `/auth/confirm` callback only as required.
- [ ] Public user signup is disabled.
- [ ] Email Auth remains enabled for invited users.
- [ ] Custom SMTP is configured.
- [ ] SMTP sender/from address is an Aspire-controlled address.
- [ ] Invite template is installed and branded.
- [ ] Magic-link template is installed and branded.
- [ ] Leaked-password protection remains enabled.

After configuration:

- [ ] Send one production invitation to a synthetic/external test address.
- [ ] Confirm the email is received.
- [ ] Confirm the link returns to the production host.
- [ ] Confirm the invited account can sign in.
- [ ] Confirm no unintended self-signup path exists.

The Production Bootstrap workflow independently re-checks Site URL, callback allowlist, closed public signup, email Auth, and custom SMTP before migrations are allowed to run.

## 3. Supabase production database/security

Verify in the Supabase production dashboard:

- [ ] Database SSL enforcement is enabled.
- [ ] Backup retention is understood.
- [ ] Decide whether PITR is enabled for the first live campaign.
- [ ] Name the person who owns restore/recovery decisions.
- [ ] Review database network restrictions and document the selected posture.
- [ ] Supabase administrator account(s) use MFA.
- [ ] Prefer organization-level MFA enforcement if available/appropriate.
- [ ] Ensure there is a recoverable second organization owner/admin where practical.

Do not manually apply the five pending raffle migrations from the dashboard. Use the protected Production Bootstrap workflow after the approved merge.

## 4. GitHub main protection

Repository: **Aspirefutbol/aspire-raffle-hub**

The connected integration cannot verify classic branch protection, and the repository currently returns no rulesets. Configure/verify one of GitHub's supported protection mechanisms so that:

- [ ] `main` cannot receive ordinary unreviewed direct pushes.
- [ ] Changes reach `main` through a pull request.
- [ ] At least one approval is required before merge.
- [ ] Full CI is required before merge.
- [ ] Stale approvals are dismissed after material changes, if available.
- [ ] Force pushes to `main` are disabled.
- [ ] Branch deletion is disabled.
- [ ] Administrator bypass is restricted to emergency use.

The production workflows also fail closed unless the selected `main` commit is associated with a merged pull request.

## 5. GitHub production environment

Create/verify the GitHub Actions environment named exactly:

`production`

Require:

- [ ] At least one authorized human reviewer.
- [ ] Prevent self-approval when practical.
- [ ] Limit deployment branches/tags to `main`.
- [ ] Store only the production workflow secrets required for the database/app deployment lanes.

Expected production workflow secrets include:

- [ ] `PRODUCTION_SUPABASE_ACCESS_TOKEN`
- [ ] `PRODUCTION_DB_URL`
- [ ] `NETLIFY_AUTH_TOKEN`

Do not place the Netlify site's `SUPABASE_SECRET_KEY` in source control. It belongs in the Netlify site environment.

## 6. Netlify account/site controls

Verify:

- [ ] Aspire administrator accounts use MFA.
- [ ] Only required administrators can change production environment variables.
- [ ] Only required administrators can publish production deploys.
- [ ] The production site remains `aspirerafflehub` until a custom domain is explicitly approved.
- [ ] If a custom domain is introduced, update the production URL consistently in Netlify, Supabase Auth, workflows, and the application configuration before deploying.

## 7. Evidence to retain before merge

Capture a simple launch evidence record containing:

- [ ] Screenshot or export showing GitHub `main` protection.
- [ ] Screenshot showing GitHub `production` environment reviewer protection.
- [ ] Confirmation that Netlify `SUPABASE_SECRET_KEY` exists as a secret (do not reveal its value).
- [ ] Supabase Auth Site URL/callback configuration.
- [ ] Confirmation custom SMTP is configured (do not reveal password/token).
- [ ] Confirmation SSL enforcement is enabled.
- [ ] Backup/PITR decision.
- [ ] MFA/admin-access confirmation.

## 8. Stop conditions

Do not merge/deploy if any of these are true:

- production secret is missing
- production SMTP is unconfigured
- Auth points at staging/local URLs
- `main` is not protected
- production environment has no human reviewer
- SSL enforcement is off
- recovery ownership is undefined
- the legal/operational GO/NO-GO items remain unresolved

Once these manual settings are confirmed, the next technical sequence is:

1. approve PR #2
2. merge to `main`
3. wait for exact-commit CI PASS
4. run read-only Production Preflight
5. review the migration dry-run and preflight evidence
6. run Production Bootstrap
7. run Production App Deploy
8. perform synthetic production smoke/invitation test
9. complete final leadership GO/NO-GO
