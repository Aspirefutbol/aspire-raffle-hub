# Raffle Hub

Multi-tenant fundraising platform for sports clubs, nonprofits, schools, ministries and community organizations. First organization: **Aspire Sports Group / Aspire Futbol Club**.

**Phase 1 (this release):** foundation, authentication, organizations, roles and permissions, master roster (teams, players, households, guardians), CSV import wizard with duplicate detection, admin dashboard with Action Needed, audit log.
Raffle sales, tickets, reconciliation and drawings come in later phases. See [docs/build-plan.md](docs/build-plan.md).

Product spec: [docs/Raffle-Hub-Developer-Blueprint.pdf](docs/Raffle-Hub-Developer-Blueprint.pdf)

## Documentation

| Doc | |
|---|---|
| [architecture.md](docs/architecture.md) | Stack, request flow, trust boundaries, transactions, audit, assumptions |
| [database-schema.md](docs/database-schema.md) | ERD (Mermaid), every table, scope classification |
| [roles-permissions.md](docs/roles-permissions.md) | Role catalog, permission matrix, enforcement layers |
| [roster-system.md](docs/roster-system.md) | Roster model, add-player flows, import wizard, duplicate rules |
| [build-plan.md](docs/build-plan.md) | Phase plan and status |

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Supabase (Postgres, Auth, RLS) · Zod · React Hook Form · Vitest · pgTAP

## Local development

Requires Node 20.9+ and Docker (for the local Supabase stack).

```bash
npm install
npx supabase start            # local Postgres + Auth + API (prints URL and keys)
cp .env.example .env.local    # fill in values from `npx supabase status`
npm run seed:dev              # development-only demo data (refuses production)
npm run dev                   # http://localhost:3000
```

Development accounts (password `RaffleHub!dev1`, change with `SEED_PASSWORD`):

| Email | Role |
|---|---|
| `admin@aspire.test` | Organization Admin, Aspire Sports Group |
| `auditor@aspire.test` | Auditor (read-only), Aspire Sports Group |
| `admin@northside.test` | Organization Admin of a second org (tenant isolation demo) |
| `superadmin@rafflehub.test` | Super Admin (platform) |

## Checks

```bash
npm run lint          # ESLint (Next core-web-vitals + TypeScript)
npm run typecheck     # tsc --noEmit
npm test              # Vitest unit tests (import pipeline, validation, formatting)
npx supabase test db  # pgTAP: tenant isolation, RLS, audit, transactional functions
npm run build
```

## Database

Migrations live in `supabase/migrations/`.
- Reset locally with `npx supabase db reset`.
- Push to a hosted project with `npx supabase db push`.
- After schema changes, regenerate types with `npm run db:types`.

## Deployment (Netlify or Vercel)

1. Create a Supabase project and run `npx supabase link` then `npx supabase db push`.
2. In Supabase Auth settings, set the Site URL and add `https://<your-domain>/auth/callback` as a redirect URL.
3. Set environment variables on the host:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_SITE_URL`
4. Deploy. Both platforms detect Next.js automatically (Netlify uses its Next.js runtime).

**Never** configure `SUPABASE_SECRET_KEY` (service role) in the web app's environment. Only the dev seed script reads it.

### Creating the first real admin
Invitations arrive in a later phase. Until then:
1. Create the user in the Supabase dashboard (Authentication → Users).
2. Add yourself to `platform_admins` with the SQL editor.
3. Sign in, open **Platform**, and create the organization with that user's email as first admin.
