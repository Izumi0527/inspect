#!/usr/bin/env bash
# 企业级网络设备巡检系统 - 测试与质量校验统一入口（Bash 版）
# 封装后端与前端的构建/测试校验，提供单一验证入口，满足项目脚本化规范。
#   - 后端：go build（可跳过）+ backend-go 单测 + tests/backend-go 外置测试模块
#   - 前端：tsc 类型检查（可跳过）+ jest 单元测试
#   - 安装包：installer 与 tests/installer PowerShell 脚本回归测试
# 所有步骤默认全部执行并在结尾汇总；任一步骤失败则整体以非零码退出。

set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

SCOPE="all"
SKIP_BUILD=false
SKIP_TYPE_CHECK=false
FAILURES=()

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
测试与质量校验统一入口（Bash 版）

用法:
  ./scripts/test.sh [选项]

选项:
  --scope <all|backend|frontend|installer>   校验范围，默认 all
  --skip-build                     跳过后端 go build
  --skip-type-check                跳过前端 tsc 类型检查
  --help, -h                       显示帮助
EOF
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --scope) [[ $# -ge 2 ]] || die "缺少 --scope 参数值"; SCOPE="$2"; shift 2 ;;
            backend|frontend|installer|all) SCOPE="$1"; shift ;;
            --skip-build) SKIP_BUILD=true; shift ;;
            --skip-type-check) SKIP_TYPE_CHECK=true; shift ;;
            --help|-h) show_help; exit 0 ;;
            *) die "未知参数: $1" ;;
        esac
    done
    case "$SCOPE" in
        all|backend|frontend|installer) ;;
        *) die "--scope 仅支持 all、backend、frontend、installer" ;;
    esac
}

# 执行一个校验步骤：成功打勾、失败记录并继续（不中断后续步骤）。
run_step() {
    local name="$1"; local working_directory="$2"; shift 2

    write_color "" "White"
    write_color "🔄 ${name}..." "Cyan"
    if [[ ! -d "$working_directory" ]]; then
        write_color "⚠️ 跳过 ${name}：目录不存在 (${working_directory})" "Yellow"
        return
    fi

    if (cd "$working_directory" && "$@"); then
        write_color "✅ ${name} 通过" "Green"
    else
        write_color "❌ ${name} 失败" "Red"
        FAILURES+=("$name")
    fi
}

test_backend() {
    local backend_dir="$PROJECT_ROOT/backend-go"
    local tests_dir="$PROJECT_ROOT/tests/backend-go"

    if [[ "$SKIP_BUILD" != true ]]; then
        run_step "后端构建 (go build ./...)" "$backend_dir" go build ./...
    fi
    run_step "后端主模块测试 (backend-go)" "$backend_dir" go test ./... -count=1
    run_step "后端外置测试模块 (tests/backend-go)" "$tests_dir" go test ./... -count=1
}

test_frontend() {
    local frontend_dir="$PROJECT_ROOT/frontend"

    if [[ "$SKIP_TYPE_CHECK" != true ]]; then
        run_step "前端类型检查 (tsc --noEmit)" "$frontend_dir" pnpm run type-check
    fi
    run_step "前端单元测试 (jest)" "$frontend_dir" pnpm test --runInBand
}

find_powershell_host() {
    if command -v powershell.exe >/dev/null 2>&1; then
        command -v powershell.exe
        return
    fi
    if command -v pwsh >/dev/null 2>&1; then
        command -v pwsh
        return
    fi
    die "未找到 powershell.exe 或 pwsh，无法运行安装脚本测试"
}

test_installer() {
    local ps_host
    ps_host="$(find_powershell_host)"

    local test_files=()
    if [[ -d "$PROJECT_ROOT/tests/installer" ]]; then
        while IFS= read -r -d '' file; do test_files+=("$file"); done < <(find "$PROJECT_ROOT/tests/installer" -maxdepth 1 -type f -name '*.test.ps1' -print0)
    fi
    if [[ -d "$PROJECT_ROOT/installer/tests" ]]; then
        while IFS= read -r -d '' file; do test_files+=("$file"); done < <(find "$PROJECT_ROOT/installer/tests" -maxdepth 1 -type f -name '*.tests.ps1' -print0)
    fi

    if [[ "${#test_files[@]}" -eq 0 ]]; then
        write_color "⚠️ 跳过安装脚本测试：未找到测试文件" "Yellow"
        return
    fi

    local sorted_files=()
    while IFS= read -r file; do sorted_files+=("$file"); done < <(printf '%s\n' "${test_files[@]}" | sort)

    local test_file
    for test_file in "${sorted_files[@]}"; do
        run_step "安装脚本测试 ($(basename "$test_file"))" "$PROJECT_ROOT" "$ps_host" -NoProfile -ExecutionPolicy Bypass -File "$test_file"
    done
}

main() {
    parse_args "$@"

    write_color "🧪 测试校验入口 (范围: $SCOPE)" "Blue"
    write_color "============================================================" "Cyan"

    case "$SCOPE" in
        backend) test_backend ;;
        frontend) test_frontend ;;
        installer) test_installer ;;
        all) test_backend; test_frontend; test_installer ;;
    esac

    write_color "" "White"
    write_color "============================================================" "Cyan"
    if [[ "${#FAILURES[@]}" -gt 0 ]]; then
        write_color "❌ 校验失败的步骤 (${#FAILURES[@]}):" "Red"
        local item
        for item in "${FAILURES[@]}"; do
            write_color "   - $item" "Red"
        done
        exit 1
    fi

    write_color "✅ 全部校验通过" "Green"
}

main "$@"
