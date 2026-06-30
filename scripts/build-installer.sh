#!/usr/bin/env bash
# 构建 Windows 安装包（一键，Bash 版）：编译后端、构建前端、组装运行时、Inno Setup 打包。
#
# 以仓库根 VERSION 为唯一版本真相源，在构建时分发版本号：
#   - 后端：go build -ldflags 注入 internal/config.defaultAppVersion
#   - 前端：NEXT_PUBLIC_APP_VERSION 环境变量注入 next build
#   - 安装包：ISCC /DAppVersion 覆盖
# 复用既有 InspectRuntime/frontend/node_modules 与 runtime/node.exe（版本无关，体量大）。
# ISCC 为 Windows 专有；在 Git Bash(Windows) 下调用，非 Windows 环境会在该步报错退出。

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend-go"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
RUNTIME_ROOT="$PROJECT_ROOT/build/installer/InspectRuntime"
RUNTIME_BACKEND="$RUNTIME_ROOT/backend"
RUNTIME_FRONTEND="$RUNTIME_ROOT/frontend"
RUNTIME_NODE="$RUNTIME_ROOT/runtime"
ISS_FILE="$PROJECT_ROOT/installer/inspect.iss"
OUTPUT_EXE="$PROJECT_ROOT/build/installer-output/InspectSetup.exe"
GO_MODULE="github.com/your-org/inspect-system/backend-go"
INSTALLER_FRONTEND_API_URL="http://localhost:9165"
INSTALLER_FRONTEND_WS_URL="ws://localhost:9165"

SKIP_BACKEND=false
SKIP_FRONTEND=false
SKIP_INSTALLER=false
for arg in "$@"; do
    case "$arg" in
        --skip-backend) SKIP_BACKEND=true ;;
        --skip-frontend) SKIP_FRONTEND=true ;;
        --skip-installer) SKIP_INSTALLER=true ;;
        *) echo "未知参数: $arg" >&2; exit 1 ;;
    esac
done

step() { printf '\n=== %s ===\n' "$*"; }

# 校验 installer 运行时 .env 模板满足 prepare-env / docker-compose.installer 契约（防静默漂移）。
# 根 .env.example = 开发者参考；installer/config/.env.example = 安装运行时模板，须含首启生成
# 密钥/口令所需的占位符标记、必需键与 S11 一致性不变量，缺失即 fail-fast。
check_installer_env_contract() {
    local f="$PROJECT_ROOT/installer/config/.env.example"
    [ -f "$f" ] || { echo "缺少 installer 运行时模板: $f" >&2; exit 1; }
    local problems=()
    grep -Eq '^SECRET_KEY=change-me-generated-on-first-start[[:space:]]*$' "$f" || problems+=("缺少 prepare-env 标记: SECRET_KEY=change-me-generated-on-first-start")
    grep -Eq '^JWT_SECRET_KEY=change-me-generated-on-first-start[[:space:]]*$' "$f" || problems+=("缺少 prepare-env 标记: JWT_SECRET_KEY=change-me-generated-on-first-start")
    grep -q '__DB_PASSWORD__' "$f" || problems+=("缺少占位符 __DB_PASSWORD__（prepare-env 据此生成 DB 口令）")
    grep -q '__REDIS_PASSWORD__' "$f" || problems+=("缺少占位符 __REDIS_PASSWORD__（prepare-env 据此生成 Redis 口令）")
    local k
    for k in SECRET_KEY JWT_SECRET_KEY SERVER_PORT DATABASE_URL REDIS_URL POSTGRES_PASSWORD REDIS_PASSWORD; do
        grep -Eq "^${k}=" "$f" || problems+=("缺少必需键: $k")
    done
    grep -Eq '^DATABASE_URL=.*__DB_PASSWORD__' "$f" || problems+=("DATABASE_URL 未内嵌 __DB_PASSWORD__")
    grep -Eq '^POSTGRES_PASSWORD=__DB_PASSWORD__[[:space:]]*$' "$f" || problems+=("POSTGRES_PASSWORD 应为 __DB_PASSWORD__")
    grep -Eq '^REDIS_URL=.*__REDIS_PASSWORD__' "$f" || problems+=("REDIS_URL 未内嵌 __REDIS_PASSWORD__")
    grep -Eq '^REDIS_PASSWORD=__REDIS_PASSWORD__[[:space:]]*$' "$f" || problems+=("REDIS_PASSWORD 应为 __REDIS_PASSWORD__")
    if [ "${#problems[@]}" -gt 0 ]; then
        echo "installer/config/.env.example 契约校验失败（${#problems[@]} 项）:" >&2
        printf '  - %s\n' "${problems[@]}" >&2
        echo "（根 .env.example 为开发者参考；installer 运行时模板必须满足 prepare-env/compose 契约）" >&2
        exit 1
    fi
    echo "[OK] installer 运行时 .env 模板契约校验通过（占位符 + 必需键 + 一致性）"
}

# 安装脚本由安装机的 Windows PowerShell 5.1 执行，对无 BOM 的 .ps1 按系统 ANSI 代码页读取，
# 含中文等非 ASCII 会被误读导致解析崩溃。确保 installer/scripts/*.ps1 均带 UTF-8 BOM，缺失则自动补上。
ensure_installer_scripts_bom() {
    local f fixed=()
    for f in "$PROJECT_ROOT"/installer/scripts/*.ps1; do
        if [ "$(head -c3 "$f" | od -An -tx1 | tr -d ' \n')" != "efbbbf" ]; then
            printf '\xEF\xBB\xBF' | cat - "$f" > "$f.bomtmp" && mv -f "$f.bomtmp" "$f"
            fixed+=("$(basename "$f")")
        fi
    done
    if [ "${#fixed[@]}" -gt 0 ]; then
        echo "[WARN] 已为安装脚本补加 UTF-8 BOM（PS 5.1 安全）: ${fixed[*]}"
    else
        echo "[OK] installer/scripts/*.ps1 均已带 UTF-8 BOM（PS 5.1 安全）"
    fi
}

[ -f "$PROJECT_ROOT/VERSION" ] || { echo "未找到版本源文件: $PROJECT_ROOT/VERSION" >&2; exit 1; }
VERSION="$(tr -d '[:space:]' < "$PROJECT_ROOT/VERSION")"
[ -n "$VERSION" ] || { echo "VERSION 文件为空" >&2; exit 1; }
step "Inspect 安装包构建 — 版本 $VERSION"

# 校验 installer 运行时 .env 模板契约 + 确保安装脚本带 UTF-8 BOM（PS 5.1 安全）
check_installer_env_contract
ensure_installer_scripts_bom

if [ "$SKIP_BACKEND" = true ]; then
    echo "[WARN] 跳过后端构建（--skip-backend）"
else
    step "编译后端 app.exe（注入版本 $VERSION）"
    mkdir -p "$RUNTIME_BACKEND"
    ( cd "$BACKEND_DIR" && go build -ldflags "-s -w -X $GO_MODULE/internal/config.defaultAppVersion=$VERSION" -o "$RUNTIME_BACKEND/app.exe" ./cmd/api )
    echo "[OK] 后端编译完成: $RUNTIME_BACKEND/app.exe"
fi

if [ "$SKIP_FRONTEND" = true ]; then
    echo "[WARN] 跳过前端构建（--skip-frontend）"
else
    step "构建前端（NEXT_PUBLIC_APP_VERSION=$VERSION, NEXT_PUBLIC_API_URL=$INSTALLER_FRONTEND_API_URL）"
    # Next.js 会把 NEXT_PUBLIC_* 内联进客户端产物；安装包必须在 build 阶段注入 9165，
    # 否则仓库 frontend/.env.local 的开发端口 18080 会被烘焙进登录页。
    ( cd "$FRONTEND_DIR" && \
        NEXT_PUBLIC_APP_VERSION="$VERSION" \
        NEXT_PUBLIC_API_URL="$INSTALLER_FRONTEND_API_URL" \
        NEXT_PUBLIC_WS_URL="$INSTALLER_FRONTEND_WS_URL" \
        NEXT_PUBLIC_ENV="production" \
        pnpm exec next build --no-lint )

    step "组装前端产物到 InspectRuntime"
    if [ ! -d "$RUNTIME_FRONTEND/node_modules" ]; then
        echo "缺少可移植前端依赖: $RUNTIME_FRONTEND/node_modules" >&2
        echo "该目录是版本无关的生产依赖（约 550MB），需先组装一次后再运行本脚本。" >&2
        exit 1
    fi
    for d in .next public; do
        [ -d "$FRONTEND_DIR/$d" ] || { echo "前端产物缺失: $FRONTEND_DIR/$d" >&2; exit 1; }
        rm -rf "$RUNTIME_FRONTEND/$d"
        cp -r "$FRONTEND_DIR/$d" "$RUNTIME_FRONTEND/$d"
    done
    for f in package.json next.config.js; do
        cp -f "$FRONTEND_DIR/$f" "$RUNTIME_FRONTEND/$f"
    done
    cat > "$RUNTIME_FRONTEND/.env.local" <<EOF
# 前端生产环境配置（由 build-installer.sh 自动生成）
# 后端 API 地址（默认端口 9165）
NEXT_PUBLIC_API_URL=$INSTALLER_FRONTEND_API_URL
NEXT_PUBLIC_WS_URL=$INSTALLER_FRONTEND_WS_URL

# 生产环境标识
NODE_ENV=production
NEXT_PUBLIC_ENV=production
EOF
    echo "[OK] 前端产物已更新（复用 node_modules）+ .env.local 已生成"
fi

[ -f "$RUNTIME_NODE/node.exe" ] || echo "[WARN] 未找到 $RUNTIME_NODE/node.exe（安装机将回退系统 node）"

if [ "$SKIP_INSTALLER" = true ]; then
    echo "[WARN] 跳过安装包编译（--skip-installer）"
else
    step "Inno Setup 编译安装包（AppVersion=$VERSION）"
    ISCC=""
    if command -v ISCC.exe >/dev/null 2>&1; then
        ISCC="ISCC.exe"
    elif [ -f "/c/Program Files (x86)/Inno Setup 6/ISCC.exe" ]; then
        ISCC="/c/Program Files (x86)/Inno Setup 6/ISCC.exe"
    fi
    [ -n "$ISCC" ] || { echo "未找到 ISCC.exe（Inno Setup 6）。非 Windows 环境无法生成安装包。" >&2; exit 1; }

    iss_arg="$ISS_FILE"
    command -v cygpath >/dev/null 2>&1 && iss_arg="$(cygpath -w "$ISS_FILE")"
    "$ISCC" "/DAppVersion=$VERSION" "$iss_arg"

    [ -f "$OUTPUT_EXE" ] || { echo "未生成安装包: $OUTPUT_EXE" >&2; exit 1; }

    # 安装包名附加 版本号-日期-时间，便于区分/归档多次构建产物（ISCC 固定产出 InspectSetup.exe 后重命名）。
    STAMP="$(date +%Y%m%d-%H%M%S)"
    STAMPED_EXE="$(dirname "$OUTPUT_EXE")/InspectSetup-$VERSION-$STAMP.exe"
    mv -f "$OUTPUT_EXE" "$STAMPED_EXE"
    echo "[OK] 安装包已生成: $STAMPED_EXE (v$VERSION)"
fi

printf '\n[DONE] Inspect v%s 构建完成\n' "$VERSION"
