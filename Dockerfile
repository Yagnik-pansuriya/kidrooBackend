# ── Stage 1: Build TypeScript ─────────────────────────────────────────────────
FROM node:18-alpine AS build

WORKDIR /app

# Install ALL dependencies (including devDependencies for tsc)
COPY package*.json ./
RUN npm ci

# Copy source and compile TypeScript
COPY . .
RUN npm run build

# ── Stage 2: Production Runtime ──────────────────────────────────────────────
FROM node:18-alpine AS production

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled JavaScript from Stage 1
COPY --from=build /app/dist ./dist

# Copy any other needed files (uploads dir structure, etc.)
RUN mkdir -p uploads

# Don't run as root in production
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001 -G nodejs && \
    chown -R nodeuser:nodejs /app
USER nodeuser

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

CMD ["node", "dist/index.js"]
