#!/usr/bin/env bash
# 企业级网络设备巡检系统 - 生产环境 Docker Compose 管理脚本（Bash 版）

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.prod.yml"

ACTION="start"
ENV_FILE=""
WITH_NGINX=false
MONITORING=false
BUILD=false
PULL=false
FOLLOW=false
TAIL=200
WAIT_SECONDS=20
NO_DETACH=false
REMOVE_VOLUMES=false
SKIP_CONFIG_CHECK=false
DRY_RUN=false
HELP=false
SELECTED_ENV_FILE=""
COMPOSE_CMD=()
SERVICE=()

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
企业级网络设备巡检系统 - 生产环境管理脚本（Bash 版）

用法:
  ./scripts/prod-start.sh [--action <动作>] [选项]

动作:
  start    启动生产服务（默认）
  stop     停止生产服务
  restart  重启生产服务
  status   查看生产服务状态
  logs     查看生产服务日志
  build    构建生产镜像
  pull     拉取生产镜像
  config   校验并输出 Compose 配置
  down     下线生产服务（如需删卷必须显式使用 --remove-volumes）

常用选项:
  --env-file, -EnvFile <file>     指定环境变量文件，默认优先 .env.production，其次 .env
  --with-nginx, -WithNginx        启用 with-nginx profile
  --monitoring, -Monitoring       启用 monitoring profile
  --service, -Service <name>      限定服务，可重复传入
  --pull, -Pull                   start 前先拉取镜像
  --build, -Build                 start 时追加 --build
  --follow, -Follow               logs 时持续跟随日志
  --tail, -Tail <n>               logs 输出行数，默认 200
  --wait, -Wait <seconds>         start 后等待秒数，默认 20
  --no-detach, -NoDetach          start 时前台运行
  --remove-volumes, -RemoveVolumes
                                    down 时追加 -v，删除生产数据卷
  --skip-config-check, -SkipConfigCheck
                                    跳过生产必需环境变量检查
  --dry-run, -DryRun              只打印命令，不实际执行
  --help, -Help                   显示帮助

示例:
  ./scripts/prod-start.sh
  ./scripts/prod-start.sh --env-file .env.production --pull --build
  ./scripts/prod-start.sh --with-nginx --monitoring
  ./scripts/prod-start.sh --action status
  ./scripts/prod-start.sh --action logs --service backend --follow
  ./scripts/prod-start.sh --action config
  ./scripts/prod-start.sh --dry-run
EOF
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --action|-Action)
                [[ $# -ge 2 ]] || die "缺少 --action 参数值"
                ACTION="$2"
                shift 2
                ;;
            start|stop|restart|status|logs|build|pull|config|down)
                ACTION="$1"
                shift
                ;;
            --env-file|-EnvFile)
                [[ $# -ge 2 ]] || die "缺少 --env-file 参数值"
                ENV_FILE="$2"
                shift 2
                ;;
            --with-nginx|-WithNginx)
                WITH_NGINX=true
                shift
                ;;
            --monitoring|-Monitoring)
                MONITORING=true
                shift
                ;;
            --service|-Service)
                [[ $# -ge 2 ]] || die "缺少 --service 参数值"
                IFS=',' read -r -a parsed_services <<<"$2"
                local service
                for service in "${parsed_services[@]}"; do
                    [[ -n "$service" ]] && SERVICE+=("$service")
                done
                shift 2
                ;;
            --pull|-Pull)
                PULL=true
                shift
                ;;
            --build|-Build)
                BUILD=true
                shift
                ;;
            --follow|-Follow)
                FOLLOW=true
                shift
                ;;
            --tail|-Tail)
                [[ $# -ge 2 ]] || die "缺少 --tail 参数值"
                TAIL="$2"
                shift 2
                ;;
            --wait|-Wait)
                [[ $# -ge 2 ]] || die "缺少 --wait 参数值"
                WAIT_SECONDS="$2"
                shift 2
                ;;
            --no-detach|-NoDetach)
                NO_DETACH=true
                shift
                ;;
            --remove-volumes|-RemoveVolumes)
                REMOVE_VOLUMES=true
                shift
                ;;
            --skip-config-check|-SkipConfigCheck)
                SKIP_CONFIG_CHECK=true
                shift
                ;;
            --dry-run|-DryRun)
                DRY_RUN=true
                shift
                ;;
            --help|-Help|-h)
                HELP=true
                shift
                ;;
            *)
                die "未知参数: $1"
                ;;
        esac
    done

    case "$ACTION" in
        start|stop|restart|status|logs|build|pull|config|down) ;;
        *) die "--action 仅支持 start、stop、restart、status、logs、build、pull、config、down" ;;
    esac

    [[ "$TAIL" =~ ^[0-9]+$ && "$TAIL" -ge 1 && "$TAIL" -le 5000 ]] || die "--tail 必须在 1..5000 范围内"
    [[ "$WAIT_SECONDS" =~ ^[0-9]+$ && "$WAIT_SECONDS" -le 600 ]] || die "--wait 必须在 0..600 范围内"
}

dotenv_value() {
    local file_path="$1"
    local key="$2"
    local default_value="${3:-}"

    if [[ -z "$file_path" || ! -f "$file_path" ]]; then
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

get_config_value() {
    local name="$1"
    local env_value="${!name:-}"
    if [[ -n "$env_value" ]]; then
        printf '%s\n' "$env_value"
        return
    fi
    dotenv_value "$SELECTED_ENV_FILE" "$name" ""
}

resolve_production_env_file() {
    if [[ -n "$ENV_FILE" ]]; then
        local candidate="$ENV_FILE"
        if [[ "$candidate" != /* ]]; then
            candidate="$PROJECT_ROOT/$candidate"
        fi
        [[ -f "$candidate" ]] || die "指定的环境变量文件不存在: $candidate"
        (cd -- "$(dirname -- "$candidate")" && printf '%s/%s\n' "$(pwd -P)" "$(basename -- "$candidate")")
        return
    fi

    if [[ -f "$PROJECT_ROOT/.env.production" ]]; then
        printf '%s\n' "$PROJECT_ROOT/.env.production"
        return
    fi

    if [[ -f "$PROJECT_ROOT/.env" ]]; then
        printf '%s\n' "$PROJECT_ROOT/.env"
        return
    fi
}

initialize_docker_compose_command() {
    if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
        COMPOSE_CMD=(docker compose)
        return
    fi

    if command -v docker-compose >/dev/null 2>&1; then
        COMPOSE_CMD=(docker-compose)
        return
    fi

    die "未找到 docker compose 或 docker-compose，请先安装 Docker。"
}

build_compose_base_args() {
    BASE_ARGS=()
    if [[ -n "$SELECTED_ENV_FILE" ]]; then
        BASE_ARGS+=(--env-file "$SELECTED_ENV_FILE")
    fi

    BASE_ARGS+=(-f "$COMPOSE_FILE")

    if [[ "$WITH_NGINX" == true ]]; then
        BASE_ARGS+=(--profile with-nginx)
    fi

    if [[ "$MONITORING" == true ]]; then
        BASE_ARGS+=(--profile monitoring)
    fi
}

quote_arg() {
    local arg="$1"
    if [[ "$arg" =~ [[:space:]] ]]; then
        printf '"%s"' "${arg//\"/\\\"}"
    else
        printf '%s' "$arg"
    fi
}

format_command_preview() {
    local items=("${COMPOSE_CMD[@]}" "$@")
    local item
    local first=true
    for item in "${items[@]}"; do
        if [[ "$first" == true ]]; then
            first=false
        else
            printf ' '
        fi
        quote_arg "$item"
    done
    printf '\n'
}

invoke_compose() {
    local description="$1"
    shift
    local args=("$@")
    local preview
    preview="$(format_command_preview "${args[@]}")"
    write_color "执行: $preview" "Gray"

    if [[ "$DRY_RUN" == true ]]; then
        write_color "预览模式：已跳过 $description" "Yellow"
        return
    fi

    (cd "$PROJECT_ROOT" && "${COMPOSE_CMD[@]}" "${args[@]}") || die "$description 失败"
}

test_production_config() {
    if [[ "$SKIP_CONFIG_CHECK" == true ]]; then
        write_color "已跳过生产环境变量检查。" "Yellow"
        return
    fi

    local required=(POSTGRES_PASSWORD REDIS_PASSWORD SECRET_KEY JWT_SECRET_KEY)
    if [[ "$MONITORING" == true ]]; then
        required+=(GRAFANA_ADMIN_PASSWORD)
    fi

    local missing=()
    local name
    for name in "${required[@]}"; do
        if [[ -z "$(get_config_value "$name")" ]]; then
            missing+=("$name")
        fi
    done

    if [[ "${#missing[@]}" -gt 0 ]]; then
        die "缺少生产环境必需变量: ${missing[*]}。请在 .env.production、.env 或系统环境变量中配置。"
    fi

    local weak_secrets=()
    for name in SECRET_KEY JWT_SECRET_KEY GRAFANA_ADMIN_PASSWORD; do
        local value
        value="$(get_config_value "$name")"
        [[ -z "$value" ]] && continue
        if [[ "$value" =~ your-|change-in-production|admin|password|secret ]]; then
            weak_secrets+=("$name")
        fi
    done

    if [[ "${#weak_secrets[@]}" -gt 0 ]]; then
        die "发现疑似默认或弱生产密钥: ${weak_secrets[*]}。请替换为强随机值。"
    fi

    local item
    for item in NEXT_PUBLIC_API_URL NEXT_PUBLIC_WS_URL CORS_ORIGINS ALLOWED_HOSTS; do
        local value
        value="$(get_config_value "$item")"
        if [[ -z "$value" ]]; then
            write_color "警告: $item 未显式配置，将使用 docker-compose.prod.yml 中的默认值。" "Yellow"
            continue
        fi
        if [[ "$value" =~ yourdomain\.com|localhost|127\.0\.0\.1|\* ]]; then
            write_color "警告: $item 当前值可能不适合生产环境: $value" "Yellow"
        fi
    done
}

test_production_files() {
    [[ -f "$COMPOSE_FILE" ]] || die "未找到生产 Compose 文件: $COMPOSE_FILE"

    local required_paths=(
        "backend-go/Dockerfile"
        "frontend/Dockerfile.prod"
        "database/database-init-complete.sql"
        "database/builtin-templates-complete.sql"
        "config/postgres/postgresql.conf"
    )

    local relative_path
    for relative_path in "${required_paths[@]}"; do
        [[ -e "$PROJECT_ROOT/$relative_path" ]] || die "生产启动所需文件不存在: $relative_path"
    done

    if [[ "$WITH_NGINX" == true ]]; then
        local nginx_paths=("config/nginx/nginx.conf" "config/nginx/conf.d" "ssl")
        for relative_path in "${nginx_paths[@]}"; do
            if [[ ! -e "$PROJECT_ROOT/$relative_path" ]]; then
                if [[ "$DRY_RUN" == true ]]; then
                    write_color "预览警告: 启用 --with-nginx 前请先准备生产 Nginx 配置: $relative_path" "Yellow"
                    continue
                fi
                die "启用 --with-nginx 前请先准备生产 Nginx 配置: $relative_path"
            fi
        done
    fi
}

show_startup_summary() {
    printf '\n'
    write_color "生产环境启动参数" "Cyan"
    write_color "  Compose: docker-compose.prod.yml" "White"
    if [[ -n "$SELECTED_ENV_FILE" ]]; then
        write_color "  EnvFile: ${SELECTED_ENV_FILE#"$PROJECT_ROOT"/}" "White"
    else
        write_color "  EnvFile: 未使用文件，仅使用当前进程环境变量" "Yellow"
    fi

    local profiles=()
    [[ "$WITH_NGINX" == true ]] && profiles+=(with-nginx)
    [[ "$MONITORING" == true ]] && profiles+=(monitoring)
    if [[ "${#profiles[@]}" -eq 0 ]]; then
        write_color "  Profiles: default" "White"
    else
        write_color "  Profiles: ${profiles[*]}" "White"
    fi

    if [[ "${#SERVICE[@]}" -gt 0 ]]; then
        write_color "  Services: ${SERVICE[*]}" "White"
    fi
    printf '\n'
}

start_production_services() {
    build_compose_base_args

    if [[ "$PULL" == true ]]; then
        invoke_compose "拉取生产镜像" "${BASE_ARGS[@]}" pull "${SERVICE[@]}"
    fi

    local up_args=("${BASE_ARGS[@]}" up)
    if [[ "$NO_DETACH" != true ]]; then
        up_args+=(-d)
    fi
    if [[ "$BUILD" == true ]]; then
        up_args+=(--build)
    fi
    up_args+=("${SERVICE[@]}")

    invoke_compose "启动生产服务" "${up_args[@]}"

    if [[ "$DRY_RUN" != true && "$NO_DETACH" != true && "$WAIT_SECONDS" -gt 0 ]]; then
        write_color "等待服务启动 $WAIT_SECONDS 秒..." "Yellow"
        sleep "$WAIT_SECONDS"
        build_compose_base_args
        invoke_compose "查看生产服务状态" "${BASE_ARGS[@]}" ps
    fi
}

invoke_production_action() {
    build_compose_base_args

    case "$ACTION" in
        start)
            start_production_services
            ;;
        stop)
            invoke_compose "停止生产服务" "${BASE_ARGS[@]}" stop "${SERVICE[@]}"
            ;;
        restart)
            invoke_compose "重启生产服务" "${BASE_ARGS[@]}" restart "${SERVICE[@]}"
            ;;
        status)
            invoke_compose "查看生产服务状态" "${BASE_ARGS[@]}" ps "${SERVICE[@]}"
            ;;
        logs)
            local args=("${BASE_ARGS[@]}" logs --tail "$TAIL")
            [[ "$FOLLOW" == true ]] && args+=(-f)
            args+=("${SERVICE[@]}")
            invoke_compose "查看生产服务日志" "${args[@]}"
            ;;
        build)
            invoke_compose "构建生产镜像" "${BASE_ARGS[@]}" build "${SERVICE[@]}"
            ;;
        pull)
            invoke_compose "拉取生产镜像" "${BASE_ARGS[@]}" pull "${SERVICE[@]}"
            ;;
        config)
            invoke_compose "校验生产 Compose 配置" "${BASE_ARGS[@]}" config
            ;;
        down)
            if [[ "${#SERVICE[@]}" -gt 0 ]]; then
                die "docker compose down 不支持指定单个服务；如需停止单个服务请使用 --action stop --service <name>。"
            fi
            local args=("${BASE_ARGS[@]}" down)
            if [[ "$REMOVE_VOLUMES" == true ]]; then
                write_color "警告: --remove-volumes 会删除生产数据卷，请确认已完成备份。" "Red"
                args+=(-v)
            fi
            invoke_compose "下线生产服务" "${args[@]}"
            ;;
    esac
}

main() {
    parse_args "$@"

    printf '\n'
    write_color "企业级网络设备巡检系统 - 生产环境管理" "Cyan"
    write_color "========================================" "Cyan"

    if [[ "$HELP" == true ]]; then
        show_help
        return
    fi

    SELECTED_ENV_FILE="$(resolve_production_env_file || true)"

    test_production_files
    initialize_docker_compose_command
    test_production_config
    show_startup_summary
    invoke_production_action
}

main "$@"
