#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

if [[ ! -d "$FRONTEND_DIR" ]]; then
  echo "frontend 目录不存在：$FRONTEND_DIR" >&2
  exit 1
fi

cd "$FRONTEND_DIR"
pnpm test "$@"
