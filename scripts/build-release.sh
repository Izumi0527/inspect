#!/usr/bin/env bash
# 构建 Linux 发布产物（后端静态二进制 + 数据库初始化 SQL + 校验和）
#
# 用法:
#   ./scripts/build-release.sh                      # 按 VERSION 构建 amd64
#   ./scripts/build-release.sh --arch arm64
#   ./scripts/build-release.sh --arch amd64,arm64   # 一次构建多架构
#   ./scripts/build-release.sh --version 1.1.1 --out build/release
#
# 产物: <out>/inspect_<version>_linux_<arch>.tar.gz 及同名 .sha256
#
# 范围说明（重要）:
#   仅打包后端与数据库脚本，不含前端产物。原因是前端 NEXT_PUBLIC_API_URL / NEXT_PUBLIC_WS_URL
#   在 next build 阶段被内联进客户端 bundle（见 frontend/next.config.js 的 env 配置与
#   frontend/src/lib/api-client.ts），预编译产物会把构建机域名烤死，无法在目标机复用。
#   前端仍由 deploy-ubuntu.sh 在目标机按实际域名构建。

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend-go"
GO_MODULE="github.com/your-org/inspect-system/backend-go"

ARCHES="amd64"
VERSION=""
OUT_DIR="$PROJECT_ROOT/build/release"

die() { printf 'ERR %s\n' "$*" >&2; exit 1; }
step() { printf '\n=== %s ===\n' "$*"; }

while [[ $# -gt 0 ]]; do
    case "$1" in
        --arch)    ARCHES="${2:-}"; shift 2 ;;
        --version) VERSION="${2:-}"; shift 2 ;;
        --out)     OUT_DIR="${2:-}"; shift 2 ;;
        --help|-h)
            sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
            exit 0 ;;
        *) die "未知参数: $1（使用 --help 查看用法）" ;;
    esac
done

# 版本号唯一权威源是仓库根 VERSION 文件
if [[ -z "$VERSION" ]]; then
    [[ -f "$PROJECT_ROOT/VERSION" ]] || die "缺少 VERSION 文件，且未通过 --version 指定"
    VERSION="$(tr -d ' \t\r\n' < "$PROJECT_ROOT/VERSION")"
fi
[[ -n "$VERSION" ]] || die "版本号为空"

command -v go >/dev/null 2>&1 || die "未找到 go，请先安装 Go 工具链"
command -v tar >/dev/null 2>&1 || die "未找到 tar"

mkdir -p "$OUT_DIR"

sha256_of() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | awk '{print $1}'
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$1" | awk '{print $1}'
    else
        die "未找到 sha256sum / shasum，无法生成校验和"
    fi
}

build_one() {
    local arch="$1"
    case "$arch" in
        amd64|arm64) ;;
        *) die "不支持的架构: $arch（仅 amd64 / arm64）" ;;
    esac

    local name="inspect_${VERSION}_linux_${arch}"
    local stage="$OUT_DIR/$name"

    step "构建 $name"
    rm -rf "$stage"
    mkdir -p "$stage/bin" "$stage/database"

    # CGO_ENABLED=0 与 deploy-ubuntu.sh 的编译参数保持一致，产出无依赖静态二进制
    ( cd "$BACKEND_DIR" && \
      CGO_ENABLED=0 GOOS=linux GOARCH="$arch" \
      go build -trimpath \
        -ldflags "-s -w -X '${GO_MODULE}/internal/config.defaultAppVersion=${VERSION}'" \
        -o "$stage/bin/inspect-api" ./cmd/api )

    cp "$PROJECT_ROOT/database/database-init-complete.sql" "$stage/database/"
    printf '%s\n' "$VERSION" > "$stage/VERSION"
    [[ -f "$PROJECT_ROOT/LICENSE" ]] && cp "$PROJECT_ROOT/LICENSE" "$stage/"

    ( cd "$OUT_DIR" && tar -czf "${name}.tar.gz" "$name" )
    rm -rf "$stage"

    local tarball="$OUT_DIR/${name}.tar.gz"
    printf '%s  %s\n' "$(sha256_of "$tarball")" "${name}.tar.gz" > "${tarball}.sha256"
    printf 'OK  %s (%s)\n' "${name}.tar.gz" "$(du -h "$tarball" | cut -f1)"
}

IFS=',' read -r -a arch_list <<<"$ARCHES"
for a in "${arch_list[@]}"; do
    build_one "$(printf '%s' "$a" | tr -d ' ')"
done

step "完成"
ls -1 "$OUT_DIR"
