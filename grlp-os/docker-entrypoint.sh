#!/bin/sh
# Applies any outstanding database migrations, then starts the server.
#
# Migrations run here rather than in the image build because the build has no
# database to talk to, and because a new container coming up after a schema
# change must not serve requests against the old shape.
set -e

echo "GRLP Command Centre starting."

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set. Nothing can start without it." >&2
  exit 1
fi

echo "Applying database migrations…"
# The CLI lives in its own prefix, away from the application's modules, and is
# invoked by path: the runtime image carries no npm .bin shims.
node /migrator/node_modules/prisma/build/index.js migrate deploy

echo "Migrations applied. Starting the server on port ${PORT:-3000}."
exec "$@"
