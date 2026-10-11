#!/usr/bin/env bash
# Writes .env.local for the running local Supabase stack (CI and fresh checkouts).
set -euo pipefail
eval "$(npx supabase status -o env)"
cat > .env.local <<ENV
NEXT_PUBLIC_SUPABASE_URL=${API_URL}
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${PUBLISHABLE_KEY}
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SUPABASE_SECRET_KEY=${SECRET_KEY}
ENV
echo "Wrote .env.local for ${API_URL}"
