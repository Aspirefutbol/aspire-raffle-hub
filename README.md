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
| [IMPLEMENTATION_AUDIT.md](docs/IMPLEMENTATION_AUDIT.md) | Gap analysis vs. the 360° Blueprint: complete, partial, not built, refactors, risks, build order, coverage |
| [AUDIT.md](docs/AUDIT.md) | Audit trail: events recorded, enforcement, gaps, extension plan |

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

## Deployment

See [`docs/deployment.md`](docs/deployment.md) for CI, the staging pipeline
(hosted Supabase + Netlify) and first-admin setup.

`SUPABASE_SECRET_KEY` is server-only. The web app uses it solely in
`lib/supabase/admin.ts` to look up accounts by exact email and send invitation
emails; it must never be exposed with a `NEXT_PUBLIC_` prefix.
