# ---- Base ----
FROM node:22-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ---- Dependencies ----
FROM base AS deps
COPY package.json package-lock.json .npmrc* ./
RUN npm ci

# ---- Build (web, standalone output) ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time placeholder env vars so the Next.js build completes.
# Real values are injected at deploy time via Docker env / secrets.
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    APP_URL=https://placeholder.invalid \
    DATABASE_URL=postgres://placeholder:placeholder@localhost:5432/placeholder \
    BETTER_AUTH_SECRET=placeholder-secret-at-least-16 \
    BETTER_AUTH_URL=https://placeholder.invalid \
    ENCRYPTION_MASTER_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= \
    RESEND_API_KEY=re_placeholder \
    RESEND_WEBHOOK_SECRET=whsec_placeholder
RUN npm run build

# ---- Web runtime (Next standalone) ----
FROM base AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]

# ---- Worker runtime (runs TS via tsx) ----
FROM base AS worker
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
CMD ["npm", "run", "worker"]

# ---- Migrator (one-shot: runs Drizzle migrations then exits) ----
FROM base AS migrate
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
CMD ["npm", "run", "db:migrate"]
