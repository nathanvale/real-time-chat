# Multi-stage Dockerfile for real-time chat app
# Uses oven/bun:1-slim for lightweight production builds

FROM oven/bun:1-slim AS base
WORKDIR /app
ENV NODE_ENV="production"

# Stage 1: Install all workspace dependencies
FROM base AS install
COPY bun.lock package.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN bun install --frozen-lockfile

# Stage 2: Build the client
FROM install AS build
COPY . .
RUN cd client && bunx vite build

# Stage 3: Production image
FROM base
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/bun.lock ./bun.lock
COPY --from=build /app/node_modules ./node_modules

# Set production environment variables
ENV NODE_ENV="production"
ENV DATABASE_PATH="/data/app.db"

# Expose port 3001 (matches server default)
EXPOSE 3001

# Start the server
CMD ["bun", "run", "server/src/index.ts"]
