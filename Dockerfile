# ── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY .swcrc ./
COPY src/ ./src/
RUN node_modules/.bin/swc src -d dist --strip-leading-paths

# ── Stage 2: production ───────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Non-root user
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs nodejs

# Production deps (prisma is in dependencies so included here)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Compiled output + prisma schema (for migrate deploy at startup)
COPY --from=builder /app/dist ./dist
COPY prisma/ ./prisma/
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

# Local upload directory (used when STORAGE_PROVIDER=local)
RUN mkdir -p uploads && chown -R nodejs:nodejs uploads

USER nodejs

# APP_MODE controls which process starts:
#   api    → REST API on PORT (default 3000)
#   socket → Socket.IO on SOCKET_PORT (default 3001)
#   worker → BullMQ workers (no HTTP port)
ENV APP_MODE=api

EXPOSE 3000 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/health 2>/dev/null || wget -qO- http://localhost:${SOCKET_PORT:-3001}/health 2>/dev/null || exit 1

ENTRYPOINT ["./entrypoint.sh"]
