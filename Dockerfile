# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Build React frontend (Vite)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /build

# Install deps first for layer caching
COPY client/package*.json ./client/
RUN cd client && npm ci

# Build
COPY client/ ./client/
RUN cd client && npm run build
# Output: /build/client/dist/

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1b — Build Platform Admin (Vite, served at /admin/)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS platform-builder

WORKDIR /build

COPY platform-admin/package*.json ./platform-admin/
RUN cd platform-admin && npm ci

COPY platform-admin/ ./platform-admin/
RUN cd platform-admin && npm run build
# Output: /build/platform-admin/dist/


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Production image (backend + built frontend)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS app

WORKDIR /app

# Install production backend dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy backend source + migrations + scripts
COPY backend/ ./backend/

# Copy built React app into public/ (served as SPA by Express)
COPY --from=frontend-builder /build/client/dist/ ./public/

# Copy built platform admin into public/admin/
COPY --from=platform-builder /build/platform-admin/dist/ ./public/admin/

# Copy entrypoint
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Non-root user
RUN addgroup -S lumos && adduser -S lumos -G lumos \
    && chown -R lumos:lumos /app
USER lumos

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
