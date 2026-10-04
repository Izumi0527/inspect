#!/usr/bin/env bash
# 纯前端构建；可指定隔离副本，避免与正在运行的dev共享.next。
set -uo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
FRONTEND_DIR="$ROOT/frontend"
if [[ "${1:-}" == "--frontend-dir" && $# == 2 ]]; then
  FRONTEND_DIR="$2"
elif [[ $# != 0 ]]; then
  echo '用法: bash scripts/frontend/build.sh [--frontend-dir <前端源码副本>]'
  exit 2
fi
[[ -f "$FRONTEND_DIR/package.json" ]] || { echo '前端目录缺少package.json'; exit 2; }
mkdir -p "$ROOT/logs"
(cd "$FRONTEND_DIR" && pnpm run build) 2>&1 | tee "$ROOT/logs/frontend-build.log"
result=${PIPESTATUS[0]}
exit "$result"
