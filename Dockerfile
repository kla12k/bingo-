# Build stage
FROM node:20-alpine AS builder

ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_APP_URL

RUN apk add --no-cache openssl

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=4096

# Copy package files and Prisma schema (postinstall runs prisma generate)
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Install all dependencies (including dev for build)
RUN npm ci

# Generate Prisma client (postinstall may have run it; run again to be sure)
RUN npx prisma generate

# Copy source
COPY . .

# NEXT_PUBLIC_* must be set at build time for client bundles (Coolify passes these as build args)
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

# Build Next.js
RUN npm run build

# Build socket server
RUN npm run server:build

# Production stage
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production
ENV SOCKET_PORT=3007
# "full" = Next.js + socket (frontend). "socket" = socket server only (instant-backend).
ENV RUN_MODE=full

# Copy package files and Prisma schema (postinstall runs prisma generate)
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Install production dependencies only (postinstall needs prisma/ to exist)
RUN npm ci --omit=dev

# Copy build artifacts from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/server/dist ./server/dist

# Next.js needs standalone server files if using standalone output
# For standard setup, copy full app
COPY --from=builder /app/next.config.mjs ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/lib ./lib

EXPOSE 3000 3007

# full: Next.js (3000) + socket (SOCKET_PORT). socket: socket server only — use for instant-backend.
CMD ["sh", "-c", "if [ \"$RUN_MODE\" = \"socket\" ]; then exec node server/dist/server/index.js; else npx next start -H 0.0.0.0 & exec node server/dist/server/index.js; fi"]
