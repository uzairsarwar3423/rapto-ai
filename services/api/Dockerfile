# ==========================================
# Stage 1: Build Stage
# ==========================================
FROM node:22-alpine AS builder

# Install OpenSSL required by Prisma Engine
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install dependencies deterministically
RUN npm ci

# Copy application source and schema
COPY . .

# Generate Prisma Client & Compile TypeScript
RUN npx prisma generate
RUN npm run build

# Remove development dependencies to keep bundle slim
RUN npm prune --omit=dev

# ==========================================
# Stage 2: Production Runtime Stage
# ==========================================
FROM node:22-alpine AS runner

# Install OpenSSL for Prisma and tini for proper init process & signal handling
RUN apk add --no-cache openssl tini wget curl

# Set environment to production
ENV NODE_ENV=production \
    PORT=5000

WORKDIR /app

# Create app user permissions
RUN chown -R node:node /app

# Copy artifacts and node_modules from builder
COPY --chown=node:node --from=builder /app/package*.json ./
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node --from=builder /app/node_modules ./node_modules

# Switch to non-root node user
USER node

# Expose internal API port
EXPOSE 5000

# Health check instruction for container engine
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

# Use tini as init process to handle SIGTERM/SIGINT signals gracefully
ENTRYPOINT ["/sbin/tini", "--"]

# Default start command for API service
CMD ["node", "dist/server.js"]
