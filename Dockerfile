# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# AI Dungeon Master production image
#
# The app is a long-running Next.js server: each game session spawns the MCP
# engine as a stdio subprocess (node mcp-server/dist/mcp-server/index.js). It
# therefore runs as a persistent container (not serverless). Toute la
# persistance (auth, sessions de jeu, crédits) vit en Postgres via DATABASE_URL
# — aucun volume disque requis.
# ---------------------------------------------------------------------------

# ---- Stage 1: build (full deps + next build + tsc for the MCP engine) ----
FROM node:20-slim AS builder
WORKDIR /app

# Install all deps (incl. devDeps: typescript, tailwind, @types/*) for the build.
COPY package.json package-lock.json ./
RUN npm ci

# Build: `npm run build` runs build:mcp (tsc -> mcp-server/dist) then next build.
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Stage 2: production dependencies only ----
FROM node:20-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- Stage 3: runtime ----
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0

# Runtime artifacts only.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder   /app/.next        ./.next
COPY --from=builder   /app/mcp-server/dist ./mcp-server/dist
COPY public        ./public
COPY context       ./context
COPY next.config.ts package.json package-lock.json ./

# Dossier optionnel pour la persistance de logs opt-in (APP_LOG_PERSIST_ENABLED).
# La persistance de données (sessions, crédits, auth) est en Postgres : pas de
# volume requis.
RUN mkdir -p .data && chown -R node:node /app

EXPOSE 8080

# Persistance en Postgres → aucun volume à réaligner au runtime : on tourne
# directement en utilisateur non-privilégié.
USER node
CMD ["npm", "start"]
