# GRLP Command Centre — production image.
#
# Built in stages so the thing that ships holds only what it needs to run: no
# compilers, no source, no development packages.

FROM node:22-alpine AS base
# node:22-alpine already ships /usr/lib/libssl.so.3, which is what the Prisma
# query engine links against. No extra package is needed.
WORKDIR /app

# ── dependencies ────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ── migration tool ──────────────────────────────────────────────────────────
# The container applies migrations on start, so the Prisma CLI has to be in the
# runtime image. It is installed on its own, in its own prefix, rather than
# folded into the application's modules: the CLI drags in a large dependency
# tree of its own, and Next's traced output is deliberately minimal. Keeping
# them apart is what stops the runtime image from tripling in size.
FROM base AS migrator
WORKDIR /migrator
COPY package.json ./reference-package.json
RUN npm init -y > /dev/null 2>&1 \
 && npm install --omit=dev --no-audit --no-fund \
      "prisma@$(node -p "require('./reference-package.json').dependencies.prisma")" \
 && rm reference-package.json

# ── build ───────────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# The build needs a syntactically valid DATABASE_URL; it never connects.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── runtime ─────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Runs as a normal user: a container that is rooted should not also be root.
RUN addgroup -S -g 1001 grlp && adduser -S -D -H -u 1001 -G grlp grlp

COPY --from=build --chown=grlp:grlp /app/.next/standalone ./
COPY --from=build --chown=grlp:grlp /app/.next/static ./.next/static
COPY --from=build --chown=grlp:grlp /app/public ./public

# Migrations run at start, so the schema, the generated client and the CLI all
# have to be present.
COPY --from=build --chown=grlp:grlp /app/prisma ./prisma
COPY --from=build --chown=grlp:grlp /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=migrator --chown=grlp:grlp /migrator /migrator
COPY --chown=grlp:grlp docker-entrypoint.sh ./

USER grlp
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
