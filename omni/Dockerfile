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
RUN npm run build && npm run build:worker

# ---- Web runtime (Next standalone) ----
FROM base AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --chown=node:node --from=build /app/.next/standalone ./
COPY --chown=node:node --from=build /app/.next/static ./.next/static
COPY --chown=node:node --from=build /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]

# ---- Worker runtime (runs native Node) ----
FROM base AS worker
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
USER node
CMD ["node", "dist/worker.js"]

# ---- Migrator (one-shot: runs Drizzle migrations then exits) ----
FROM base AS migrate
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node . .
USER node
CMD ["npm", "run", "db:migrate"]
