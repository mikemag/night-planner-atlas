#!/bin/sh
# Serve the static site locally: scripts/serve.sh [port]
set -eu
port="${1:-8000}"
root="$(cd "$(dirname "$0")/.." && pwd)/site"
echo "Night Planner Atlas: http://localhost:$port/"
exec python3 -m http.server "$port" --bind 127.0.0.1 --directory "$root"
