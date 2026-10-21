#!/usr/bin/env bash
# Launch the hello-world reader triad locally. No chain, no Home needed for the dev reader lane.
#
#   reader-mcp  :8890   the hello tool (HTTP + MCP JSON-RPC)
#   reader-a2a  :8891   the reader workspace agent (service host; calls the MCP)
#   reader-web  :5185   the page; proxies /a2a -> reader-a2a
#
# Run `pnpm seed:reader` once first: it writes apps/reader-a2a/.dev.vars (the seed demo reader + the run
# object's marker). Without it reader-a2a still answers strangers, but nobody can sign in locally.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f apps/reader-a2a/.dev.vars ] || echo "[reader] no apps/reader-a2a/.dev.vars — run 'pnpm seed:reader' to create the seed demo reader"
echo "[reader] starting reader-mcp (:8890), reader-a2a (:8891), reader-web (:5185)"
trap 'kill 0' EXIT
pnpm dev:mcp &
pnpm dev:a2a &
pnpm dev:web &
wait
