# ---------------------------------------------------------------------
# The CRM, as one image.
#
# Three stages, so what ships carries no build tools, no test suite and
# no source — just the standalone server bundle Next.js traced.
# ---------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# A build needs no database and no real secrets. These placeholders satisfy
# the environment check and never reach the image that runs.
ENV NODE_ENV=production \
    DATABASE_URL=postgres://build:build@127.0.0.1:5432/build \
    SESSION_SECRET=build-only-never-used-at-runtime \
    IDENTITY_PEPPER=build-only-never-used-at-runtime
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    STORAGE_LOCAL_PATH=/data/storage

# tini reaps zombies and passes signals through, so a restart is clean.
# psql is here for the one-off role setup and for restoring a backup.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini ca-certificates postgresql-client \
 && rm -rf /var/lib/apt/lists/*

# The traced bundle, plus the three things tracing cannot know about:
# static assets, the migrations, and the scripts that run them.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/db ./db
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src/lib ./src/lib
COPY --from=build /app/package.json ./package.json
# Migrations run outside the traced bundle, so they need the driver.
COPY --from=build /app/node_modules/pg ./node_modules/pg
COPY --from=build /app/node_modules/pg-pool ./node_modules/pg-pool
COPY --from=build /app/node_modules/pg-protocol ./node_modules/pg-protocol
COPY --from=build /app/node_modules/pg-types ./node_modules/pg-types
COPY --from=build /app/node_modules/pg-connection-string ./node_modules/pg-connection-string
COPY --from=build /app/node_modules/pg-int8 ./node_modules/pg-int8
COPY --from=build /app/node_modules/pg-cloudflare ./node_modules/pg-cloudflare
COPY --from=build /app/node_modules/postgres-array ./node_modules/postgres-array
COPY --from=build /app/node_modules/postgres-bytea ./node_modules/postgres-bytea
COPY --from=build /app/node_modules/postgres-date ./node_modules/postgres-date
COPY --from=build /app/node_modules/postgres-interval ./node_modules/postgres-interval

# Documents live on a mounted volume: never inside the image, and never
# anywhere a web server could reach without going through the CRM's own
# permission check.
RUN mkdir -p /data/storage && chown -R node:node /data /app
VOLUME /data

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/sign-in').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
