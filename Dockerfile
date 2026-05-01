# Base stage for both development and production
FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install netcat
RUN apk add --no-cache netcat-openbsd

# Development stage
FROM base AS development
WORKDIR /app
ENV NODE_ENV=development
COPY . .
COPY package*.json ./
RUN npm install --legacy-peer-deps --ignore-scripts
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]
# Listen on all interfaces so host port mapping works (default localhost-only breaks Docker)
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3000"]

# Production builder stage
FROM base AS builder
WORKDIR /app
COPY . .
COPY package*.json ./
RUN npm ci --legacy-peer-deps --ignore-scripts
# Fail fast if the build context omitted app source (mis-set context → tiny image, missing @/ imports)
RUN test -f src/components/focus/FocusMode.tsx \
  && test -f "src/app/(common)/layout.tsx"
RUN npm run build
RUN npm run prisma:generate

# Production stage
FROM base AS production
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma
COPY entrypoint.sh .
RUN chmod +x /app/entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "server.js"] 
