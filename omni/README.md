# OMNI Communications

Internal communications operating system. A single operator manages distributor
communications on behalf of multiple CEOs/companies.

> **Status: Phase 1 — Batch 1 (Foundation).** This batch delivers the repository
> structure, configuration, Docker stack, complete database schema, authentication
> (Better Auth + mandatory TOTP 2FA), and core libraries (envelope encryption,
> job queue, Resend transport, audit log). Application modules (projects,
> distributors, campaigns, AI drafting, send pipeline) arrive in Batches 2–3.

## Stack

- Next.js 15 (App Router) · React 19 · TypeScript
- PostgreSQL · Drizzle ORM
- Better Auth (email+password, TOTP 2FA, DB sessions, argon2id)
- pg-boss (job queue, on Postgres — no Redis)
- Resend (email sending)
- Docker Compose · Caddy (auto-TLS)

## Local setup

```bash
npm install
cp .env.example .env        # then fill in real values

# generate secrets
openssl rand -base64 32     # -> BETTER_AUTH_SECRET
openssl rand -base64 32     # -> ENCRYPTION_MASTER_KEY

# database
npm run db:generate         # create migration from schema
npm run db:migrate          # apply it

npm run dev                 # web (http://localhost:3000)
npm run worker:dev          # worker (separate terminal)
```

> If Better Auth's expected table shape differs by version, regenerate the auth
> schema with `npm run auth:generate` and re-run `db:generate`.

## Production (single Ubuntu VPS)

```bash
cd docker
# set APP_DOMAIN and POSTGRES_PASSWORD in the environment or ../.env
docker compose up -d --build
```

Compose order: `db` (healthcheck) → `migrate` (one-shot) → `web` + `worker` →
`caddy` (TLS termination, reverse-proxy to web).

## Project layout

```
src/
  app/            Next.js routes (UI + thin HTTP surface)
    api/auth/     Better Auth handler
    api/webhooks/ provider webhooks (Resend — wired in Batch 3)
  db/             Drizzle schema (domain + auth) and client
  lib/
    auth/         Better Auth server + client config
    crypto/       AES-256-GCM envelope encryption for secrets
    queue/        pg-boss client + job contracts
    email/        transport interface + Resend adapter
    audit/        append-only audit log
  worker/         queue consumer process
```

## Deferred (not in Phase 1, by design)

Inbox/reply management · advanced analytics · team access · Gmail/Microsoft OAuth.
