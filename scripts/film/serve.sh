#!/bin/bash
# Run a command with the release build served on :5173 (the film scripts' default URL) for as long as it runs.
#   npm run build && scripts/film/serve.sh node scripts/film/trailer.mjs --tall
cd "$(dirname "$0")/../.."
npx vite preview --port 5173 --strictPort --host 127.0.0.1 > /dev/null 2>&1 &
server=$!
trap 'kill $server 2>/dev/null' EXIT
for _ in $(seq 50); do curl -s -o /dev/null http://127.0.0.1:5173/ && break; sleep 0.2; done
"$@"
