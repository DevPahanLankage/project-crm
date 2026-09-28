# Nexa Markets

Nexa Markets is a private, desktop-first retention CRM for Admins and Retention Agents. The app is built with Next.js App Router, TypeScript, Tailwind CSS, Prisma, PostgreSQL/Supabase, Argon2id password hashing, database-backed HTTP-only sessions, and Excel import support via `xlsx`.

Nexa Markets intentionally contains only Admins, Retention Agents, and Leads. Do not add Sales, Team Lead, Affiliate, Trading Activity, IP tracking, or department features.

## Single Database

Nexa Markets uses one database only: Supabase project `mftfsyuwcnqkcxrchkbq`.

Use only these Postgres connection variables:

```env
DATABASE_URL="postgresql://postgres.mftfsyuwcnqkcxrchkbq:DB_PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require"
DIRECT_URL="postgresql://postgres.mftfsyuwcnqkcxrchkbq:DB_PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require"
```

`DATABASE_URL` is the runtime app connection. `DIRECT_URL` is the migration connection. Both point to the same Supabase project and the same Postgres database.

Do not use Supabase API keys for Prisma/Postgres. Do not add another database URL, fallback database, local Postgres fallback, or second Supabase project.

## Environment

For local development or VPS deployment, copy `.env.example` to `.env` and set the database and server-only values. The runtime and migration URLs must point to the same PostgreSQL database:

```env
DATABASE_URL="postgresql://postgres.mftfsyuwcnqkcxrchkbq:DB_PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require"
DIRECT_URL="postgresql://postgres.mftfsyuwcnqkcxrchkbq:DB_PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require"
ADMIN_EMAIL="admin@example.com"
ADMIN_INITIAL_PASSWORD="replace-with-a-long-random-password"
```

Do not put Supabase secret/service-role keys in frontend-exposed variables. This app talks to Supabase through Prisma/Postgres, not through the Supabase browser client.

## Local Commands

```bash
npm ci
npx prisma generate
npm run db:status
npm run db:bootstrap
npm run db:doctor
npm run dev
```

Seed data creates one Admin from environment variables, several dummy Retention Agents, fake leads, assignments, notes, and deposits. The initial Admin password must be at least 12 characters.

Run `npm run db:bootstrap` once against Supabase project `mftfsyuwcnqkcxrchkbq` after the required environment variables are present. It applies migrations and creates/updates only the first admin account. It does not create sample agents, leads, notes, or deposits.

Run `npm run db:setup` only when you intentionally want local/demo seed data. It applies migrations and seeds dummy agents, leads, notes, and deposits. It is intentionally not run automatically during production deployment.

## Development-Only Mock Authentication

For UI-only inspection without a database, set:

```env
DEV_MOCK_AUTH=true
```

Then sign in with:

| Role | Email | Development password |
| --- | --- | --- |
| Admin | `admin@example.com` | `admin123456` |
| Retention agent | `agent@example.com` | `agent123456` |

Mock auth is disabled in production regardless of the environment variable.

## Verification

Current verified checks:

```bash
npm run typecheck
npm run lint
npm run test:leads
npm run build
npm run db:doctor
```

## Production VPS Deployment

This project runs as a Dockerized Next.js standalone server on the VPS. Docker Compose binds the container only to `127.0.0.1:3000`; Caddy handles public HTTPS and reverse proxies to that loopback address. The database is external Supabase/PostgreSQL.

Create `.env` on the VPS before starting the container. Never commit production secrets.

```bash
git pull
docker compose build
docker compose up -d
docker compose ps
docker compose logs -f app
```

For a blank production database, run once:

```bash
docker compose exec app npm run db:bootstrap
```

For later deployments with an existing admin/data, run migrations explicitly:

```bash
docker compose exec app npm run db:deploy
```

`db:bootstrap` applies migrations and creates or updates the configured initial Admin. It resets that Admin's password to `ADMIN_INITIAL_PASSWORD`, so it is not a routine deployment command. `db:seed` and `db:setup` create demo agents and fake CRM data and must not be run against a real production database.
