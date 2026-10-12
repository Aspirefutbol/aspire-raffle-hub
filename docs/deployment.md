# Raffle Hub — Testing & Deployment

## Pipelines

| Workflow | Trigger | What it does |
|---|---|---|
| `.github/workflows/ci.yml` | every PR, pushes to `main` | lint · typecheck · unit tests · build; then a fresh local Supabase: apply all migrations, **pgTAP** (121 assertions), generated-types drift check, seed, unit tests incl. DB catalog parity, **Playwright e2e** (Phase 0 acceptance + 360px touch targets) |
| `.github/workflows/audit-checkpoint.yml` | daily 06:17 UTC, manual (from `main`) | verifies every staging audit chain and uploads a checkpoint artifact outside Supabase (`docs/audit-checkpoints.md`) |
| `.github/workflows/staging.yml` | pushes to `main`, manual | hosted Supabase: `db push` + **pgTAP against the hosted database** (transactional, rolled back); Netlify production deploy of the staging site; smoke tests against the deployed URL |

Locally, the same checks:

```bash
npx supabase start && npx supabase db reset && npx supabase test db
./scripts/ci-env.sh && npm run seed:dev
npm run check && npm run build
npm run start &  E2E_BASE_URL=http://localhost:3000 npm run test:e2e
```

## Staging setup (one time)

Staging must exist **before** any ticket or money workflow ships.

1. **Supabase project** (staging): create it, note the project ref and database password.
   - Auth → URL configuration: Site URL = staging URL; redirect URLs = `https://<staging>/**`.
   - Auth → Providers → Email: keep the provider on, turn **off "Allow new users to sign up"**.
   - Auth → Email templates: paste `supabase/templates/invite.html` and `magic_link.html`
     (they link to `/auth/confirm` with `token_hash`).
   - Configure custom SMTP before inviting real people (the built-in mailer is rate-limited).
2. **Netlify site** (staging): create an empty site (no Git auto-build needed; the workflow deploys).
   Site environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_SITE_URL` = the staging URL
   - `SUPABASE_SECRET_KEY` — server-only; used solely by `lib/supabase/admin.ts`
     for exact email lookup and invitation emails. Never prefixed `NEXT_PUBLIC_`.
3. **GitHub → Settings → Environments → `staging`**:
   - Secrets: `SUPABASE_ACCESS_TOKEN`, `STAGING_PROJECT_REF`, `STAGING_DB_PASSWORD`,
     `STAGING_DB_URL` (session-pooler connection string), `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`.
   - Variables: `STAGING_URL`, `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_PUBLISHABLE_KEY`.
   - Audit checkpoints: secret `STAGING_SUPABASE_SECRET_KEY` (service-role key), optional `AUDIT_CHECKPOINT_SIGNING_KEY`.
   - Add a required reviewer so production-like deploys are approved.
4. **First platform admin**: invite yourself from the Supabase dashboard, then in the
   SQL editor using the procedure in `docs/platform-admins.md`.
   Sign in, open **Platform**, create the organization; its first admin is added or invited by email.
5. Run the **Staging** workflow manually once and check every step is green.

The dev seed (`scripts/seed-dev.mjs`) refuses non-local URLs and is never run on staging.

## Release gates

- CI green on the PR (including pgTAP and e2e) before merge.
- Staging workflow green (hosted pgTAP + smoke) before any money/ticket feature is enabled.
- Schema changes only through new migrations; never edit an applied migration.
