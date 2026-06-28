# ---- Base ----
FROM node:22-slim AS base
ENV PNPM_HOME=/usr/local/bin
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ---- Dependencies ----
FROM base AS deps
COPY package.json package-lock.json* .npmrc ./
RUN npm ci

# ---- Build (web, standalone output) ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    APP_URL=https://omni.ogonna.com \
    DATABASE_URL=postgres://omni:mock_db_password@db:5432/omni \
    BETTER_AUTH_SECRET=mock_better_auth_secret_longer_than_16_chars \
    BETTER_AUTH_URL=https://omni.ogonna.com \
    ENCRYPTION_MASTER_KEY=bW9ja19lbmNyeXB0aW9uX21hc3Rlcl9rZXlfMzJfYnk= \
    RESEND_API_KEY=re_mock_key \
    RESEND_WEBHOOK_SECRET=whsec_mock_secret
RUN npm run build && npm run build:worker && mkdir -p public

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
