# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# AI Dungeon Master production image
#
# The app is a STATEFUL long-running Next.js server: each game session spawns
# the MCP engine as a stdio subprocess (node mcp-server/dist/mcp-server/index.js)
# and persists session JSON to disk. It therefore runs as a persistent
# container (not serverless). Session state lives on a persistent volume mounted
# under GAME_SESSION_STORE_DIR. Render free uses ephemeral /tmp storage; hosts
# with a persistent volume can point GAME_SESSION_STORE_DIR at that volume.
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
    HOSTNAME=0.0.0.0 \
    GAME_SESSION_STORE_DIR=/data/sessions

# Runtime artifacts only.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder   /app/.next        ./.next
COPY --from=builder   /app/mcp-server/dist ./mcp-server/dist
COPY public        ./public
COPY context       ./context
COPY next.config.ts package.json package-lock.json ./

# Persistent session store + ephemeral logs/cassettes dir. A deployment volume is
# mounted over /data at runtime; this just guarantees the path exists.
RUN mkdir -p /data/sessions .data \
    && chown -R node:node /app /data

USER node
EXPOSE 8080

CMD ["npm", "start"]
