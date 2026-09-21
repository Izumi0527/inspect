#!/usr/bin/env bash
# 企业级网络设备巡检系统 - 前端 E2E 测试入口（Bash 版）
# 封装 frontend 的 playwright test，满足项目脚本化规范。
#   - 前置：检查后端健康端点（global-setup 需真实登录），检查 chromium 是否已安装
#   - 前端 dev server 由 playwright.config.ts 的 webServer 自动拉起/复用
#   - 未识别的参数原样透传给 playwright test（--ui / --headed / --grep / spec 路径等）

set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

BACKEND_HEALTH_URL="${INSPECT_BACKEND_HEALTH_URL:-http://localhost:18080/health}"
SKIP_BACKEND_CHECK=false
SKIP_BROWSER_CHECK=false
PASSTHROUGH=()

color() {
    local code="$1"; shift
    if [[ -t 1 ]]; then
        printf '\033[%sm%s\033[0m\n' "$code" "$*"
    else
        printf '%s\n' "$*"
    fi
}

write_color() {
    local message="$1"; local color_name="${2:-White}"
    case "$color_name" in
        Red) color "31" "$message" ;;
        Green) color "32" "$message" ;;
        Yellow) color "33" "$message" ;;
        Blue) color "34" "$message" ;;
        Cyan) color "36" "$message" ;;
        Gray) color "90" "$message" ;;
        *) printf '%s\n' "$message" ;;
    esac
}

die() { write_color "❌ $*" "Red"; exit 1; }

show_help() {
    cat <<'EOF'
前端 E2E 测试入口（Bash 版）

用法:
  ./scripts/e2e.sh [选项] [-- playwright 参数...]

选项:
  --skip-backend-check    跳过后端健康检查
  --skip-browser-check    跳过 chromium 安装检查
  --help, -h              显示帮助

环境变量:
  INSPECT_BACKEND_HEALTH_URL   后端健康端点，默认 http://localhost:18080/health
  PLAYWRIGHT_BASE_URL          前端地址，默认 http://localhost:13000（由 playwright.config.ts 读取）

其余参数原样透传给 playwright test，例如:
  ./scripts/e2e.sh --ui
  ./scripts/e2e.sh --headed --grep 总览
  ./scripts/e2e.sh tests/frontend/e2e/reports-analysis.spec.ts
EOF
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --skip-backend-check) SKIP_BACKEND_CHECK=true; shift ;;
            --skip-browser-check) SKIP_BROWSER_CHECK=true; shift ;;
            --help|-h) show_help; exit 0 ;;
            --) shift; PASSTHROUGH+=("$@"); break ;;
            *) PASSTHROUGH+=("$1"); shift ;;
        esac
    done
}

check_backend() {
    write_color "🔄 检查后端健康端点 ($BACKEND_HEALTH_URL)..." "Cyan"
    if curl -fsS --max-time 5 "$BACKEND_HEALTH_URL" >/dev/null 2>&1; then
        write_color "✅ 后端在线" "Green"
        return
    fi
    write_color "❌ 后端不可达；E2E 的 global-setup 需要真实登录，请先运行 ./scripts/dev-start.sh" "Red"
    write_color "   如后端跑在其他地址，设置 INSPECT_BACKEND_HEALTH_URL 或加 --skip-backend-check" "Yellow"
    exit 1
}

# playwright 的浏览器与库版本一一绑定，升级 @playwright/test 后须重新安装对应 revision；
# install 本身幂等：已安装时只校验标记文件、不联网。
check_browser() {
    write_color "🔄 确保 chromium 已安装（与 @playwright/test 版本匹配）..." "Cyan"
    (cd "$FRONTEND_DIR" && pnpm exec playwright install chromium) || die "chromium 安装失败"
    write_color "✅ chromium 已就绪" "Green"
}

main() {
    parse_args "$@"

    write_color "🎭 前端 E2E 测试入口" "Blue"
    write_color "============================================================" "Cyan"

    [[ -d "$FRONTEND_DIR" ]] || die "前端目录不存在: $FRONTEND_DIR"
    [[ "$SKIP_BACKEND_CHECK" == true ]] || check_backend
    [[ "$SKIP_BROWSER_CHECK" == true ]] || check_browser

    write_color "" "White"
    write_color "🔄 运行 playwright test ${PASSTHROUGH[*]:-}" "Cyan"
    if (cd "$FRONTEND_DIR" && pnpm test:e2e "${PASSTHROUGH[@]}"); then
        write_color "" "White"
        write_color "✅ E2E 测试通过" "Green"
    else
        write_color "" "White"
        write_color "❌ E2E 测试失败（报告: frontend/playwright-report/index.html）" "Red"
        exit 1
    fi
}

main "$@"
