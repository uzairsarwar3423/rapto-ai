FROM node:22-alpine AS builder

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies)
RUN npm ci

# Copy the rest of the application
COPY . .

# Generate Prisma client and build
RUN npx prisma generate
RUN npm run build

# Remove devDependencies to prepare node_modules for production
RUN npm prune --omit=dev

# Production stage
FROM node:22-alpine

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy built dist directory
COPY --from=builder /app/dist ./dist

# Copy prisma directory
COPY --from=builder /app/prisma ./prisma

# Copy production node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Expose port
EXPOSE 5000

# Start command
CMD ["npm", "start"]
