#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
DATABASE_DIR="$PROJECT_ROOT/database"
INIT_COMPLETE_FILE="$DATABASE_DIR/database-init-complete.sql"
TEMPLATES_COMPLETE_FILE="$DATABASE_DIR/builtin-templates-complete.sql"

ACTION=""
SERVICE="all"
BACKUP_PATH="backups"
USERNAME="admin"
PASSWORD="admin123"
EMAIL="admin@admin.com"
ROLE="superadmin"
FULL_NAME="系统管理员"
SKIP_MIGRATE=false
INIT_ONLY=false
TEMPLATES_ONLY=false
FORCE=false

color() {
    local code="$1"
    shift
    if [[ -t 1 ]]; then
        printf '\033[%sm%s\033[0m\n' "$code" "$*"
    else
        printf '%s\n' "$*"
    fi
}

info() { color "36" "$*"; }
success() { color "32" "$*"; }
warn() { color "33" "$*"; }
error() { color "31" "$*"; }
muted() { color "90" "$*"; }
section() { color "34" "$*"; }

die() {
    error "❌ $*"
    exit 1
}

show_help() {
    cat <<'EOF'
数据库管理工具（Bash 版）

用法:
  ./scripts/db-manage.sh <action> [options]

Action:
  start        启动 PostgreSQL 与 Redis
  stop         停止数据库服务
  reset        重置数据库服务和数据卷
  backup       备份 PostgreSQL / Redis
  status       查看服务状态
  logs         查看服务日志
  init         执行数据库初始化
  verify       静态验证整合 SQL、文档归档和 Docker 引用
  seed-admin   初始化默认管理员账号与 RBAC

Options:
  -s, --service <postgres|redis|all>     指定服务，默认 all
      --backup-path <path>               备份目录，默认 backups
      --username <value>                 seed-admin 用户名
      --password <value>                 seed-admin 密码
      --email <value>                    seed-admin 邮箱
      --role <value>                     seed-admin 角色
      --full-name <value>                seed-admin 显示名
      --skip-migrate                     seed-admin 跳过迁移
      --init-only                        init 仅执行基础初始化
      --templates-only                   init 仅导入内置模板
      --force                            init/reset 跳过确认提示
  -h, --help                             显示帮助

示例:
  ./scripts/db-manage.sh start
  ./scripts/db-manage.sh init --force
  ./scripts/db-manage.sh init --init-only
  ./scripts/db-manage.sh verify
  ./scripts/db-manage.sh logs --service postgres
  ./scripts/db-manage.sh seed-admin --username admin --password admin123
EOF
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -h|--help|help)
                show_help
                exit 0
                ;;
            -s|--service|-Service)
                [[ $# -ge 2 ]] || die "缺少 --service 参数值"
                SERVICE="$2"
                shift 2
                ;;
            --backup-path|-BackupPath)
                [[ $# -ge 2 ]] || die "缺少 --backup-path 参数值"
                BACKUP_PATH="$2"
                shift 2
                ;;
            --username|-Username)
                [[ $# -ge 2 ]] || die "缺少 --username 参数值"
                USERNAME="$2"
                shift 2
                ;;
            --password|-Password)
                [[ $# -ge 2 ]] || die "缺少 --password 参数值"
                PASSWORD="$2"
                shift 2
                ;;
            --email|-Email)
                [[ $# -ge 2 ]] || die "缺少 --email 参数值"
                EMAIL="$2"
                shift 2
                ;;
            --role|-Role)
                [[ $# -ge 2 ]] || die "缺少 --role 参数值"
                ROLE="$2"
                shift 2
                ;;
            --full-name|-FullName)
                [[ $# -ge 2 ]] || die "缺少 --full-name 参数值"
                FULL_NAME="$2"
                shift 2
                ;;
            --skip-migrate|-SkipMigrate)
                SKIP_MIGRATE=true
                shift
                ;;
            --init-only|-InitOnly)
                INIT_ONLY=true
                shift
                ;;
            --templates-only|-TemplatesOnly)
                TEMPLATES_ONLY=true
                shift
                ;;
            --force|-Force)
                FORCE=true
                shift
                ;;
            start|stop|reset|backup|status|logs|init|verify|seed-admin)
                if [[ -n "$ACTION" ]]; then
                    die "只能指定一个 action，已收到: $ACTION 和 $1"
                fi
                ACTION="$1"
                shift
                ;;
            *)
                die "未知参数: $1"
                ;;
        esac
    done

    [[ -n "$ACTION" ]] || die "缺少 action。使用 --help 查看用法"
    case "$SERVICE" in
        postgres|redis|all) ;;
        *) die "--service 仅支持 postgres、redis、all" ;;
    esac
    if [[ "$INIT_ONLY" == true && "$TEMPLATES_ONLY" == true ]]; then
        die "--init-only 与 --templates-only 不能同时使用"
    fi
}

compose_cmd() {
    if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
        docker compose "$@"
        return
    fi
    if command -v docker-compose >/dev/null 2>&1; then
        docker-compose "$@"
        return
    fi
    die "未找到 docker compose 或 docker-compose"
}

get_compose_file() {
    local file
    for file in "$PROJECT_ROOT/docker-compose.dev.yml" "$PROJECT_ROOT/docker-compose.yml"; do
        if [[ -f "$file" ]]; then
            printf '%s\n' "$file"
            return
        fi
    done
    die "未找到 Docker Compose 配置文件"
}

run_cmd() {
    local description="$1"
    shift
    info "执行: $*"
    if "$@"; then
        success "✅ $description"
    else
        die "$description 失败"
    fi
}

start_database_services() {
    section $'\n🚀 启动数据库服务...'
    local compose_file
    compose_file="$(get_compose_file)"
    local services=()
    [[ "$SERVICE" == "all" ]] || services=("$SERVICE")
    if [[ ${#services[@]} -eq 0 ]]; then
        run_cmd "启动所有数据库服务" compose_cmd -f "$compose_file" up -d
    else
        run_cmd "启动 $SERVICE 服务" compose_cmd -f "$compose_file" up -d "${services[@]}"
    fi
    success "✅ 数据库服务已启动"
    show_service_info
}

stop_database_services() {
    section $'\n🛑 停止数据库服务...'
    local compose_file
    compose_file="$(get_compose_file)"
    local services=()
    [[ "$SERVICE" == "all" ]] || services=("$SERVICE")
    if [[ ${#services[@]} -eq 0 ]]; then
        run_cmd "停止所有数据库服务" compose_cmd -f "$compose_file" down
    else
        run_cmd "停止 $SERVICE 服务" compose_cmd -f "$compose_file" stop "${services[@]}"
    fi
    success "✅ 数据库服务已停止"
}

reset_database_services() {
    section $'\n🔄 重置数据库...'
    warn "⚠️ 警告: 此操作将删除所有数据！"
    if [[ "$FORCE" != true ]]; then
        read -r -p "确认重置数据库? (y/N) " confirmation
        if [[ "$confirmation" != "y" && "$confirmation" != "Y" ]]; then
            warn "操作已取消"
            return
        fi
    fi

    local compose_file
    compose_file="$(get_compose_file)"
    run_cmd "停止服务并删除数据卷" compose_cmd -f "$compose_file" down -v
    run_cmd "重新启动数据库服务" compose_cmd -f "$compose_file" up -d
    warn "⏳ 等待服务启动..."
    sleep 10
    show_service_info
}

container_exists() {
    local name="$1"
    docker ps --format '{{.Names}}' 2>/dev/null | grep -Fxq "$name"
}

backup_database_services() {
    section $'\n💾 备份数据库...'
    mkdir -p "$BACKUP_PATH"
    local timestamp
    timestamp="$(date +%Y%m%d_%H%M%S)"

    if [[ "$SERVICE" == "all" || "$SERVICE" == "postgres" ]]; then
        info "📊 备份 PostgreSQL..."
        local pg_backup_file="$BACKUP_PATH/postgres_backup_${timestamp}.sql"
        local backup_success=false
        local container
        for container in inspect-postgres-dev postgres-dev postgres; do
            if container_exists "$container"; then
                if docker exec "$container" pg_dump -U inspect_dev inspect_system_dev >"$pg_backup_file"; then
                    success "✅ 备份 PostgreSQL 到 $pg_backup_file"
                    backup_success=true
                    break
                fi
            fi
        done
        [[ "$backup_success" == true ]] || warn "⚠️ PostgreSQL 容器未运行或备份失败"
    fi

    if [[ "$SERVICE" == "all" || "$SERVICE" == "redis" ]]; then
        info "🔴 备份 Redis..."
        local redis_backup_file="$BACKUP_PATH/redis_backup_${timestamp}.rdb"
        local backup_success=false
        local container
        for container in inspect-redis-dev redis-dev redis; do
            if container_exists "$container"; then
                if docker exec "$container" redis-cli -a dev_redis_2024 --rdb /tmp/dump.rdb &&
                    docker cp "$container:/tmp/dump.rdb" "$redis_backup_file"; then
                    success "✅ 备份 Redis 到 $redis_backup_file"
                    backup_success=true
                    break
                fi
            fi
        done
        [[ "$backup_success" == true ]] || warn "⚠️ Redis 容器未运行或备份失败"
    fi

    success "✅ 数据库备份完成: $BACKUP_PATH"
}

check_condition() {
    local description="$1"
    local condition="$2"
    local details="${3:-}"

    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    if eval "$condition"; then
        success "[通过] $description"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        [[ -z "$details" ]] || muted "       $details"
    else
        error "[失败] $description"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        [[ -z "$details" ]] || warn "       $details"
    fi
}

count_fixed() {
    local needle="$1"
    local file="$2"
    if [[ ! -f "$file" ]]; then
        printf '0\n'
        return
    fi
    grep -oF "$needle" "$file" 2>/dev/null | wc -l | tr -d '[:space:]'
}

verify_database_consolidation() {
    section $'\n🔍 验证数据库整合状态...'
    info "数据库整合静态验证"
    info "=================================================="

    TOTAL_CHECKS=0
    PASSED_CHECKS=0
    FAILED_CHECKS=0

    local docs_report="$PROJECT_ROOT/docs/datebase/database-sql-consolidation-report.md"
    local old_report="$DATABASE_DIR/COMPLETION_REPORT.md"
    local old_verify_script="$DATABASE_DIR/verify-consolidation.ps1"

    section $'\n[文件结构]'
    check_condition "完整初始化脚本存在" "[[ -f \"\$INIT_COMPLETE_FILE\" ]]" "database/database-init-complete.sql"
    check_condition "完整模板脚本存在" "[[ -f \"\$TEMPLATES_COMPLETE_FILE\" ]]" "database/builtin-templates-complete.sql"
    check_condition "整合报告已归档到 docs/datebase" "[[ -f \"$docs_report\" ]]" "docs/datebase/database-sql-consolidation-report.md"
    check_condition "database 目录不再保留旧完成报告" "[[ ! -f \"$old_report\" ]]" "COMPLETION_REPORT.md 已迁出 database/"
    check_condition "database 目录不再保留旧验证脚本" "[[ ! -f \"$old_verify_script\" ]]" "验证功能已合并到 scripts/db-manage.sh"
    check_condition "旧数据库脚本子目录已移除" "[[ ! -d \"$SCRIPT_DIR/database\" ]]" "统一入口: scripts/db-manage.sh"

    section $'\n[初始化 SQL 内容]'
    check_condition "包含 PostgreSQL 扩展创建" "grep -q 'CREATE EXTENSION IF NOT EXISTS' \"\$INIT_COMPLETE_FILE\"" "uuid-ossp、pg_stat_statements、timescaledb"
    check_condition "包含 TimescaleDB hypertable 配置" "grep -q 'create_hypertable' \"\$INIT_COMPLETE_FILE\"" "时序表初始化"
    check_condition "包含压缩策略" "grep -q 'add_compression_policy' \"\$INIT_COMPLETE_FILE\"" "TimescaleDB 压缩策略"
    check_condition "包含保留策略" "grep -q 'add_retention_policy' \"\$INIT_COMPLETE_FILE\"" "TimescaleDB 数据保留策略"
    check_condition "包含带宽单位迁移" "grep -q '1000000\\.0' \"\$INIT_COMPLETE_FILE\"" "bps 到 Mbps 转换"

    section $'\n[模板 SQL 内容]'
    local template_count
    template_count="$(count_fixed "INSERT INTO inspection_templates" "$TEMPLATES_COMPLETE_FILE")"
    check_condition "包含 18 个内置模板插入语句" "[[ \"$template_count\" == \"18\" ]]" "实际数量: $template_count"

    local vendor vendor_marker vendor_count
    for vendor in Cisco Huawei H3C Juniper Arista Fortinet; do
        vendor_marker="\"vendors\": [\"$vendor\"]"
        vendor_count="$(count_fixed "$vendor_marker" "$TEMPLATES_COMPLETE_FILE")"
        check_condition "包含 ${vendor} 设备模板" "[[ \"$vendor_count\" == \"3\" ]]" "实际数量: $vendor_count"
    done

    section $'\n[脚本与 Docker 引用]'
    check_condition "db-manage.sh 提供 verify 入口" "grep -q 'verify)' \"$SCRIPT_DIR/db-manage.sh\"" "统一入口: scripts/db-manage.sh verify"

    local compose_name compose_file
    for compose_name in docker-compose.dev.yml docker-compose.prod.yml; do
        compose_file="$PROJECT_ROOT/$compose_name"
        check_condition "$compose_name 引用完整初始化脚本" "grep -q 'database/database-init-complete\\.sql' \"$compose_file\"" "$compose_name"
        check_condition "$compose_name 引用内置模板脚本" "grep -q 'database/builtin-templates-complete\\.sql' \"$compose_file\"" "$compose_name"
    done

    section $'\n[验证结果]'
    printf '总检查项: %s\n' "$TOTAL_CHECKS"
    success "通过检查: $PASSED_CHECKS"
    if [[ "$FAILED_CHECKS" -eq 0 ]]; then
        success "失败检查: 0"
        success $'\n[成功] 数据库整合静态验证通过'
        return
    fi

    error "失败检查: $FAILED_CHECKS"
    die "数据库整合静态验证未通过"
}

load_env_file() {
    local env_file="$PROJECT_ROOT/.env"
    if [[ ! -f "$env_file" ]]; then
        env_file="$PROJECT_ROOT/.env.development"
    fi
    [[ -f "$env_file" ]] || return 0

    info "[信息] 读取环境文件: $env_file"
    while IFS= read -r line || [[ -n "$line" ]]; do
        line="${line%$'\r'}"
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ "$line" == *=* ]] || continue
        case "$line" in
            DB_HOST=*) DB_HOST="${line#DB_HOST=}" ;;
            DB_PORT=*) DB_PORT="${line#DB_PORT=}" ;;
            DB_NAME=*) DB_NAME="${line#DB_NAME=}" ;;
            DB_USER=*) DB_USER="${line#DB_USER=}" ;;
            DB_PASSWORD=*) DB_PASSWORD="${line#DB_PASSWORD=}" ;;
        esac
    done <"$env_file"
}

get_database_connection() {
    DOCKER_CONTAINER="inspect-postgres-dev"
    USE_DOCKER=false

    if ! command -v psql >/dev/null 2>&1; then
        info "[信息] 未检测到本地 psql 命令，尝试使用 Docker..."
        command -v docker >/dev/null 2>&1 || die "未检测到 psql 或 docker 命令，请安装 PostgreSQL 客户端或 Docker"
        local container_status
        container_status="$(docker ps --filter "name=$DOCKER_CONTAINER" --format "{{.Names}}" 2>/dev/null || true)"
        [[ -n "$container_status" ]] || die "Docker 容器 '$DOCKER_CONTAINER' 未运行，请先启动数据库容器"
        info "[信息] 将使用 Docker 容器执行 SQL 命令"
        USE_DOCKER=true
    fi

    DB_HOST="localhost"
    DB_PORT="15500"
    DB_NAME="inspect_system_dev"
    DB_USER="inspect_dev"
    DB_PASSWORD="dev_password_2024"

    if [[ "$USE_DOCKER" == true ]]; then
        DB_HOST="localhost"
        DB_PORT="5432"
    fi

    load_env_file
}

invoke_sql() {
    local command="${1:-}"
    local file="${2:-}"

    if [[ "$USE_DOCKER" == true ]]; then
        if [[ -n "$file" ]]; then
            docker exec -i "$DOCKER_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" <"$file"
            return
        fi
        docker exec -i "$DOCKER_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "$command"
        return
    fi

    if [[ -n "$file" ]]; then
        PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$file"
        return
    fi
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "$command"
}

initialize_database() {
    section $'\n🔧 初始化数据库...'
    [[ -f "$INIT_COMPLETE_FILE" ]] || die "找不到完整初始化文件: $INIT_COMPLETE_FILE"
    [[ -f "$TEMPLATES_COMPLETE_FILE" ]] || die "找不到完整模板文件: $TEMPLATES_COMPLETE_FILE"

    info "📋 执行数据库初始化..."
    muted "  - 基础配置（用户、权限、扩展）"
    muted "  - TimescaleDB 时序数据库配置"
    muted "  - 内置巡检模板（18个厂商模板）"
    muted "  - 测试数据种子"

    get_database_connection

    info "数据库连接信息:"
    if [[ "$USE_DOCKER" == true ]]; then
        muted "  连接方式: Docker 容器 ($DOCKER_CONTAINER)"
    else
        muted "  连接方式: 本地 psql"
        muted "  主机: $DB_HOST"
        muted "  端口: $DB_PORT"
    fi
    muted "  数据库: $DB_NAME"
    muted "  用户: $DB_USER"

    if [[ "$FORCE" != true ]]; then
        read -r -p "确认执行数据库初始化？(y/N) " confirmation
        if [[ "$confirmation" != "y" && "$confirmation" != "Y" ]]; then
            warn "操作已取消"
            return
        fi
    fi

    info "[信息] 测试数据库连接..."
    invoke_sql "SELECT 1;" >/dev/null || die "数据库连接失败"
    success "[成功] 数据库连接正常"

    if [[ "$TEMPLATES_ONLY" != true ]]; then
        info "[信息] 执行基础数据库初始化..."
        invoke_sql "" "$INIT_COMPLETE_FILE" >/dev/null || die "基础初始化失败"
        success "[成功] 基础数据库初始化完成"
    fi

    if [[ "$INIT_ONLY" != true ]]; then
        info "[信息] 执行内置模板初始化..."
        invoke_sql "" "$TEMPLATES_COMPLETE_FILE" >/dev/null || die "模板初始化失败"
        success "[成功] 内置模板初始化完成"
    fi

    info "[信息] 验证初始化结果..."
    invoke_sql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" || true
    if [[ "$INIT_ONLY" != true ]]; then
        invoke_sql "SELECT COUNT(*) FROM inspection_templates WHERE is_default = true;" || true
    fi

    success "✅ 数据库初始化完成"
}

seed_admin_user() {
    section $'\n👤 初始化默认管理员账号与权限...'
    command -v go >/dev/null 2>&1 || die "未检测到 Go 环境，请先安装 Go"

    local backend_path="$PROJECT_ROOT/backend-go"
    [[ -d "$backend_path" ]] || die "未找到后端目录: $backend_path"

    local env_file="$PROJECT_ROOT/.env"
    if [[ ! -f "$env_file" ]]; then
        env_file="$PROJECT_ROOT/.env.development"
    fi
    if [[ -f "$env_file" ]]; then
        export ENV_FILE="$env_file"
        muted "使用环境文件: $env_file"
    else
        warn "⚠️ 未找到 .env/.env.development，将使用后端默认配置（可能连接不到数据库）"
    fi

    local go_cache_root="$PROJECT_ROOT/.gocache"
    export GOCACHE="$go_cache_root/build"
    export GOTMPDIR="$go_cache_root/tmp"
    mkdir -p "$GOCACHE" "$GOTMPDIR"

    local args=(
        run
        ./cmd/seed
        --username "$USERNAME"
        --password "$PASSWORD"
        --email "$EMAIL"
        --role "$ROLE"
        --full-name "$FULL_NAME"
    )
    if [[ "$SKIP_MIGRATE" == true ]]; then
        args+=(--skip-migrate)
    fi

    muted "执行: go ${args[*]}"
    (cd "$backend_path" && go "${args[@]}") || die "初始化默认管理员失败"
    success "✅ 初始化完成，可使用 $USERNAME / $PASSWORD 登录"
}

show_service_status() {
    section $'\n📊 数据库服务状态:'
    local compose_file
    compose_file="$(get_compose_file)"
    compose_cmd -f "$compose_file" ps

    section $'\n🏥 容器健康状态:'
    local containers
    containers="$(docker ps --format 'table {{.Names}}\t{{.Status}}' 2>/dev/null | grep -E '(postgres|redis)' || true)"
    if [[ -n "$containers" ]]; then
        printf '%s\n' "$containers"
    else
        warn "  没有运行中的数据库容器"
    fi
}

show_service_logs() {
    section $'\n📋 数据库服务日志:'
    local compose_file
    compose_file="$(get_compose_file)"
    local services=()
    [[ "$SERVICE" == "all" ]] || services=("$SERVICE")
    if [[ ${#services[@]} -eq 0 ]]; then
        compose_cmd -f "$compose_file" logs --tail=50
    else
        compose_cmd -f "$compose_file" logs --tail=50 "${services[@]}"
    fi
}

get_host_port() {
    local container="$1"
    local container_port="$2"
    local env_name="$3"
    local default_port="$4"
    local mapping
    mapping="$(docker port "$container" "${container_port}/tcp" 2>/dev/null | head -n 1 || true)"
    if [[ "$mapping" =~ :([0-9]+)$ ]]; then
        printf '%s\n' "${BASH_REMATCH[1]}"
        return
    fi
    if [[ -n "${!env_name:-}" ]]; then
        printf '%s\n' "${!env_name}"
        return
    fi
    printf '%s\n' "$default_port"
}

show_service_info() {
    local postgres_host_port
    local redis_host_port
    postgres_host_port="$(get_host_port inspect-postgres-dev 5432 POSTGRES_HOST_PORT 15500)"
    redis_host_port="$(get_host_port inspect-redis-dev 6379 REDIS_HOST_PORT 26380)"

    section $'\n📊 服务访问地址:'
    printf '  🗄️ PostgreSQL: localhost:%s\n' "$postgres_host_port"
    muted "    - 用户名: inspect_dev"
    muted "    - 密码: dev_password_2024"
    muted "    - 数据库: inspect_system_dev"
    printf '  🔴 Redis: localhost:%s\n' "$redis_host_port"
    muted "    - 密码: dev_redis_2024"
    printf '  🔧 pgAdmin: http://localhost:5050\n'
    printf '  🔧 Redis Commander: http://localhost:8081\n'
}

main() {
    parse_args "$@"
    success "🗄️ 数据库管理工具"
    info "操作: $ACTION, 服务: $SERVICE"
    info "=================================================="

    case "$ACTION" in
        start) start_database_services ;;
        stop) stop_database_services ;;
        reset) reset_database_services ;;
        backup) backup_database_services ;;
        status) show_service_status ;;
        logs) show_service_logs ;;
        init) initialize_database ;;
        verify) verify_database_consolidation ;;
        seed-admin) seed_admin_user ;;
        *) die "未知 action: $ACTION" ;;
    esac

    success $'\n✅ 操作完成'
}

main "$@"
