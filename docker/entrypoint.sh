#!/bin/sh

set -e

echo "==> Running database migrations..."
bun run db:migrate

echo "==> Checking database seed..."
bun run db:seed

echo "==> Starting API..."
exec bun run start