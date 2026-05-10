#!/usr/bin/env bash
# 企业级网络设备巡检系统 - 缓存清理脚本（Bash 版）
# 用于清理项目中的各类缓存文件，释放磁盘空间，加速开发构建。

set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
BACKEND_PATH="$PROJECT_ROOT/backend-go"
FRONTEND_PATH="$PROJECT_ROOT/frontend"
LOGS_PATH="$PROJECT_ROOT/logs"
BACKEND_LOGS_PATH="$BACKEND_PATH/logs"
PROJECT_ROOT_RESOLVED="$(cd -- "$PROJECT_ROOT" && pwd -P)"

ALL=false
BACKEND=false
FRONTEND=false
LOGS=false
TEMP=false
PROJECT_FILES=false
GO_BUILD=false
REPORT_ARTIFACTS=false
BACKEND_DATA=false
PACKAGE_CACHE=false
PLAYWRIGHT=false
FORCE=false
WHAT_IF=false
VERBOSE=false
HELP=false

TOTAL_FREED=0
TOTAL_FILES=0

EXCLUDED_TRAVERSAL_DIRECTORIES=(
    ".git"
    ".vscode"
    ".idea"
    "node_modules"
    ".next"
    "dist"
    "build"
    "out"
    "vendor"
)

color() {
    local code="$1"
    shift
    if [[ -t 1 ]]; then
        printf '\033[%sm%s\033[0m\n' "$code" "$*"
    else
        printf '%s\n' "$*"
    fi
}

log_info() { color "34" "[信息] $*"; }
log_success() { color "32" "[成功] $*"; }
log_warning() { color "33" "[警告] $*"; }
log_error() { color "31" "[错误] $*"; }
log_step() { color "36" "[步骤] $*"; }
log_verbose() {
    if [[ "$VERBOSE" == true ]]; then
        color "35" "[详细] $*"
    fi
}

show_help() {
    cat <<'EOF'
企业级网络设备巡检系统 - 缓存清理脚本（Bash 版）

用法:
  ./scripts/clean-cache.sh [选项]

清理选项:
  --all, -All                    清理所有缓存（含以下全部类别）
  --backend, -Backend            清理后端缓存（Go 覆盖率 / 临时文件 / go clean）
  --frontend, -Frontend          清理前端缓存（Next.js / Turbo / ESLint / SWC 等）
  --logs, -Logs                  清理日志文件（超过7天的日志，含 backend-go/logs/）
  --temp, -Temp                  清理临时文件（.DS_Store / Thumbs.db / *.tmp）
  --project-files, -ProjectFiles 清理项目特定文件（context.json / lint报告 / 覆盖率 / MCP 快照等）
  --go-build, -GoBuild           清理 Go 构建缓存目录与编译产物（*.exe / .gocache 等）
  --report-artifacts, -ReportArtifacts
                                 清理历史重复报表输出目录（仅 backend-go/backend-go）
  --backend-data, -BackendData   清理后端数据输出目录（backend-go/data/）
  --package-cache, -PackageCache 清理包管理器缓存（pnpm store）
  --playwright, -Playwright      清理 Playwright 测试产物（报告 / 测试结果 / MCP 快照）

执行选项:
  --force, -Force                跳过确认直接清理
  --what-if, -WhatIf             预览将要删除的内容（不实际删除）
  --verbose, -Verbose            显示详细输出
  --help, -Help                  显示此帮助信息

示例:
  ./scripts/clean-cache.sh
  ./scripts/clean-cache.sh --all --force
  ./scripts/clean-cache.sh --go-build
  ./scripts/clean-cache.sh --report-artifacts
  ./scripts/clean-cache.sh --backend-data
  ./scripts/clean-cache.sh --package-cache
  ./scripts/clean-cache.sh --playwright
  ./scripts/clean-cache.sh --all --what-if

说明:
  - 覆盖 Go / pnpm / Playwright 等多类缓存
  - 显示清理前后空间统计
  - 支持预览模式（--what-if）
  - 避免删除 node_modules / .git / .vscode 等重要目录
  - --package-cache 会删除 pnpm 缓存，下次安装需重新下载依赖
EOF
}

die() {
    log_error "$*"
    exit 1
}

format_file_size() {
    local size="${1:-0}"
    awk -v size="$size" 'BEGIN {
        if (size >= 1073741824) {
            printf "%.2f GB", size / 1073741824
        } else if (size >= 1048576) {
            printf "%.2f MB", size / 1048576
        } else if (size >= 1024) {
            printf "%.2f KB", size / 1024
        } else {
            printf "%d Bytes", size
        }
    }'
}

resolve_path() {
    local path="$1"
    [[ -e "$path" ]] || return 1

    if [[ -d "$path" ]]; then
        (cd -- "$path" 2>/dev/null && pwd -P)
        return
    fi

    local dir
    local base
    dir="$(dirname -- "$path")"
    base="$(basename -- "$path")"
    (cd -- "$dir" 2>/dev/null && printf '%s/%s\n' "$(pwd -P)" "$base")
}

file_size() {
    local path="$1"
    if stat -c '%s' "$path" >/dev/null 2>&1; then
        stat -c '%s' "$path"
    elif stat -f '%z' "$path" >/dev/null 2>&1; then
        stat -f '%z' "$path"
    else
        wc -c <"$path" | tr -d '[:space:]'
    fi
}

is_excluded_dir() {
    local name="$1"
    local excluded
    for excluded in "${EXCLUDED_TRAVERSAL_DIRECTORIES[@]}"; do
        if [[ "$name" == "$excluded" ]]; then
            return 0
        fi
    done
    return 1
}

test_is_safe_cache_path() {
    local path="$1"
    local resolved
    resolved="$(resolve_path "$path" 2>/dev/null || true)"
    if [[ -z "$resolved" ]]; then
        return 1
    fi

    local normalized_root="${PROJECT_ROOT_RESOLVED%/}"
    local normalized_path="${resolved%/}"

    if [[ "$normalized_path" == "$normalized_root" ]]; then
        log_error "拒绝删除项目根目录: $resolved"
        return 1
    fi

    if [[ "$normalized_path" != "$normalized_root/"* ]]; then
        log_error "拒绝删除项目外路径: $resolved"
        return 1
    fi

    return 0
}

relative_project_path() {
    local path="$1"
    local resolved
    resolved="$(resolve_path "$path" 2>/dev/null || printf '%s' "$path")"
    resolved="${resolved#"$PROJECT_ROOT_RESOLVED"/}"
    printf '%s\n' "$resolved"
}

summarize_path() {
    local path="$1"
    local size=0
    local count=0

    if [[ -d "$path" ]]; then
        local item
        while IFS= read -r -d '' item; do
            size=$((size + $(file_size "$item")))
            count=$((count + 1))
        done < <(find "$path" -type f -print0 2>/dev/null)
    elif [[ -f "$path" ]]; then
        size="$(file_size "$path")"
        count=1
    fi

    printf '%s %s\n' "$size" "$count"
}

remove_cache_item() {
    local path="$1"
    local description="$2"

    if [[ ! -e "$path" ]]; then
        log_verbose "跳过不存在的路径: $path"
        return
    fi

    if ! test_is_safe_cache_path "$path"; then
        return
    fi

    local summary
    local size
    local file_count
    summary="$(summarize_path "$path")"
    size="${summary%% *}"
    file_count="${summary##* }"

    local size_str
    size_str="$(format_file_size "$size")"
    local detail
    if [[ -d "$path" && "$file_count" -eq 0 ]]; then
        detail="空目录"
    else
        detail="$file_count 个文件"
    fi

    if [[ "$WHAT_IF" == true ]]; then
        color "33" "  [预览] ${description}: $size_str ($detail)"
        return
    fi

    if rm -rf -- "$path"; then
        log_success "${description}: $size_str ($detail)"
        TOTAL_FREED=$((TOTAL_FREED + size))
        TOTAL_FILES=$((TOTAL_FILES + file_count))
    else
        log_error "删除失败 ${description}: $path"
    fi
}

remove_cache_directory_files() {
    local path="$1"
    local description="$2"

    if [[ ! -d "$path" ]]; then
        log_verbose "跳过不存在的目录: $path"
        return
    fi

    if ! test_is_safe_cache_path "$path"; then
        return
    fi

    local items=()
    local item
    local size=0
    local file_count=0
    while IFS= read -r -d '' item; do
        items+=("$item")
        size=$((size + $(file_size "$item")))
        file_count=$((file_count + 1))
    done < <(find "$path" -type f -print0 2>/dev/null)

    if [[ "$file_count" -eq 0 ]]; then
        log_verbose "跳过无文件目录: $path"
        return
    fi

    local size_str
    size_str="$(format_file_size "$size")"
    if [[ "$WHAT_IF" == true ]]; then
        color "33" "  [预览] ${description}: $size_str ($file_count 个文件，保留目录)"
        return
    fi

    local removed_size=0
    local removed_files=0
    for item in "${items[@]}"; do
        local current_size
        current_size="$(file_size "$item")"
        if rm -f -- "$item"; then
            removed_size=$((removed_size + current_size))
            removed_files=$((removed_files + 1))
        else
            log_error "删除失败 $item"
        fi
    done

    if [[ "$removed_files" -gt 0 ]]; then
        log_success "${description}: $(format_file_size "$removed_size") ($removed_files 个文件，保留目录)"
        TOTAL_FREED=$((TOTAL_FREED + removed_size))
        TOTAL_FILES=$((TOTAL_FILES + removed_files))
    fi
}

remove_cache_directory_contents() {
    local path="$1"
    local description="$2"

    if [[ ! -d "$path" ]]; then
        log_verbose "跳过不存在的目录: $path"
        return
    fi

    if ! test_is_safe_cache_path "$path"; then
        return
    fi

    if [[ -z "$(find "$path" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
        log_verbose "跳过空目录: $path"
        return
    fi

    local size=0
    local file_count=0
    local directory_count=0
    local item
    while IFS= read -r -d '' item; do
        size=$((size + $(file_size "$item")))
        file_count=$((file_count + 1))
    done < <(find "$path" -mindepth 1 -type f -print0 2>/dev/null)

    while IFS= read -r -d '' item; do
        directory_count=$((directory_count + 1))
    done < <(find "$path" -mindepth 1 -type d -print0 2>/dev/null)

    local size_str
    size_str="$(format_file_size "$size")"

    if [[ "$WHAT_IF" == true ]]; then
        color "33" "  [预览] ${description}: $size_str ($file_count 个文件，$directory_count 个目录，保留目录)"
        return
    fi

    while IFS= read -r -d '' item; do
        if ! rm -rf -- "$item"; then
            log_error "删除失败 $item"
        fi
    done < <(find "$path" -mindepth 1 -maxdepth 1 -print0 2>/dev/null)

    log_success "${description}: $size_str ($file_count 个文件，$directory_count 个目录，保留目录)"
    TOTAL_FREED=$((TOTAL_FREED + size))
    TOTAL_FILES=$((TOTAL_FILES + file_count))
}

find_project_files() {
    local root="$1"
    local pattern="$2"
    [[ -d "$root" ]] || return 0

    local prune_args=()
    local excluded
    for excluded in "${EXCLUDED_TRAVERSAL_DIRECTORIES[@]}"; do
        prune_args+=( -name "$excluded" -o )
    done
    if [[ "${#prune_args[@]}" -gt 0 ]]; then
        unset "prune_args[$((${#prune_args[@]} - 1))]"
    fi

    find "$root" \( "${prune_args[@]}" \) -prune -o -type f -name "$pattern" -print0 2>/dev/null
}

clear_backend_cache() {
    log_step "清理后端缓存（Go）..."

    if [[ ! -d "$BACKEND_PATH" ]]; then
        log_warning "未发现后端目录: $BACKEND_PATH"
        return
    fi

    local f
    for f in "$BACKEND_PATH/coverage.out" "$BACKEND_PATH/coverage.html" "$BACKEND_PATH/cover.out" "$BACKEND_PATH/cover.html"; do
        [[ -e "$f" ]] && remove_cache_item "$f" "后端覆盖率文件 ($(basename -- "$f"))"
    done

    local d
    for d in "$BACKEND_PATH/tmp" "$BACKEND_PATH/.tmp"; do
        [[ -e "$d" ]] && remove_cache_item "$d" "后端临时目录 ($(basename -- "$d"))"
    done

    if ! command -v go >/dev/null 2>&1; then
        log_warning "跳过 go clean（未安装 Go）"
        return
    fi

    if [[ "$WHAT_IF" == true ]]; then
        color "33" "  [预览] Go 编译/测试缓存（go clean -cache -testcache）"
        return
    fi

    log_info "执行: go clean -cache -testcache（清理 Go 编译/测试缓存）"
    if (cd "$BACKEND_PATH" && go clean -cache -testcache >/dev/null); then
        log_success "Go 缓存清理完成（go clean）"
    else
        log_warning "跳过 go clean（执行失败）"
    fi
}

clear_frontend_cache() {
    log_step "清理前端缓存..."

    local path
    path="$FRONTEND_PATH/node_modules/.cache"
    [[ -e "$path" ]] && remove_cache_item "$path" "npm/pnpm 缓存"

    path="$FRONTEND_PATH/.next"
    [[ -e "$path" ]] && remove_cache_item "$path" "Next.js 构建缓存"

    local dir
    for dir in dist build out; do
        path="$FRONTEND_PATH/$dir"
        [[ -e "$path" ]] && remove_cache_item "$path" "前端构建输出 ($dir)"
    done

    path="$FRONTEND_PATH/.turbo"
    [[ -e "$path" ]] && remove_cache_item "$path" "Turbo 构建缓存"

    path="$FRONTEND_PATH/.eslintcache"
    [[ -e "$path" ]] && remove_cache_item "$path" "ESLint 缓存"

    path="$FRONTEND_PATH/.swc"
    [[ -e "$path" ]] && remove_cache_item "$path" "SWC 编译器缓存"
}

clear_log_files() {
    log_step "清理日志文件..."

    local found_any=false
    local log_dir
    for log_dir in "$LOGS_PATH" "$BACKEND_LOGS_PATH"; do
        if [[ ! -d "$log_dir" ]]; then
            log_verbose "日志目录不存在，跳过: $log_dir"
            continue
        fi

        local log_file
        local found_in_dir=false
        while IFS= read -r -d '' log_file; do
            found_any=true
            found_in_dir=true
            remove_cache_item "$log_file" "旧日志文件 ($(relative_project_path "$log_file"))"
        done < <(find "$log_dir" -type f -name "*.log" -mtime +7 -print0 2>/dev/null)

        if [[ "$found_in_dir" == false ]]; then
            log_verbose "$log_dir 中没有超过7天的日志文件"
        fi
    done

    if [[ "$found_any" == false ]]; then
        log_info "没有超过7天的日志文件"
    fi
}

clear_temp_files() {
    log_step "清理临时文件..."

    local item
    while IFS= read -r -d '' item; do
        remove_cache_item "$item" "macOS 系统文件 (.DS_Store)"
    done < <(find_project_files "$PROJECT_ROOT" ".DS_Store")

    while IFS= read -r -d '' item; do
        remove_cache_item "$item" "Windows 缩略图 (Thumbs.db)"
    done < <(find_project_files "$PROJECT_ROOT" "Thumbs.db")

    while IFS= read -r -d '' item; do
        remove_cache_item "$item" "临时文件 ($(relative_project_path "$item"))"
    done < <(find_project_files "$PROJECT_ROOT" "*.tmp")
}

clear_project_specific_cache() {
    log_step "清理项目特定临时文件..."

    local path
    path="$PROJECT_ROOT/context.json"
    [[ -e "$path" ]] && remove_cache_item "$path" "运行时配置 (context.json)"

    path="$FRONTEND_PATH/lint-report.json"
    [[ -e "$path" ]] && remove_cache_item "$path" "ESLint 报告 (lint-report.json)"

    path="$FRONTEND_PATH/lint-result.json"
    [[ -e "$path" ]] && remove_cache_item "$path" "ESLint 结果 (lint-result.json)"

    path="$FRONTEND_PATH/coverage-report"
    [[ -e "$path" ]] && remove_cache_item "$path" "前端覆盖率报告"

    local item
    while IFS= read -r -d '' item; do
        remove_cache_item "$item" "TypeScript 构建信息 ($(basename -- "$item"))"
    done < <(find_project_files "$FRONTEND_PATH" "*.tsbuildinfo")

    path="$BACKEND_PATH/coverage.out"
    [[ -e "$path" ]] && remove_cache_item "$path" "后端覆盖率数据 (coverage.out)"

    path="$FRONTEND_PATH/auth.json"
    if [[ -e "$path" ]]; then
        log_warning "发现前端认证文件 (auth.json)，如需清理请手动删除"
        log_verbose "路径: $path"
    fi

    path="$FRONTEND_PATH/.vitest"
    [[ -e "$path" ]] && remove_cache_item "$path" "Vitest 测试缓存"

    path="$PROJECT_ROOT/.playwright-mcp"
    [[ -e "$path" ]] && remove_cache_directory_files "$path" "Playwright MCP 快照与日志"

    path="$PROJECT_ROOT/.gotmp"
    [[ -e "$path" ]] && remove_cache_item "$path" "Go 临时目录 (.gotmp)"
}

clear_go_build_artifacts() {
    log_step "清理 Go 构建缓存与编译产物..."

    local d
    for d in "$PROJECT_ROOT/.gocache" "$PROJECT_ROOT/.gomodcache"; do
        [[ -e "$d" ]] && remove_cache_item "$d" "Go 缓存目录 ($(basename -- "$d"))"
    done

    local cache_dir="$PROJECT_ROOT/.cache"
    if [[ -d "$cache_dir" ]]; then
        local sub
        for sub in go-build go-mod; do
            [[ -e "$cache_dir/$sub" ]] && remove_cache_item "$cache_dir/$sub" "Go 缓存目录 (.cache/$sub)"
        done
        if [[ -d "$cache_dir" && -z "$(find "$cache_dir" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
            remove_cache_item "$cache_dir" "空缓存目录 (.cache)"
        fi
    fi

    for d in "$BACKEND_PATH/.gocache" "$BACKEND_PATH/.gomodcache"; do
        [[ -e "$d" ]] && remove_cache_item "$d" "后端 Go 缓存目录 (backend-go/$(basename -- "$d"))"
    done

    local exe
    if [[ -d "$BACKEND_PATH" ]]; then
        while IFS= read -r -d '' exe; do
            remove_cache_item "$exe" "Go 编译产物 ($(basename -- "$exe"))"
        done < <(find "$BACKEND_PATH" -maxdepth 1 -type f -name "*.exe" -print0 2>/dev/null)
    fi

    local f
    for f in "$PROJECT_ROOT/coverage.out" "$PROJECT_ROOT/coverage.html" "$PROJECT_ROOT/cover.out" "$PROJECT_ROOT/cover.html"; do
        [[ -e "$f" ]] && remove_cache_item "$f" "Go 覆盖率文件（根目录）($(basename -- "$f"))"
    done
}

clear_report_artifacts() {
    log_step "清理历史重复报表输出目录..."

    local legacy_backend_output="$BACKEND_PATH/backend-go"
    if [[ ! -d "$legacy_backend_output" ]]; then
        log_verbose "未发现历史重复输出目录: $legacy_backend_output"
        return
    fi

    local actual
    local expected
    actual="$(resolve_path "$legacy_backend_output" 2>/dev/null || true)"
    expected="$(cd "$BACKEND_PATH" 2>/dev/null && printf '%s/backend-go\n' "$(pwd -P)")"
    if [[ -z "$actual" || "$actual" != "$expected" ]]; then
        log_error "拒绝清理非预期的历史重复输出目录: ${actual:-$legacy_backend_output}"
        return
    fi

    remove_cache_item "$legacy_backend_output" "历史重复后端输出目录 (backend-go/backend-go)"
}

clear_backend_data() {
    log_step "清理后端数据输出目录..."

    local backend_data="$BACKEND_PATH/data"
    if [[ ! -d "$backend_data" ]]; then
        log_verbose "未发现后端数据输出目录: $backend_data"
        return
    fi

    remove_cache_directory_contents "$backend_data" "后端数据输出目录内容 (backend-go/data/*)"
}

clear_package_manager_cache() {
    log_step "清理包管理器缓存..."

    if [[ "$WHAT_IF" != true && "$FORCE" != true ]]; then
        log_warning "即将删除 pnpm store，下次安装依赖时将重新下载所有包。"
        local confirm
        read -r -p "确认清理包管理器缓存？ (Y/N) " confirm
        if [[ "$confirm" != "Y" && "$confirm" != "y" ]]; then
            log_info "已跳过包管理器缓存清理"
            return
        fi
    fi

    if [[ "$WHAT_IF" == true ]]; then
        log_warning "预览模式：包管理器缓存需要重新下载（pnpm）"
    fi

    local path
    path="$PROJECT_ROOT/.pnpm-store"
    [[ -e "$path" ]] && remove_cache_item "$path" "pnpm 全局存储 (.pnpm-store)"

    path="$FRONTEND_PATH/.pnpm-store"
    [[ -e "$path" ]] && remove_cache_item "$path" "pnpm 存储 (frontend/.pnpm-store)"
}

clear_playwright_artifacts() {
    log_step "清理 Playwright 测试产物..."

    local path
    path="$FRONTEND_PATH/playwright-report"
    [[ -e "$path" ]] && remove_cache_item "$path" "Playwright 测试报告"

    path="$FRONTEND_PATH/test-results"
    [[ -e "$path" ]] && remove_cache_item "$path" "Playwright 测试结果"

    path="$PROJECT_ROOT/.playwright-mcp"
    [[ -e "$path" ]] && remove_cache_directory_files "$path" "Playwright MCP 快照与日志"
}

show_summary() {
    printf '\n'
    color "36" "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    color "36" "  清理摘要"
    color "36" "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    printf '\n'

    if [[ "$WHAT_IF" == true ]]; then
        color "33" "  模式:     预览模式（未实际删除）"
    else
        color "32" "  已删除:   $TOTAL_FILES 个文件"
        printf '  释放空间: '
        color "32" "$(format_file_size "$TOTAL_FREED")"
    fi

    printf '\n'
    color "36" "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    printf '\n'
}

show_interactive_menu() {
    cat <<'EOF'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  缓存清理选项
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ── 核心清理 ──
  [1] 清理所有缓存（推荐）
  [2] 仅清理后端缓存（Go 覆盖率 / go clean）
  [3] 仅清理前端缓存（Next.js / Turbo / ESLint / SWC）
  [4] 仅清理日志文件（logs/ + backend-go/logs/）
  [5] 仅清理临时文件（.DS_Store / Thumbs.db / *.tmp）
  [6] 仅清理项目特定文件（lint 报告 / 覆盖率 / MCP 快照等）
  ── 扩展清理 ──
  [7] Go 构建缓存与编译产物（.gocache / app.exe 等）
  [8] 历史重复报表输出目录（仅 backend-go/backend-go）
  [9] 后端数据输出目录（backend-go/data/）
  [10] 包管理器缓存（pnpm store）需重新下载
  [11] Playwright 测试产物（报告 / 测试结果 / MCP 快照）
  ──
  [0] 取消

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF

    local choice
    read -r -p "请选择 (0-11) " choice
    case "$choice" in
        1) ALL=true ;;
        2) BACKEND=true ;;
        3) FRONTEND=true ;;
        4) LOGS=true ;;
        5) TEMP=true ;;
        6) PROJECT_FILES=true ;;
        7) GO_BUILD=true ;;
        8) REPORT_ARTIFACTS=true ;;
        9) BACKEND_DATA=true ;;
        10) PACKAGE_CACHE=true ;;
        11) PLAYWRIGHT=true ;;
        0)
            log_info "已取消清理操作"
            exit 0
            ;;
        *)
            die "无效的选择"
            ;;
    esac
}

has_selection() {
    [[ "$ALL" == true || "$BACKEND" == true || "$FRONTEND" == true || "$LOGS" == true ||
       "$TEMP" == true || "$PROJECT_FILES" == true || "$GO_BUILD" == true ||
       "$REPORT_ARTIFACTS" == true || "$BACKEND_DATA" == true ||
       "$PACKAGE_CACHE" == true || "$PLAYWRIGHT" == true ]]
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --all|-All) ALL=true; shift ;;
            --backend|-Backend) BACKEND=true; shift ;;
            --frontend|-Frontend) FRONTEND=true; shift ;;
            --logs|-Logs) LOGS=true; shift ;;
            --temp|-Temp) TEMP=true; shift ;;
            --project-files|-ProjectFiles) PROJECT_FILES=true; shift ;;
            --go-build|-GoBuild) GO_BUILD=true; shift ;;
            --report-artifacts|-ReportArtifacts) REPORT_ARTIFACTS=true; shift ;;
            --backend-data|-BackendData) BACKEND_DATA=true; shift ;;
            --package-cache|-PackageCache) PACKAGE_CACHE=true; shift ;;
            --playwright|-Playwright) PLAYWRIGHT=true; shift ;;
            --force|-Force) FORCE=true; shift ;;
            --what-if|-WhatIf) WHAT_IF=true; shift ;;
            --verbose|-Verbose) VERBOSE=true; shift ;;
            --help|-Help|-h) HELP=true; shift ;;
            *) die "未知参数: $1" ;;
        esac
    done
}

main() {
    parse_args "$@"

    printf '\n'
    color "36" "🧹 企业级网络设备巡检系统 - 缓存清理"
    color "36" "============================================"
    printf '\n'

    if [[ "$HELP" == true ]]; then
        show_help
        exit 0
    fi

    if ! has_selection; then
        show_interactive_menu
    fi

    if [[ "$FORCE" != true && "$WHAT_IF" != true ]]; then
        local confirm
        printf '\n'
        read -r -p "确认要清理缓存吗？ (Y/N) " confirm
        if [[ "$confirm" != "Y" && "$confirm" != "y" ]]; then
            log_info "已取消清理操作"
            exit 0
        fi
        printf '\n'
    fi

    if [[ "$WHAT_IF" == true ]]; then
        log_warning "预览模式：将显示要删除的内容，但不会实际删除"
        printf '\n'
    fi

    [[ "$ALL" == true || "$BACKEND" == true ]] && clear_backend_cache
    [[ "$ALL" == true || "$FRONTEND" == true ]] && clear_frontend_cache
    [[ "$ALL" == true || "$LOGS" == true ]] && clear_log_files
    [[ "$ALL" == true || "$TEMP" == true ]] && clear_temp_files
    [[ "$ALL" == true || "$PROJECT_FILES" == true ]] && clear_project_specific_cache
    [[ "$ALL" == true || "$GO_BUILD" == true ]] && clear_go_build_artifacts
    [[ "$ALL" == true || "$REPORT_ARTIFACTS" == true ]] && clear_report_artifacts
    [[ "$ALL" == true || "$BACKEND_DATA" == true ]] && clear_backend_data
    [[ "$ALL" == true || "$PACKAGE_CACHE" == true ]] && clear_package_manager_cache
    [[ "$ALL" == true || "$PLAYWRIGHT" == true ]] && clear_playwright_artifacts

    show_summary

    if [[ "$WHAT_IF" != true ]]; then
        log_success "缓存清理完成！"
    fi
}

main "$@"
