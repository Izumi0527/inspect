#!/usr/bin/env bash
# 企业级网络设备巡检系统 - 开发环境快速启动脚本（Bash 版）
# 快速启动数据库、后端和前端服务，并提供初始化与诊断能力。

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

SERVICES="all"
WAIT_SECONDS=10
SKIP_HEALTH_CHECK=false
DIAGNOSE=false
SETUP=false
SKIP_PREREQUISITES=false
SKIP_DATABASE=false
SKIP_TESTS=false
VERBOSE=false
HELP=false

SERVER_HOST_VALUE=""
PUBLIC_HOST_VALUE=""
SERVER_PORT_VALUE=0
API_URL_VALUE=""
WS_URL_VALUE=""
HEALTH_URL_VALUE=""
PORT_ERROR_VALUE=""
ENV_FILE_PATH_VALUE=""

color() {
    local code="$1"
    shift
    if [[ -t 1 ]]; then
        printf '\033[%sm%s\033[0m\n' "$code" "$*"
    else
        printf '%s\n' "$*"
    fi
}

write_color() {
    local message="$1"
    local color_name="${2:-White}"
    case "$color_name" in
        Red) color "31" "$message" ;;
        Green) color "32" "$message" ;;
        Yellow) color "33" "$message" ;;
        Blue) color "34" "$message" ;;
        Cyan) color "36" "$message" ;;
        Magenta) color "35" "$message" ;;
        Gray) color "90" "$message" ;;
        *) printf '%s\n' "$message" ;;
    esac
}

die() {
    write_color "❌ $*" "Red"
    exit 1
}

show_help() {
    cat <<'EOF'
开发环境快速启动脚本（Bash 版）

用法:
  ./scripts/dev-start.sh [选项]

选项:
  --services, -Services <database|backend|frontend|all>
                                 指定要启动的服务，默认 all
  --wait, -Wait <seconds>         启动后等待服务就绪的时间，默认 10
  --skip-health-check, -SkipHealthCheck
                                 跳过健康检查
  --diagnose, -Diagnose           仅执行开发环境诊断（不启动任何服务）
  --setup, -Setup                 执行开发环境初始化
  --skip-prerequisites, -SkipPrerequisites
                                 Setup 模式下跳过前置条件检查
  --skip-database, -SkipDatabase  Setup 模式下跳过数据库环境设置
  --skip-tests, -SkipTests        Setup 模式下跳过测试验证
  --verbose, -Verbose             输出更详细的诊断信息
  --help, -Help                   显示帮助

示例:
  ./scripts/dev-start.sh
  ./scripts/dev-start.sh --services database
  ./scripts/dev-start.sh --wait 30
  ./scripts/dev-start.sh --setup --skip-tests
  ./scripts/dev-start.sh --diagnose --verbose
EOF
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --services|-Services)
                [[ $# -ge 2 ]] || die "缺少 --services 参数值"
                SERVICES="$2"
                shift 2
                ;;
            --wait|-Wait)
                [[ $# -ge 2 ]] || die "缺少 --wait 参数值"
                WAIT_SECONDS="$2"
                shift 2
                ;;
            --skip-health-check|-SkipHealthCheck)
                SKIP_HEALTH_CHECK=true
                shift
                ;;
            --diagnose|-Diagnose)
                DIAGNOSE=true
                shift
                ;;
            --setup|-Setup)
                SETUP=true
                shift
                ;;
            --skip-prerequisites|-SkipPrerequisites)
                SKIP_PREREQUISITES=true
                shift
                ;;
            --skip-database|-SkipDatabase)
                SKIP_DATABASE=true
                shift
                ;;
            --skip-tests|-SkipTests)
                SKIP_TESTS=true
                shift
                ;;
            --verbose|-Verbose)
                VERBOSE=true
                shift
                ;;
            --help|-Help|-h)
                HELP=true
                shift
                ;;
            database|backend|frontend|all)
                SERVICES="$1"
                shift
                ;;
            *)
                die "未知参数: $1"
                ;;
        esac
    done

    case "$SERVICES" in
        database|backend|frontend|all) ;;
        *) die "--services 仅支持 database、backend、frontend、all" ;;
    esac

    if ! [[ "$WAIT_SECONDS" =~ ^[0-9]+$ ]]; then
        die "--wait 必须是非负整数"
    fi
}

status_line() {
    local message="$1"
    local status="$2"
    local detail="${3:-}"
    local icon="•"
    local color_name="White"

    case "$status" in
        OK) icon="✅"; color_name="Green" ;;
        WARN) icon="⚠️"; color_name="Yellow" ;;
        ERROR) icon="❌"; color_name="Red" ;;
        INFO) icon="ℹ️"; color_name="Cyan" ;;
    esac

    write_color "$icon $message" "$color_name"
    if [[ -n "$detail" && "$VERBOSE" == true ]]; then
        write_color "   $detail" "Gray"
    fi
}

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

compose_cmd() {
    if command_exists docker && docker compose version >/dev/null 2>&1; then
        docker compose "$@"
        return
    fi
    if command_exists docker-compose; then
        docker-compose "$@"
        return
    fi
    return 127
}

compose_available() {
    compose_cmd version >/dev/null 2>&1
}

run_cmd() {
    local description="$1"
    local working_directory="$2"
    local ignore_errors="$3"
    shift 3

    write_color "🔄 ${description}..." "Cyan"
    if (cd "$working_directory" && "$@"); then
        write_color "✅ ${description} 完成" "Green"
        return 0
    fi

    if [[ "$ignore_errors" == true ]]; then
        write_color "⚠️ ${description} 失败，已按可忽略错误继续" "Yellow"
        return 0
    fi

    die "${description} 失败"
}

dotenv_value() {
    local file_path="$1"
    local key="$2"
    local default_value="${3:-}"

    if [[ ! -f "$file_path" ]]; then
        printf '%s\n' "$default_value"
        return
    fi

    local line
    while IFS= read -r line || [[ -n "$line" ]]; do
        line="${line%$'\r'}"
        local trimmed="${line#"${line%%[![:space:]]*}"}"
        trimmed="${trimmed%"${trimmed##*[![:space:]]}"}"
        [[ -z "$trimmed" || "$trimmed" == \#* ]] && continue
        [[ "$trimmed" == *=* ]] || continue

        local name="${trimmed%%=*}"
        local value="${trimmed#*=}"
        name="${name#"${name%%[![:space:]]*}"}"
        name="${name%"${name##*[![:space:]]}"}"
        [[ "$name" == "$key" ]] || continue

        value="${value#"${value%%[![:space:]]*}"}"
        value="${value%"${value##*[![:space:]]}"}"
        if [[ ${#value} -ge 2 ]]; then
            local first="${value:0:1}"
            local last="${value: -1}"
            if [[ ( "$first" == '"' || "$first" == "'" ) && "$last" == "$first" ]]; then
                value="${value:1:${#value}-2}"
            fi
        fi
        printf '%s\n' "$value"
        return
    done <"$file_path"

    printf '%s\n' "$default_value"
}

get_backend_dev_config() {
    local allow_missing_port="${1:-false}"
    local env_file_path="$PROJECT_ROOT/.env"

    local server_host="${SERVER_HOST:-}"
    if [[ -z "$server_host" ]]; then
        server_host="$(dotenv_value "$env_file_path" "SERVER_HOST" "127.0.0.1")"
    fi

    local public_host="$server_host"
    case "$public_host" in
        ""|"0.0.0.0"|"::"|"[::]") public_host="127.0.0.1" ;;
    esac

    local server_port_raw="${SERVER_PORT:-}"
    if [[ -z "$server_port_raw" ]]; then
        server_port_raw="$(dotenv_value "$env_file_path" "SERVER_PORT" "")"
    fi

    local server_port=0
    local port_error=""
    if [[ "$server_port_raw" =~ ^[0-9]+$ ]] && (( server_port_raw >= 1 && server_port_raw <= 65535 )); then
        server_port="$server_port_raw"
    else
        port_error="根目录 .env 或环境变量中的 SERVER_PORT 未配置或非法。"
        if [[ "$allow_missing_port" != true ]]; then
            die "$port_error"
        fi
    fi

    local api_url="${NEXT_PUBLIC_API_URL:-}"
    if [[ -z "$api_url" ]]; then
        api_url="$(dotenv_value "$env_file_path" "NEXT_PUBLIC_API_URL" "")"
    fi
    if [[ -z "$api_url" && "$server_port" -gt 0 ]]; then
        api_url="http://${public_host}:${server_port}"
    fi

    local ws_url="${NEXT_PUBLIC_WS_URL:-}"
    if [[ -z "$ws_url" ]]; then
        ws_url="$(dotenv_value "$env_file_path" "NEXT_PUBLIC_WS_URL" "")"
    fi
    if [[ -z "$ws_url" && "$server_port" -gt 0 ]]; then
        ws_url="ws://${public_host}:${server_port}"
    fi

    local health_url=""
    if [[ "$server_port" -gt 0 ]]; then
        health_url="http://${public_host}:${server_port}/health"
    fi

    SERVER_HOST_VALUE="$server_host"
    PUBLIC_HOST_VALUE="$public_host"
    SERVER_PORT_VALUE="$server_port"
    API_URL_VALUE="$api_url"
    WS_URL_VALUE="$ws_url"
    HEALTH_URL_VALUE="$health_url"
    PORT_ERROR_VALUE="$port_error"
    ENV_FILE_PATH_VALUE="$env_file_path"
}

get_host_port() {
    local container_name="$1"
    local container_port="$2"
    local env_var_name="$3"
    local default_port="$4"

    local mapping
    mapping="$(docker port "$container_name" "${container_port}/tcp" 2>/dev/null | head -n 1 || true)"
    if [[ "$mapping" =~ :([0-9]+)$ ]]; then
        printf '%s\n' "${BASH_REMATCH[1]}"
        return
    fi

    local env_value="${!env_var_name:-}"
    if [[ "$env_value" =~ ^[0-9]+$ ]]; then
        printf '%s\n' "$env_value"
        return
    fi

    printf '%s\n' "$default_port"
}

test_tcp() {
    local host="$1"
    local port="$2"
    if command_exists nc; then
        nc -z "$host" "$port" >/dev/null 2>&1
        return
    fi
    if command_exists timeout; then
        timeout 2 bash -c "cat < /dev/null > /dev/tcp/$host/$port" >/dev/null 2>&1
        return
    fi
    bash -c "cat < /dev/null > /dev/tcp/$host/$port" >/dev/null 2>&1
}

test_setup_prerequisites() {
    write_color $'\n🔍 检查开发环境前置条件...' "Blue"

    local all_ok=true
    local tool
    for tool in git docker node pnpm go; do
        if command_exists "$tool"; then
            write_color "✅ $tool 已安装" "Green"
        else
            write_color "❌ $tool 未安装" "Red"
            all_ok=false
        fi
    done

    if compose_available; then
        write_color "✅ Docker Compose 已安装" "Green"
    else
        write_color "❌ Docker Compose 未安装" "Red"
        all_ok=false
    fi

    [[ "$all_ok" == true ]] || die "前置条件检查失败，请先安装缺失的工具"
    write_color "✅ 所有前置条件检查通过" "Green"
}

new_development_environment_files() {
    write_color $'\n📄 创建开发环境配置文件...' "Blue"

    if [[ ! -f "$PROJECT_ROOT/.env.development" && ! -f "$PROJECT_ROOT/.env" ]]; then
        if [[ -f "$PROJECT_ROOT/.env.example" ]]; then
            cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env.development"
            write_color "✅ 已创建后端环境配置文件: .env.development" "Green"
        else
            write_color "⚠️ 未找到 .env.example，跳过后端环境文件创建" "Yellow"
        fi
    fi

    local frontend_env_path="$PROJECT_ROOT/frontend/.env.local"
    if [[ ! -f "$frontend_env_path" ]]; then
        get_backend_dev_config true
        local api_url="${API_URL_VALUE:-http://127.0.0.1:9000}"
        local ws_url="${WS_URL_VALUE:-ws://127.0.0.1:9000}"
        mkdir -p "$PROJECT_ROOT/frontend"
        cat >"$frontend_env_path" <<EOF
# API 配置
# Bash 环境建议使用 127.0.0.1，避免 localhost 被解析为 IPv6(::1) 导致连接失败。
NEXT_PUBLIC_API_URL=$api_url
NEXT_PUBLIC_WS_URL=$ws_url

# 开发配置
NODE_ENV=development
NEXT_PUBLIC_ENV=development
EOF
        write_color "✅ 前端环境配置文件已创建: frontend/.env.local" "Green"
    else
        write_color "ℹ️ 前端环境配置文件已存在，跳过创建: frontend/.env.local" "Cyan"
    fi
}

initialize_database_environment() {
    write_color $'\n🗄️ 设置数据库环境...' "Blue"

    local compose_file="docker-compose.dev.yml"
    if [[ -f "$PROJECT_ROOT/docker-compose.db.yml" ]]; then
        compose_file="docker-compose.db.yml"
    fi
    [[ -f "$PROJECT_ROOT/$compose_file" ]] || die "未找到数据库 Docker Compose 配置文件"

    run_cmd "拉取数据库镜像" "$PROJECT_ROOT" false compose_cmd -f "$compose_file" pull
    run_cmd "启动数据库服务" "$PROJECT_ROOT" false compose_cmd -f "$compose_file" up -d

    write_color "⏳ 等待数据库服务启动..." "Yellow"
    sleep 15
    run_cmd "检查数据库服务状态" "$PROJECT_ROOT" false compose_cmd -f "$compose_file" ps
}

initialize_backend_environment() {
    write_color $'\n🔧 设置后端环境...' "Blue"

    local backend_dir="$PROJECT_ROOT/backend-go"
    if [[ ! -d "$backend_dir" ]]; then
        write_color "⚠️ 后端目录不存在，跳过后端环境设置" "Yellow"
        return
    fi

    if [[ -f "$PROJECT_ROOT/.env.development" ]]; then
        export ENV_FILE="$PROJECT_ROOT/.env.development"
    elif [[ -f "$PROJECT_ROOT/.env" ]]; then
        export ENV_FILE="$PROJECT_ROOT/.env"
    fi

    run_cmd "下载 Go 依赖" "$backend_dir" false go mod download
    run_cmd "执行数据库迁移" "$backend_dir" true go run ./cmd/migrate
}

initialize_frontend_environment() {
    write_color $'\n🎨 设置前端环境...' "Blue"

    local frontend_dir="$PROJECT_ROOT/frontend"
    if [[ ! -d "$frontend_dir" ]]; then
        write_color "⚠️ 前端目录不存在，跳过前端环境设置" "Yellow"
        return
    fi

    run_cmd "安装前端依赖" "$frontend_dir" false pnpm install
    run_cmd "前端类型检查" "$frontend_dir" true pnpm run type-check
    run_cmd "前端代码检查" "$frontend_dir" true pnpm run lint
}

invoke_development_test_validation() {
    write_color $'\n🧪 运行开发环境测试验证...' "Blue"

    if [[ -d "$PROJECT_ROOT/backend-go" ]]; then
        run_cmd "后端测试" "$PROJECT_ROOT/backend-go" true go test ./...
    else
        write_color "⚠️ 后端目录不存在，跳过后端测试" "Yellow"
    fi

    if [[ -d "$PROJECT_ROOT/frontend" ]]; then
        run_cmd "前端测试" "$PROJECT_ROOT/frontend" true pnpm test --run
    else
        write_color "⚠️ 前端目录不存在，跳过前端测试" "Yellow"
    fi
}

show_setup_summary() {
    local postgres_host_port
    local redis_host_port
    postgres_host_port="$(get_host_port inspect-postgres-dev 5432 POSTGRES_HOST_PORT 15500)"
    redis_host_port="$(get_host_port inspect-redis-dev 6379 REDIS_HOST_PORT 26380)"
    get_backend_dev_config true

    write_color $'\n============================================================' "Cyan"
    write_color "🎉 开发环境设置完成！" "Green"
    write_color "============================================================" "Cyan"

    write_color $'\n📊 服务访问地址:' "Blue"
    write_color "  🎨 前端开发服务器: http://localhost:3000" "White"
    if [[ "$SERVER_PORT_VALUE" -gt 0 ]]; then
        write_color "  🔧 后端 API 服务器: $API_URL_VALUE" "White"
    else
        write_color "  ⚠️ 后端端口未配置: $PORT_ERROR_VALUE" "Yellow"
    fi
    write_color "  📚 API 说明: docs/api/openapi.json" "White"
    write_color "  🗄️ PostgreSQL: localhost:$postgres_host_port" "White"
    write_color "  🔴 Redis: localhost:$redis_host_port" "White"
    write_color "  🔧 pgAdmin: http://localhost:5050" "White"
    write_color "  🔧 Redis Commander: http://localhost:8081" "White"

    write_color $'\n🚀 启动开发服务器:' "Blue"
    write_color "  统一入口: ./scripts/dev-start.sh" "White"
    write_color "  后端: ./scripts/dev-start.sh --services backend" "White"
    write_color "  前端: ./scripts/dev-start.sh --services frontend" "White"
}

invoke_development_setup() {
    write_color "🚀 开始设置企业级网络设备巡检系统开发环境" "Green"
    write_color "============================================================" "Cyan"

    if [[ "$SKIP_PREREQUISITES" != true ]]; then
        test_setup_prerequisites
    fi

    new_development_environment_files

    if [[ "$SKIP_DATABASE" != true ]]; then
        initialize_database_environment
    fi

    initialize_backend_environment
    initialize_frontend_environment

    if [[ "$SKIP_TESTS" != true ]]; then
        invoke_development_test_validation
    fi

    show_setup_summary
    write_color $'\n✅ 开发环境设置成功完成！' "Green"
}

test_prerequisites() {
    write_color "🔍 检查前置条件..." "Blue"

    local all_ok=true
    if command_exists docker; then
        write_color "✅ Docker 可用" "Green"
    else
        write_color "❌ Docker 未安装或不可用" "Red"
        all_ok=false
    fi

    if [[ "$SERVICES" == "database" || "$SERVICES" == "backend" || "$SERVICES" == "all" ]]; then
        if compose_available; then
            write_color "✅ docker compose 可用" "Green"
        else
            write_color "❌ docker compose 未安装或不可用" "Red"
            all_ok=false
        fi
    fi

    if [[ "$SERVICES" == "backend" || "$SERVICES" == "all" ]]; then
        if command_exists go; then
            write_color "✅ Go 运行时 可用" "Green"
        else
            write_color "❌ Go 运行时 未安装或不可用" "Red"
            all_ok=false
        fi
    fi

    if [[ "$SERVICES" == "frontend" || "$SERVICES" == "all" ]]; then
        if command_exists pnpm; then
            write_color "✅ pnpm 包管理器 可用" "Green"
        else
            write_color "❌ pnpm 包管理器 未安装或不可用" "Red"
            all_ok=false
        fi
    fi

    [[ "$all_ok" == true ]] || die "前置条件检查失败，请先安装必要的工具"
}

database_running() {
    DB_POSTGRES_RUNNING=false
    DB_REDIS_RUNNING=false
    DB_BOTH_RUNNING=false

    local pg_container
    local redis_container
    pg_container="$(docker ps --filter "name=inspect-postgres-dev" --format "{{.Names}}" 2>/dev/null || true)"
    redis_container="$(docker ps --filter "name=inspect-redis-dev" --format "{{.Names}}" 2>/dev/null || true)"

    [[ "$pg_container" == "inspect-postgres-dev" ]] && DB_POSTGRES_RUNNING=true
    [[ "$redis_container" == "inspect-redis-dev" ]] && DB_REDIS_RUNNING=true
    [[ "$DB_POSTGRES_RUNNING" == true && "$DB_REDIS_RUNNING" == true ]] && DB_BOTH_RUNNING=true
}

get_dev_compose_file() {
    if [[ -f "$PROJECT_ROOT/docker-compose.dev.yml" ]]; then
        printf '%s\n' "docker-compose.dev.yml"
        return
    fi
    if [[ -f "$PROJECT_ROOT/docker-compose.yml" ]]; then
        write_color "⚠️ 检测到旧版配置文件: docker-compose.yml（建议迁移到 docker-compose.dev.yml）" "Yellow"
        printf '%s\n' "docker-compose.yml"
        return
    fi
    die "未找到 Docker Compose 配置文件: docker-compose.dev.yml"
}

start_database_services() {
    write_color $'\n🗄️ 启动数据库服务...' "Blue"

    database_running
    if [[ "$DB_BOTH_RUNNING" == true ]]; then
        write_color "✅ 数据库服务已在运行中，跳过启动" "Green"
        write_color "  - PostgreSQL: inspect-postgres-dev" "Gray"
        write_color "  - Redis: inspect-redis-dev" "Gray"
        return
    fi

    if [[ "$DB_POSTGRES_RUNNING" == true || "$DB_REDIS_RUNNING" == true ]]; then
        write_color "⚠️ 部分数据库服务已运行:" "Yellow"
        [[ "$DB_POSTGRES_RUNNING" == true ]] && write_color "  - PostgreSQL: 已运行" "Gray"
        [[ "$DB_REDIS_RUNNING" == true ]] && write_color "  - Redis: 已运行" "Gray"
        write_color "将启动缺失的服务..." "Yellow"
    fi

    local compose_file
    compose_file="$(get_dev_compose_file)"
    write_color "使用配置文件: $compose_file" "Gray"

    write_color "🔄 启动数据库容器..." "Cyan"
    (cd "$PROJECT_ROOT" && compose_cmd -f "$compose_file" up -d postgres redis) || die "启动数据库容器失败"
    write_color "✅ 数据库容器启动成功" "Green"

    if [[ "$WAIT_SECONDS" -gt 0 ]]; then
        write_color "⏳ 等待数据库服务启动 ($WAIT_SECONDS 秒)..." "Yellow"
        sleep "$WAIT_SECONDS"
    fi

    database_running
    if [[ "$DB_BOTH_RUNNING" == true ]]; then
        write_color "✅ 数据库服务验证通过" "Green"
    else
        write_color "⚠️ 数据库服务可能未完全启动" "Yellow"
        [[ "$DB_POSTGRES_RUNNING" != true ]] && write_color "  - PostgreSQL: 未检测到" "Red"
        [[ "$DB_REDIS_RUNNING" != true ]] && write_color "  - Redis: 未检测到" "Red"
    fi
}

start_backend_service() {
    write_color $'\n🔧 启动后端服务...' "Blue"

    local backend_dir="$PROJECT_ROOT/backend-go"
    get_backend_dev_config false

    if [[ ! -d "$backend_dir" ]]; then
        write_color "⚠️ 后端目录不存在，跳过后端服务启动" "Yellow"
        return
    fi

    if ! command_exists go; then
        write_color "❌ Go 运行时不可用，无法启动后端服务" "Red"
        return
    fi

    local log_dir="$PROJECT_ROOT/logs/dev"
    mkdir -p "$log_dir"

    write_color "🚀 启动后端开发服务器..." "Cyan"
    write_color "访问地址: $API_URL_VALUE" "White"
    write_color "API 说明: docs/api/openapi.json" "White"
    write_color "日志文件: logs/dev/backend.log" "Gray"

    (
        cd "$backend_dir"
        ENV_FILE="$ENV_FILE_PATH_VALUE" nohup go run ./cmd/api >"$log_dir/backend.log" 2>&1 &
        printf '%s\n' "$!" >"$log_dir/backend.pid"
    )

    write_color "✅ 后端服务已在后台启动，PID: $(cat "$log_dir/backend.pid")" "Green"
}

start_frontend_service() {
    write_color $'\n🎨 启动前端服务...' "Blue"

    local frontend_dir="$PROJECT_ROOT/frontend"
    local frontend_env_path="$frontend_dir/.env.local"
    get_backend_dev_config false

    if [[ ! -d "$frontend_dir" ]]; then
        write_color "⚠️ 前端目录不存在，跳过前端服务启动" "Yellow"
        return
    fi

    if [[ ! -d "$frontend_dir/node_modules" ]]; then
        write_color "⚠️ 前端依赖未安装，正在安装..." "Yellow"
        run_cmd "安装前端依赖" "$frontend_dir" false pnpm install
    fi

    if [[ ! -f "$frontend_env_path" ]]; then
        write_color "⚠️ 前端环境配置文件不存在，创建默认配置..." "Yellow"
        cat >"$frontend_env_path" <<EOF
NEXT_PUBLIC_API_URL=$API_URL_VALUE
NEXT_PUBLIC_WS_URL=$WS_URL_VALUE
NODE_ENV=development
NEXT_PUBLIC_ENV=development
EOF
        write_color "✅ 已创建默认前端环境配置文件" "Green"
    else
        local actual_api_url
        local actual_ws_url
        actual_api_url="$(dotenv_value "$frontend_env_path" "NEXT_PUBLIC_API_URL" "")"
        actual_ws_url="$(dotenv_value "$frontend_env_path" "NEXT_PUBLIC_WS_URL" "")"
        if [[ "$actual_api_url" != "$API_URL_VALUE" || "$actual_ws_url" != "$WS_URL_VALUE" ]]; then
            write_color "⚠️ 检测到 frontend/.env.local 与根 .env 中的后端地址不一致，可能导致前端请求错误地址" "Yellow"
            write_color "   - 当前 NEXT_PUBLIC_API_URL=${actual_api_url}" "Gray"
            write_color "   - 当前 NEXT_PUBLIC_WS_URL=${actual_ws_url}" "Gray"
            write_color "   - 建议改为: NEXT_PUBLIC_API_URL=$API_URL_VALUE" "Gray"
            write_color "   - 建议改为: NEXT_PUBLIC_WS_URL=$WS_URL_VALUE" "Gray"
            write_color "   - 修改后请重启前端开发服务器（pnpm dev）" "Gray"
        fi
    fi

    local log_dir="$PROJECT_ROOT/logs/dev"
    mkdir -p "$log_dir"

    write_color "🚀 启动前端开发服务器..." "Cyan"
    write_color "访问地址: http://localhost:3000" "White"
    write_color "日志文件: logs/dev/frontend.log" "Gray"

    (
        cd "$frontend_dir"
        nohup pnpm dev >"$log_dir/frontend.log" 2>&1 &
        printf '%s\n' "$!" >"$log_dir/frontend.pid"
    )

    write_color "✅ 前端服务已在后台启动，PID: $(cat "$log_dir/frontend.pid")" "Green"
}

invoke_dev_diagnose() {
    printf '\n'
    write_color "🔍 开发环境诊断（dev-start.sh --diagnose）" "Cyan"
    write_color "============================================================" "Cyan"

    write_color $'\n📦 检查必需工具...' "Blue"
    local tool
    for tool in docker go node pnpm; do
        if command_exists "$tool"; then
            local version_output=""
            if [[ "$tool" == "go" ]]; then
                version_output="$(go version 2>/dev/null | head -n 1 || true)"
            else
                version_output="$("$tool" --version 2>/dev/null | head -n 1 || true)"
            fi
            status_line "$tool" "OK" "$version_output"
        else
            status_line "$tool" "ERROR" "未安装或不可用"
        fi
    done
    if compose_available; then
        status_line "docker compose" "OK" "$(compose_cmd version 2>/dev/null | head -n 1 || true)"
    else
        status_line "docker compose" "ERROR" "未安装或不可用"
    fi

    write_color $'\n🐳 检查 Docker 服务...' "Blue"
    if docker info >/dev/null 2>&1; then
        status_line "Docker 服务" "OK"
    else
        status_line "Docker 服务" "ERROR" "Docker 未运行或无权限"
    fi

    write_color $'\n🗄️ 检查数据库容器与端口...' "Blue"
    local postgres_host_port
    local redis_host_port
    postgres_host_port="$(get_host_port inspect-postgres-dev 5432 POSTGRES_HOST_PORT 15500)"
    redis_host_port="$(get_host_port inspect-redis-dev 6379 REDIS_HOST_PORT 26380)"
    database_running
    [[ "$DB_POSTGRES_RUNNING" == true ]] && status_line "PostgreSQL 容器" "OK" "inspect-postgres-dev 运行中" || status_line "PostgreSQL 容器" "WARN" "未运行"
    test_tcp localhost "$postgres_host_port" && status_line "  端口 $postgres_host_port" "OK" "可访问" || status_line "  端口 $postgres_host_port" "WARN" "不可访问"
    [[ "$DB_REDIS_RUNNING" == true ]] && status_line "Redis 容器" "OK" "inspect-redis-dev 运行中" || status_line "Redis 容器" "WARN" "未运行"
    test_tcp localhost "$redis_host_port" && status_line "  端口 $redis_host_port" "OK" "可访问" || status_line "  端口 $redis_host_port" "WARN" "不可访问"

    write_color $'\n📄 检查配置文件...' "Blue"
    local config_file
    for config_file in docker-compose.dev.yml docker-compose.prod.yml docker-compose.yml .env .env.development frontend/.env.local; do
        if [[ -e "$PROJECT_ROOT/$config_file" ]]; then
            status_line "$config_file" "OK" "存在"
        else
            status_line "$config_file" "WARN" "不存在"
        fi
    done

    write_color $'\n📁 检查目录结构...' "Blue"
    local dir
    for dir in backend-go frontend database logs data; do
        if [[ -d "$PROJECT_ROOT/$dir" ]]; then
            status_line "$dir" "OK" "存在"
        else
            status_line "$dir" "WARN" "不存在"
        fi
    done

    write_color $'\n🔌 检查端口占用...' "Blue"
    get_backend_dev_config true
    local ports=(3000 "$postgres_host_port" "$redis_host_port" 5050 8081)
    if [[ "$SERVER_PORT_VALUE" -gt 0 ]]; then
        ports+=("$SERVER_PORT_VALUE")
    elif [[ -n "$PORT_ERROR_VALUE" ]]; then
        status_line "后端端口配置" "WARN" "$PORT_ERROR_VALUE"
    fi

    local port
    local seen=" "
    for port in "${ports[@]}"; do
        [[ "$seen" == *" $port "* ]] && continue
        seen+=" $port "
        if test_tcp localhost "$port"; then
            status_line "端口 $port" "WARN" "被占用或已有服务监听"
        else
            status_line "端口 $port" "OK" "可用"
        fi
    done

    write_color $'\n🌐 检查 Docker 网络...' "Blue"
    local networks
    networks="$(docker network ls --format "{{.Name}}" 2>/dev/null | grep inspect || true)"
    if [[ -n "$networks" ]]; then
        while IFS= read -r network; do
            [[ -n "$network" ]] && status_line "网络: $network" "OK"
        done <<<"$networks"
    else
        status_line "inspect 网络" "INFO" "未创建（首次启动时会自动创建）"
    fi

    write_color $'\n📊 建议操作' "Blue"
    database_running
    if [[ "$DB_BOTH_RUNNING" == true ]]; then
        write_color "  ✅ 数据库已运行，可直接启动后端/全量服务：" "Green"
        write_color "     ./scripts/dev-start.sh --services backend" "White"
    elif [[ "$DB_POSTGRES_RUNNING" != true && "$DB_REDIS_RUNNING" != true ]]; then
        write_color "  🚀 数据库未运行，建议一键启动全量：" "Cyan"
        write_color "     ./scripts/dev-start.sh" "White"
    else
        write_color "  ⚠️ 数据库部分服务运行中，建议重启：" "Yellow"
        write_color "     ./scripts/db-manage.sh stop" "White"
        write_color "     ./scripts/db-manage.sh start" "White"
    fi
}

test_services_health() {
    [[ "$SKIP_HEALTH_CHECK" == true ]] && return

    write_color $'\n🏥 服务健康检查...' "Blue"

    local postgres_host_port
    local redis_host_port
    postgres_host_port="$(get_host_port inspect-postgres-dev 5432 POSTGRES_HOST_PORT 15500)"
    redis_host_port="$(get_host_port inspect-redis-dev 6379 REDIS_HOST_PORT 26380)"

    test_tcp localhost "$postgres_host_port" && write_color "✅ PostgreSQL 服务正常 (localhost:$postgres_host_port)" "Green" || write_color "❌ PostgreSQL 服务不可达 (localhost:$postgres_host_port)" "Red"
    test_tcp localhost "$redis_host_port" && write_color "✅ Redis 服务正常 (localhost:$redis_host_port)" "Green" || write_color "❌ Redis 服务不可达 (localhost:$redis_host_port)" "Red"

    write_color $'\n⏳ 等待后端服务启动...' "Yellow"
    sleep 5

    get_backend_dev_config true
    if [[ "$SERVER_PORT_VALUE" -gt 0 ]]; then
        local max_retries=3
        local retry_delay=3
        local i
        for ((i = 1; i <= max_retries; i++)); do
            if command_exists curl && curl -fsS --max-time 5 "$HEALTH_URL_VALUE" >/dev/null 2>&1; then
                write_color "✅ 后端 API 服务正常" "Green"
                write_color "   - 端点: $HEALTH_URL_VALUE" "Gray"
                break
            fi
            if [[ "$i" -lt "$max_retries" ]]; then
                write_color "⏳ 后端服务尚未就绪，等待重试 ($i/$max_retries)..." "Yellow"
                sleep "$retry_delay"
            else
                write_color "⚠️ 后端 API 服务暂未就绪（可能仍在启动中）" "Yellow"
                write_color "   - 端点: $HEALTH_URL_VALUE" "Gray"
                write_color "   - 请稍后手动检查: curl $HEALTH_URL_VALUE" "Gray"
            fi
        done
    else
        write_color "⚠️ 跳过后端健康检查：$PORT_ERROR_VALUE" "Yellow"
    fi

    local frontend_url="http://localhost:3000"
    if command_exists curl && curl -fsS --max-time 5 "$frontend_url" >/dev/null 2>&1; then
        write_color "✅ 前端应用服务正常" "Green"
        write_color "   - 端点: $frontend_url" "Gray"
    else
        write_color "⚠️ 前端应用服务暂未就绪（可能仍在启动中）" "Yellow"
        write_color "   - 端点: $frontend_url" "Gray"
    fi
}

show_service_info() {
    local postgres_host_port
    local redis_host_port
    postgres_host_port="$(get_host_port inspect-postgres-dev 5432 POSTGRES_HOST_PORT 15500)"
    redis_host_port="$(get_host_port inspect-redis-dev 6379 REDIS_HOST_PORT 26380)"
    get_backend_dev_config true

    write_color $'\n📊 开发环境服务信息:' "Blue"
    write_color "==================================================" "Cyan"

    write_color $'\n🌐 Web 服务:' "Blue"
    write_color "  🎨 前端应用: http://localhost:3000" "White"
    if [[ "$SERVER_PORT_VALUE" -gt 0 ]]; then
        write_color "  🔧 后端 API: $API_URL_VALUE" "White"
        write_color "  💚 健康检查: $HEALTH_URL_VALUE" "White"
    else
        write_color "  ⚠️ 后端端口未配置: $PORT_ERROR_VALUE" "Yellow"
    fi
    write_color "  📚 API 说明: docs/api/openapi.json" "White"
    write_color "  🔌 WS 约定: docs/api/websocket-contract.md" "White"

    write_color $'\n🗄️ 数据库服务:' "Blue"
    write_color "  🐘 PostgreSQL: localhost:$postgres_host_port" "White"
    write_color "    - 数据库: inspect_system_dev" "Gray"
    write_color "    - 用户名: inspect_dev" "Gray"
    write_color "    - 密码: dev_password_2024" "Gray"
    write_color "  🔴 Redis: localhost:$redis_host_port" "White"
    write_color "    - 密码: dev_redis_2024" "Gray"

    write_color $'\n🔧 管理工具:' "Blue"
    write_color "  🔧 pgAdmin: http://localhost:5050" "White"
    write_color "  🔧 Redis Commander: http://localhost:8081" "White"

    write_color $'\n🛠️ 常用命令:' "Blue"
    write_color "  停止数据库: ./scripts/db-manage.sh stop" "White"
    write_color "  查看日志: ./scripts/db-manage.sh logs" "White"
    write_color "  重置数据库: ./scripts/db-manage.sh reset" "White"
    write_color "  后端测试: cd backend-go && go test ./..." "White"
    write_color "  前端检查: cd frontend && pnpm run type-check" "White"
    if [[ "$SERVER_PORT_VALUE" -gt 0 ]]; then
        write_color "  健康检查: curl $HEALTH_URL_VALUE" "White"
    fi

    write_color $'\n💡 提示:' "Yellow"
    write_color "  - 前端和后端服务以后台进程运行，日志位于 logs/dev/" "Gray"
    write_color "  - 可通过 logs/dev/backend.pid 与 logs/dev/frontend.pid 查看进程号" "Gray"
    write_color "  - 修改代码后服务会自动重载" "Gray"
}

main() {
    parse_args "$@"
    cd "$PROJECT_ROOT"

    if [[ "$HELP" == true ]]; then
        show_help
        return
    fi

    if [[ "$SETUP" == true ]]; then
        invoke_development_setup
        return
    fi

    write_color "🚀 启动企业级网络设备巡检系统开发环境" "Green"
    write_color "服务范围: $SERVICES" "Cyan"
    write_color "============================================================" "Cyan"

    if [[ "$DIAGNOSE" == true ]]; then
        invoke_dev_diagnose
        return
    fi

    test_prerequisites

    case "$SERVICES" in
        database)
            start_database_services
            ;;
        backend)
            start_database_services
            start_backend_service
            ;;
        frontend)
            start_frontend_service
            ;;
        all)
            start_database_services
            start_backend_service
            start_frontend_service
            ;;
    esac

    test_services_health
    show_service_info

    write_color $'\n✅ 开发环境启动完成！' "Green"
    write_color "🎯 开始愉快的开发吧！" "Magenta"
}

main "$@"
