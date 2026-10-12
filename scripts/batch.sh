#!/bin/bash
# Run several seeds in parallel. Usage: scripts/batch.sh <weeks> [seeds...]
cd "$(dirname "$0")/.."
npx esbuild scripts/batch.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/batch.mjs --log-level=warning || exit 1
MIN=${1:-30}; shift  # in-game weeks
SEEDS=${@:-1 2 3 4 5 6 7 8}
for s in $SEEDS; do echo $s; done | xargs -P 4 -I{} node node_modules/.cache/batch.mjs {} $MIN
