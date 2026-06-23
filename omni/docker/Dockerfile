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
ENV NEXT_TELEMETRY_DISABLED=1
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
