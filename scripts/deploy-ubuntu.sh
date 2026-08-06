#!/usr/bin/env bash
# 企业级网络设备巡检系统 - Ubuntu 生产环境一键部署脚本（原生部署，无 Docker）
#
# 适用: Ubuntu Server LTS，纳管设备 <= 300 台
# 用法: sudo ./scripts/deploy-ubuntu.sh --domain inspect.example.com
# 文档: docs/deployment/ubuntu-production.md

set -euo pipefail

# ==========================================
# 全局常量
# ==========================================
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

APP_USER="inspect"
APP_ROOT="/opt/inspect"
APP_SRC="$APP_ROOT/app"
APP_BIN="$APP_ROOT/bin"
APP_CONF="$APP_ROOT/config"
APP_LOGS="$APP_ROOT/logs"
ENV_FILE="$APP_CONF/.env"
CRED_FILE="$APP_CONF/credentials.txt"

PG_VERSION=16
PG_CONF_DIR="/etc/postgresql/${PG_VERSION}/main"
GO_VERSION="1.23.5"
NODE_MAJOR="20"
PNPM_VERSION="9.15.0"
PROM_VERSION="2.53.2"

REPO_URL="https://github.com/Izumi0527/inspect.git"

BACKEND_PORT=9000
FRONTEND_PORT=13000
GRAFANA_PORT=3001
PROM_PORT=9090

ALL_STEPS=(system postgres redis backend frontend nginx monitoring verify)

# ==========================================
# 可变参数
# ==========================================
DOMAIN=""
STEPS=""
FROM_STEP=""
SKIP_MONITORING=false
SKIP_FIREWALL=false
PG_DATA_DISK=""
BUILD_MEM_MB=4096
DRY_RUN=false
ASSUME_YES=false
HELP=false

# ==========================================
# 输出helper
# ==========================================
color() {
    local code="$1"
    shift
    if [[ -t 1 ]]; then
        printf '\033[%sm%s\033[0m\n' "$code" "$*"
    else
        printf '%s\n' "$*"
    fi
}

info()    { color "36" "$*"; }
success() { color "32" "✅ $*"; }
warn()    { color "33" "⚠️  $*"; }
error()   { color "31" "❌ $*"; }
dim()     { color "90" "$*"; }

die() {
    error "$*"
    exit 1
}

step_banner() {
    echo
    color "35" "═══════════════════════════════════════════════════════════"
    color "35" "  $*"
    color "35" "═══════════════════════════════════════════════════════════"
}

# 执行命令；--dry-run 时仅打印
run() {
    if [[ "$DRY_RUN" == true ]]; then
        dim "[dry-run] $*"
        return 0
    fi
    "$@"
}

# 执行 shell 片段（含管道/重定向）
run_sh() {
    if [[ "$DRY_RUN" == true ]]; then
        dim "[dry-run] $*"
        return 0
    fi
    bash -c "$*"
}

confirm() {
    [[ "$ASSUME_YES" == true ]] && return 0
    [[ "$DRY_RUN" == true ]] && return 0
    local prompt="$1"
    read -r -p "$prompt [y/N] " reply
    [[ "$reply" =~ ^[Yy]$ ]]
}

# ==========================================
# 幂等写入helper
# ==========================================
# 在文件中写入/更新一个受管配置块，可重复执行
# 用法: write_managed_block <文件> <标记> <内容>
write_managed_block() {
    local file="$1" marker="$2" content="$3"
    local begin="# ===== BEGIN ${marker} ====="
    local end="# ===== END ${marker} ====="

    if [[ "$DRY_RUN" == true ]]; then
        dim "[dry-run] 写入受管配置块 ${marker} -> ${file}"
        return 0
    fi

    touch "$file"
    # 移除旧块（若存在）
    if grep -qF "$begin" "$file"; then
        sed -i "/^${begin}$/,/^${end}$/d" "$file"
    fi
    {
        echo "$begin"
        echo "$content"
        echo "$end"
    } >>"$file"
}

# 生成指定长度的随机密码（仅字母数字，可安全用于 URL / 配置文件）
# 用法: gen_secret [长度=32]
# 注意两点：
#   1. 不使用 `| head -c N` 截断——head 提前退出会向上游发 SIGPIPE，
#      在 set -o pipefail 下被捕获为 141 导致间歇性失败
#   2. base64 输出中的 +/= 被剔除后长度会缩水，必须循环补足，
#      否则密码会短于预期、强度被削弱
gen_secret() {
    local want="${1:-32}"
    local raw=""
    while [[ ${#raw} -lt $want ]]; do
        raw+="$(openssl rand -base64 48 | tr -d '\n=+/')"
    done
    printf '%s' "${raw:0:$want}"
}

# 追加一条凭据；确保文件存在且权限为 600（内含明文密码）
record_credential() {
    [[ "$DRY_RUN" == true ]] && return 0
    if [[ ! -f "$CRED_FILE" ]]; then
        mkdir -p "$(dirname "$CRED_FILE")"
        touch "$CRED_FILE"
    fi
    chmod 600 "$CRED_FILE"
    chown "$APP_USER:$APP_USER" "$CRED_FILE" 2>/dev/null || true
    echo "$1" >>"$CRED_FILE"
}

# ==========================================
# 参数解析
# ==========================================
show_help() {
    cat <<'EOF'
企业级网络设备巡检系统 - Ubuntu 原生部署脚本

用法:
  sudo ./scripts/deploy-ubuntu.sh --domain <域名> [选项]

必填:
  --domain <域名>          对外访问域名，如 inspect.example.com

选项:
  --steps <a,b,c>          仅执行指定步骤（逗号分隔）
  --from <step>            从指定步骤开始执行到结束
  --pg-data-disk <设备>    将 PostgreSQL 数据目录挂载到独立磁盘，如 /dev/sdb
                           ⚠️ 会格式化该磁盘，执行前必须确认设备正确
  --skip-monitoring        跳过 Prometheus + Grafana（节省约 2.4 GB 内存）
  --skip-firewall          跳过 ufw 防火墙配置
  --build-mem <MB>         前端构建内存上限，默认 4096
  --yes, -y                跳过所有交互确认
  --dry-run                仅打印将要执行的操作，不做任何改动
  --help, -h               显示帮助

可用步骤:
  system      系统基础配置（工具、时区、用户、内核参数、句柄、防火墙）
  postgres    PostgreSQL 16 + TimescaleDB
  redis       Redis 7
  backend     Go 环境 + 后端构建 + systemd
  frontend    Node 20 + 前端构建 + systemd
  nginx       Nginx 反向代理 + 自签证书
  monitoring  Prometheus + Grafana + node_exporter（可选）
  verify      部署后验证

示例:
  # 完整部署
  sudo ./scripts/deploy-ubuntu.sh --domain inspect.example.com -y

  # 预演，不做任何改动
  sudo ./scripts/deploy-ubuntu.sh --domain inspect.example.com --dry-run

  # 仅重新构建并重启应用
  sudo ./scripts/deploy-ubuntu.sh --domain inspect.example.com --steps backend,frontend

  # 独立数据盘 + 不装监控
  sudo ./scripts/deploy-ubuntu.sh --domain inspect.example.com \
       --pg-data-disk /dev/sdb --skip-monitoring

说明:
  - 脚本幂等，可重复执行
  - 生成的所有密码写入 /opt/inspect/config/credentials.txt (权限 600)
  - 详细部署说明见 docs/deployment/ubuntu-production.md
EOF
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --domain)          DOMAIN="${2:-}"; shift 2 ;;
            --steps)           STEPS="${2:-}"; shift 2 ;;
            --from)            FROM_STEP="${2:-}"; shift 2 ;;
            --pg-data-disk)    PG_DATA_DISK="${2:-}"; shift 2 ;;
            --build-mem)       BUILD_MEM_MB="${2:-}"; shift 2 ;;
            --skip-monitoring) SKIP_MONITORING=true; shift ;;
            --skip-firewall)   SKIP_FIREWALL=true; shift ;;
            --dry-run)         DRY_RUN=true; shift ;;
            --yes|-y)          ASSUME_YES=true; shift ;;
            --help|-h)         HELP=true; shift ;;
            *) die "未知参数: $1（使用 --help 查看用法）" ;;
        esac
    done
}

# 计算实际要执行的步骤列表
resolve_steps() {
    local result=()
    if [[ -n "$STEPS" ]]; then
        IFS=',' read -r -a result <<<"$STEPS"
        for s in "${result[@]}"; do
            [[ " ${ALL_STEPS[*]} " == *" $s "* ]] || die "无效步骤: $s"
        done
    elif [[ -n "$FROM_STEP" ]]; then
        local started=false
        for s in "${ALL_STEPS[@]}"; do
            [[ "$s" == "$FROM_STEP" ]] && started=true
            [[ "$started" == true ]] && result+=("$s")
        done
        [[ ${#result[@]} -gt 0 ]] || die "无效步骤: $FROM_STEP"
    else
        result=("${ALL_STEPS[@]}")
    fi
    printf '%s\n' "${result[@]}"
}

should_run() {
    local target="$1"
    printf '%s\n' "${SELECTED_STEPS[@]}" | grep -qx "$target"
}

# ==========================================
# 前置检查
# ==========================================
preflight() {
    step_banner "前置检查"

    [[ $EUID -eq 0 ]] || die "需要 root 权限，请使用 sudo 执行"
    [[ -n "$DOMAIN" ]] || die "缺少 --domain 参数（使用 --help 查看用法）"

    # 发行版
    if [[ -f /etc/os-release ]]; then
        # shellcheck disable=SC1091
        . /etc/os-release
        [[ "${ID:-}" == "ubuntu" ]] || warn "当前系统为 ${PRETTY_NAME:-未知}，脚本按 Ubuntu 设计，可能需要调整"
        info "操作系统    : ${PRETTY_NAME:-未知} ($(lsb_release -cs 2>/dev/null || echo unknown))"
    else
        die "无法识别操作系统"
    fi

    # 架构
    local arch
    arch="$(dpkg --print-architecture)"
    [[ "$arch" == "amd64" ]] || warn "当前架构为 $arch，Go/Prometheus 下载地址按 amd64 硬编码，需自行调整"

    # 资源
    local mem_gb cpu_cores disk_gb
    mem_gb=$(awk '/MemTotal/ {printf "%.1f", $2/1024/1024}' /proc/meminfo)
    cpu_cores=$(nproc)
    disk_gb=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')

    info "CPU 核数    : ${cpu_cores}"
    info "内存        : ${mem_gb} GB"
    info "根分区可用  : ${disk_gb} GB"
    info "目标域名    : ${DOMAIN}"
    info "监控组件    : $([[ "$SKIP_MONITORING" == true ]] && echo '跳过' || echo '安装')"

    local required_mem=16
    [[ "$SKIP_MONITORING" == true ]] && required_mem=8

    awk -v m="$mem_gb" -v r="$required_mem" 'BEGIN{exit !(m+0 < r)}' \
        && warn "内存 ${mem_gb} GB 低于推荐的 ${required_mem} GB，300 设备场景可能不足"
    [[ "$cpu_cores" -lt 4 ]] && warn "CPU ${cpu_cores} 核低于推荐的 8 核（最低 4 核）"
    [[ "$disk_gb" -lt 60 ]] && warn "根分区可用 ${disk_gb} GB 偏小，建议至少 100 GB"

    # 网络
    if ! curl -fsS --max-time 8 -o /dev/null https://deb.debian.org 2>/dev/null \
        && ! curl -fsS --max-time 8 -o /dev/null http://archive.ubuntu.com 2>/dev/null; then
        warn "外网连通性检测失败，若使用内网镜像源可忽略"
    fi

    if [[ "$DRY_RUN" == true ]]; then
        warn "DRY-RUN 模式：只打印操作，不做任何实际改动"
    fi

    echo
    confirm "确认开始部署？" || die "用户取消"
}

# ==========================================
# 步骤 1: 系统基础配置
# ==========================================
step_system() {
    step_banner "步骤 1/8  系统基础配置"

    info "→ 更新软件包索引并安装基础工具"
    run_sh "DEBIAN_FRONTEND=noninteractive apt-get update -qq"
    run_sh "DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
        curl wget gnupg lsb-release ca-certificates apt-transport-https \
        software-properties-common build-essential git jq unzip \
        htop net-tools chrony openssl acl"

    info "→ 配置时区与时间同步"
    run timedatectl set-timezone Asia/Shanghai
    run systemctl enable --now chrony

    info "→ 创建运行账户与目录"
    if ! id "$APP_USER" &>/dev/null; then
        run useradd -r -m -d "$APP_ROOT" -s /bin/bash "$APP_USER"
    else
        dim "  用户 $APP_USER 已存在，跳过"
    fi
    run mkdir -p "$APP_SRC" "$APP_BIN" "$APP_CONF" \
        "$APP_LOGS/backend" "$APP_LOGS/nginx" \
        "$APP_ROOT/data" "$APP_ROOT/backups/postgres"
    run chown -R "$APP_USER:$APP_USER" "$APP_ROOT"
    run chmod 750 "$APP_CONF"

    info "→ 写入内核参数 /etc/sysctl.d/99-inspect.conf"
    write_managed_block /etc/sysctl.d/99-inspect.conf "INSPECT" "$(cat <<'SYSCTL'
# 内存与 PostgreSQL：降低换出倾向，平滑 checkpoint IO
vm.swappiness = 10
vm.dirty_background_ratio = 5
vm.dirty_ratio = 10
vm.overcommit_memory = 2
vm.overcommit_ratio = 90

# 网络：巡检产生大量并发短连接（SSH/SNMP）
net.core.somaxconn = 4096
net.core.netdev_max_backlog = 8192
net.ipv4.tcp_max_syn_backlog = 8192
net.ipv4.ip_local_port_range = 10000 65000
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_keepalive_time = 600

# UDP 缓冲区：Syslog(5514) / SNMP Trap(162) 突发上报防丢包
net.core.rmem_max = 16777216
net.core.rmem_default = 1048576
net.ipv4.udp_mem = 262144 524288 1048576

# 文件句柄
fs.file-max = 2097152
SYSCTL
)"
    run sysctl --system >/dev/null 2>&1 || true

    info "→ 写入文件句柄限制 /etc/security/limits.d/99-inspect.conf"
    write_managed_block /etc/security/limits.d/99-inspect.conf "INSPECT" "$(cat <<LIMITS
${APP_USER}  soft  nofile  65536
${APP_USER}  hard  nofile  65536
${APP_USER}  soft  nproc   32768
${APP_USER}  hard  nproc   32768
postgres soft  nofile  65536
postgres hard  nofile  65536
LIMITS
)"

    if [[ "$SKIP_FIREWALL" == true ]]; then
        dim "  已指定 --skip-firewall，跳过防火墙配置"
    else
        info "→ 配置 ufw 防火墙"
        run_sh "DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ufw"
        run ufw --force default deny incoming
        run ufw --force default allow outgoing
        run ufw allow 22/tcp comment 'SSH'
        run ufw allow 80/tcp comment 'HTTP'
        run ufw allow 443/tcp comment 'HTTPS'
        run ufw allow 5514/tcp comment 'Syslog TCP'
        run ufw allow 5514/udp comment 'Syslog UDP'
        run ufw allow 162/udp comment 'SNMP Trap'
        run_sh "ufw --force enable"
    fi

    # 凭据文件初始化
    if [[ "$DRY_RUN" != true && ! -f "$CRED_FILE" ]]; then
        {
            echo "# 企业级网络设备巡检系统 - 生成的凭据"
            echo "# 生成时间: $(date '+%Y-%m-%d %H:%M:%S')"
            echo "# ⚠️ 妥善保管，此文件权限为 600"
            echo
        } >"$CRED_FILE"
        chmod 600 "$CRED_FILE"
        chown "$APP_USER:$APP_USER" "$CRED_FILE"
    fi

    success "系统基础配置完成"
}

# ==========================================
# 数据盘挂载（可选）
# ==========================================
mount_pg_disk() {
    [[ -z "$PG_DATA_DISK" ]] && return 0

    info "→ 准备 PostgreSQL 独立数据盘 $PG_DATA_DISK"
    [[ -b "$PG_DATA_DISK" ]] || die "$PG_DATA_DISK 不是有效块设备"

    if findmnt -n /var/lib/postgresql &>/dev/null; then
        dim "  /var/lib/postgresql 已挂载，跳过"
        return 0
    fi

    warn "即将格式化 $PG_DATA_DISK，该磁盘上的所有数据将被清除！"
    confirm "确认格式化 $PG_DATA_DISK ？" || die "用户取消数据盘操作"

    run mkfs.ext4 -F -L pgdata "$PG_DATA_DISK"
    run mkdir -p /var/lib/postgresql
    if ! grep -q 'LABEL=pgdata' /etc/fstab; then
        # noatime 减少数据库文件的无谓元数据写入
        run_sh "echo 'LABEL=pgdata /var/lib/postgresql ext4 defaults,noatime 0 2' >> /etc/fstab"
    fi
    run mount -a
    success "数据盘已挂载到 /var/lib/postgresql"
}

# ==========================================
# 步骤 2: PostgreSQL 16 + TimescaleDB
# ==========================================
step_postgres() {
    step_banner "步骤 2/8  PostgreSQL ${PG_VERSION} + TimescaleDB"

    mount_pg_disk

    info "→ 添加 PGDG 官方仓库"
    run_sh "DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql-common"
    run_sh "/usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y"

    info "→ 添加 TimescaleDB 仓库"
    local codename
    codename="$(lsb_release -cs)"
    run_sh "echo 'deb https://packagecloud.io/timescale/timescaledb/ubuntu/ ${codename} main' \
        > /etc/apt/sources.list.d/timescaledb.list"
    run_sh "wget --quiet -O - https://packagecloud.io/timescale/timescaledb/gpgkey \
        | gpg --dearmor -o /etc/apt/trusted.gpg.d/timescale_timescaledb.gpg"
    run_sh "DEBIAN_FRONTEND=noninteractive apt-get update -qq"

    # 关键校验：新发行版代号的 TimescaleDB 仓库可能尚未发布，需回退
    if [[ "$DRY_RUN" != true ]]; then
        if ! apt-cache policy "timescaledb-2-postgresql-${PG_VERSION}" 2>/dev/null | grep -q 'Candidate: [0-9]'; then
            warn "TimescaleDB 仓库无 ${codename} 对应包，回退到 noble (24.04) 仓库（二进制兼容）"
            echo "deb https://packagecloud.io/timescale/timescaledb/ubuntu/ noble main" \
                >/etc/apt/sources.list.d/timescaledb.list
            DEBIAN_FRONTEND=noninteractive apt-get update -qq
            apt-cache policy "timescaledb-2-postgresql-${PG_VERSION}" | grep -q 'Candidate: [0-9]' \
                || die "TimescaleDB 包不可用，请检查网络或手动指定仓库代号"
        fi
    fi

    info "→ 安装 PostgreSQL 与 TimescaleDB"
    run_sh "DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
        postgresql-${PG_VERSION} postgresql-client-${PG_VERSION} \
        timescaledb-2-postgresql-${PG_VERSION} timescaledb-tools"

    info "→ 运行 timescaledb-tune 自动调优"
    run_sh "timescaledb-tune --pg-config=/usr/lib/postgresql/${PG_VERSION}/bin/pg_config --quiet --yes" || \
        warn "timescaledb-tune 执行失败，将依赖下方手动参数"

    info "→ 写入项目专用调优参数"
    run mkdir -p "${PG_CONF_DIR}/conf.d"
    # 确保主配置加载 conf.d（PGDG 包默认已有，此处兜底）
    if [[ "$DRY_RUN" != true ]]; then
        grep -q "include_dir = 'conf.d'" "${PG_CONF_DIR}/postgresql.conf" || \
            echo "include_dir = 'conf.d'" >>"${PG_CONF_DIR}/postgresql.conf"
    fi

    # 按物理内存计算：shared_buffers 25%，effective_cache_size 60%
    local mem_mb shared_mb cache_mb maint_mb
    if [[ "$DRY_RUN" == true ]]; then
        mem_mb=16384
    else
        mem_mb=$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo)
    fi
    shared_mb=$((mem_mb / 4))
    cache_mb=$((mem_mb * 6 / 10))
    maint_mb=$((mem_mb / 16))
    [[ $maint_mb -gt 2048 ]] && maint_mb=2048

    write_managed_block "${PG_CONF_DIR}/conf.d/99-inspect.conf" "INSPECT" "$(cat <<PGCONF
# 由 scripts/deploy-ubuntu.sh 生成，请勿手工编辑本块

# 扩展预加载：pg_stat_statements 必须预加载，否则 CREATE EXTENSION 后不采集数据
shared_preload_libraries = 'timescaledb,pg_stat_statements'
pg_stat_statements.max = 10000
pg_stat_statements.track = all

# 连接：后端池 20 + overflow 40 = 最多 60
listen_addresses = 'localhost'
max_connections = 150

# 内存（按本机 ${mem_mb} MB 物理内存计算）
shared_buffers = ${shared_mb}MB
effective_cache_size = ${cache_mb}MB
work_mem = 16MB
maintenance_work_mem = ${maint_mb}MB

# WAL
wal_level = replica
max_wal_size = 4GB
min_wal_size = 1GB
checkpoint_completion_target = 0.9

# SSD
random_page_cost = 1.1
effective_io_concurrency = 200

# TimescaleDB
timescaledb.max_background_workers = 8
timescaledb.telemetry_level = 'off'

# 并行：必须 >= timescaledb 后台 worker + 并行 worker，否则压缩/保留策略静默不执行
max_worker_processes = 19
max_parallel_workers = 8
max_parallel_workers_per_gather = 4

# 日志
logging_collector = on
log_directory = 'log'
log_filename = 'postgresql-%Y-%m-%d.log'
log_rotation_age = 1d
log_min_duration_statement = 1000
log_min_messages = warning
PGCONF
)"

    info "→ 重启 PostgreSQL"
    run systemctl enable postgresql
    run systemctl restart postgresql

    if [[ "$DRY_RUN" != true ]]; then
        sleep 3
        pg_isready -q || die "PostgreSQL 启动失败，请检查 journalctl -u postgresql"
    fi

    info "→ 创建数据库与用户"
    local db_pass
    if [[ "$DRY_RUN" == true ]]; then
        db_pass="<generated>"
    elif grep -q '^POSTGRES_PASSWORD=' "$CRED_FILE" 2>/dev/null; then
        db_pass="$(grep '^POSTGRES_PASSWORD=' "$CRED_FILE" | tail -1 | cut -d= -f2-)"
        dim "  复用已生成的数据库密码"
    else
        db_pass="$(gen_secret 32)"
        record_credential "POSTGRES_PASSWORD=${db_pass}"
    fi

    if [[ "$DRY_RUN" != true ]]; then
        sudo -u postgres psql -v ON_ERROR_STOP=0 <<SQL >/dev/null 2>&1 || true
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='inspect_user') THEN
    CREATE ROLE inspect_user LOGIN PASSWORD '${db_pass}';
  ELSE
    ALTER ROLE inspect_user WITH PASSWORD '${db_pass}';
  END IF;
END \$\$;
SQL
        if ! sudo -u postgres psql -lqt | cut -d\| -f1 | grep -qw inspect_system; then
            sudo -u postgres createdb -O inspect_user -E UTF8 \
                --lc-collate=C --lc-ctype=C -T template0 inspect_system
        fi
        sudo -u postgres psql -d inspect_system -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "timescaledb";
GRANT ALL ON SCHEMA public TO inspect_user;
SQL
        local ts_ver
        ts_ver=$(sudo -u postgres psql -d inspect_system -tAc \
            "SELECT extversion FROM pg_extension WHERE extname='timescaledb';")
        info "  TimescaleDB 版本: ${ts_ver}"
    fi

    success "PostgreSQL + TimescaleDB 就绪"
}

# ==========================================
# 步骤 3: Redis
# ==========================================
step_redis() {
    step_banner "步骤 3/8  Redis 7"

    info "→ 安装 Redis"
    run_sh "DEBIAN_FRONTEND=noninteractive apt-get install -y -qq redis-server"

    local redis_pass
    if [[ "$DRY_RUN" == true ]]; then
        redis_pass="<generated>"
    elif grep -q '^REDIS_PASSWORD=' "$CRED_FILE" 2>/dev/null; then
        redis_pass="$(grep '^REDIS_PASSWORD=' "$CRED_FILE" | tail -1 | cut -d= -f2-)"
        dim "  复用已生成的 Redis 密码"
    else
        redis_pass="$(gen_secret 32)"
        record_credential "REDIS_PASSWORD=${redis_pass}"
    fi

    info "→ 写入 Redis 配置"
    # Redis 后加载的配置覆盖前面的，追加受管块即可
    write_managed_block /etc/redis/redis.conf "INSPECT" "$(cat <<REDISCONF
bind 127.0.0.1 -::1
port 6379
requirepass ${redis_pass}
# 与原 docker-compose 一致：仅作缓存/会话，不会成为内存增长点
maxmemory 512mb
maxmemory-policy allkeys-lru
appendonly yes
appendfsync everysec
supervised systemd
REDISCONF
)"
    run chown redis:redis /etc/redis/redis.conf
    run chmod 640 /etc/redis/redis.conf

    run systemctl enable redis-server
    run systemctl restart redis-server

    if [[ "$DRY_RUN" != true ]]; then
        sleep 2
        redis-cli -a "$redis_pass" --no-auth-warning ping 2>/dev/null | grep -q PONG \
            || die "Redis 启动失败，请检查 journalctl -u redis-server"
    fi

    success "Redis 就绪"
}

# ==========================================
# 源码准备（backend/frontend 共用）
# ==========================================
ensure_source() {
    if [[ -d "$APP_SRC/.git" ]]; then
        dim "  源码已存在，执行 git pull"
        run_sh "sudo -u ${APP_USER} git -C ${APP_SRC} pull --ff-only" || \
            warn "git pull 失败，继续使用当前工作副本"
    elif [[ -f "$PROJECT_ROOT/backend-go/go.mod" && "$PROJECT_ROOT" != "$APP_SRC" ]]; then
        info "  从本地仓库 $PROJECT_ROOT 复制源码"
        run_sh "cp -a '${PROJECT_ROOT}/.' '${APP_SRC}/'"
        run chown -R "$APP_USER:$APP_USER" "$APP_SRC"
    else
        info "  克隆源码仓库"
        run_sh "sudo -u ${APP_USER} git clone ${REPO_URL} ${APP_SRC}"
    fi
}

# ==========================================
# 步骤 4: Go 后端
# ==========================================
step_backend() {
    step_banner "步骤 4/8  Go 后端"

    info "→ 安装 Go ${GO_VERSION}"
    if [[ -x /usr/local/go/bin/go ]] && /usr/local/go/bin/go version 2>/dev/null | grep -q "go${GO_VERSION}"; then
        dim "  Go ${GO_VERSION} 已安装，跳过"
    else
        run_sh "wget -q -O /tmp/go.tar.gz https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz"
        run_sh "rm -rf /usr/local/go && tar -C /usr/local -xzf /tmp/go.tar.gz && rm -f /tmp/go.tar.gz"
        run_sh "echo 'export PATH=\$PATH:/usr/local/go/bin' > /etc/profile.d/go.sh"
    fi

    info "→ 准备源码"
    ensure_source

    info "→ 生成应用配置 ${ENV_FILE}"
    local db_pass redis_pass secret_key jwt_key
    if [[ "$DRY_RUN" == true ]]; then
        db_pass="<db>"; redis_pass="<redis>"; secret_key="<secret>"; jwt_key="<jwt>"
    else
        db_pass="$(grep '^POSTGRES_PASSWORD=' "$CRED_FILE" | tail -1 | cut -d= -f2-)"
        redis_pass="$(grep '^REDIS_PASSWORD=' "$CRED_FILE" | tail -1 | cut -d= -f2-)"
        [[ -n "$db_pass" && -n "$redis_pass" ]] || die "未找到数据库/Redis 密码，请先执行 postgres 与 redis 步骤"

        if grep -q '^SECRET_KEY=' "$CRED_FILE"; then
            secret_key="$(grep '^SECRET_KEY=' "$CRED_FILE" | tail -1 | cut -d= -f2-)"
            jwt_key="$(grep '^JWT_SECRET_KEY=' "$CRED_FILE" | tail -1 | cut -d= -f2-)"
            dim "  复用已生成的密钥"
        else
            # ⚠️ SECRET_KEY 用于派生设备凭据 AES-256-GCM 密钥，变更后已存凭据无法解密
            secret_key="$(openssl rand -base64 64 | tr -d '\n')"
            jwt_key="$(openssl rand -base64 64 | tr -d '\n')"
            record_credential "SECRET_KEY=${secret_key}"
            record_credential "JWT_SECRET_KEY=${jwt_key}"
        fi
    fi

    if [[ "$DRY_RUN" != true ]]; then
        cat >"$ENV_FILE" <<ENVEOF
# 由 scripts/deploy-ubuntu.sh 生成于 $(date '+%Y-%m-%d %H:%M:%S')
SERVER_HOST=127.0.0.1
SERVER_PORT=${BACKEND_PORT}
ENVIRONMENT=production
DEBUG=false

LOG_LEVEL=info
LOG_FORMAT=json
LOG_FILE=${APP_LOGS}/backend/app.log

DATABASE_URL=postgresql://inspect_user:${db_pass}@127.0.0.1:5432/inspect_system
DATABASE_POOL_SIZE=20
DATABASE_MAX_OVERFLOW=40
DATABASE_POOL_RECYCLE=3600
DB_AUTO_MIGRATE=true
TIMESCALE_ENABLED=true

REDIS_URL=redis://:${redis_pass}@127.0.0.1:6379/0
MONITORING_CACHE_ENABLED=true
MONITORING_CACHE_TTL=30s

SECRET_KEY=${secret_key}
JWT_SECRET_KEY=${jwt_key}
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

CORS_ORIGINS=["https://${DOMAIN}"]
ALLOWED_HOSTS=${DOMAIN}

REPORT_OUTPUT_DIR=data/reports/monitoring
REPORTS_OUTPUT_DIR=data/reports

SNMP_TRAP_ENABLED=true
SNMP_TRAP_HOST=0.0.0.0
SNMP_TRAP_PORT=162

ENABLE_METRICS=true
METRICS_PORT=${PROM_PORT}
HEALTH_CHECK_ENABLED=true
HEALTH_CHECK_INTERVAL=30
ENVEOF
        chmod 600 "$ENV_FILE"
        chown "$APP_USER:$APP_USER" "$ENV_FILE"
    fi

    info "→ 编译后端（CGO_ENABLED=0 静态二进制）"
    # 必须显式传 HOME/GOCACHE：sudo 默认重置环境，Go 的构建缓存默认落在
    # $HOME/.cache/go-build，HOME 缺失或不可写会导致构建失败
    run_sh "sudo -u ${APP_USER} env \
        HOME=${APP_ROOT} \
        GOCACHE=${APP_ROOT}/.cache/go-build \
        GOMODCACHE=${APP_ROOT}/.cache/go-mod \
        PATH=/usr/local/go/bin:\$PATH \
        CGO_ENABLED=0 \
        go -C ${APP_SRC}/backend-go build -ldflags='-s -w' -o ${APP_BIN}/inspect-api.new ./cmd/api"
    run mv "${APP_BIN}/inspect-api.new" "${APP_BIN}/inspect-api"
    run chown "$APP_USER:$APP_USER" "${APP_BIN}/inspect-api"
    run chmod 755 "${APP_BIN}/inspect-api"

    info "→ 初始化数据库结构（幂等）"
    if [[ "$DRY_RUN" != true ]]; then
        PGPASSWORD="$db_pass" psql -h 127.0.0.1 -U inspect_user -d inspect_system \
            -v ON_ERROR_STOP=0 -q -f "${APP_SRC}/database/database-init-complete.sql" >/dev/null 2>&1 \
            || warn "初始化 SQL 存在告警，请在 verify 步骤确认 hypertable 与策略"
    fi

    info "→ 安装 systemd 单元 inspect-backend.service"
    if [[ "$DRY_RUN" != true ]]; then
        cat >/etc/systemd/system/inspect-backend.service <<UNITEOF
[Unit]
Description=Inspect Network Device Inspection API
Documentation=file://${APP_SRC}/docs/deployment/ubuntu-production.md
After=network-online.target postgresql.service redis-server.service
Wants=network-online.target
Requires=postgresql.service redis-server.service

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}

# 工作目录必须是源码根：REPORT_OUTPUT_DIR 等使用相对路径
WorkingDirectory=${APP_SRC}
Environment="ENV_FILE=${ENV_FILE}"
ExecStart=${APP_BIN}/inspect-api

Restart=always
RestartSec=5s

# 绑定 162/udp 特权端口，无需 root
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE

# 并发 SSH/SNMP 连接需要充足句柄
LimitNOFILE=65536
LimitNPROC=32768

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=${APP_LOGS} ${APP_ROOT}/data ${APP_ROOT}/backups ${APP_SRC}/data

StandardOutput=journal
StandardError=journal
SyslogIdentifier=inspect-backend

[Install]
WantedBy=multi-user.target
UNITEOF
    fi

    run systemctl daemon-reload
    run systemctl enable inspect-backend
    run systemctl restart inspect-backend

    if [[ "$DRY_RUN" != true ]]; then
        info "  等待后端就绪（迁移 29 个数据模型，首次启动较慢）"
        local ok=false
        for _ in $(seq 1 30); do
            if curl -fsS --max-time 3 "http://127.0.0.1:${BACKEND_PORT}/health" >/dev/null 2>&1; then
                ok=true; break
            fi
            sleep 2
        done
        [[ "$ok" == true ]] || die "后端健康检查失败，请查看 journalctl -u inspect-backend -n 100"
    fi

    success "后端已启动"
}

# ==========================================
# 步骤 5: Next.js 前端
# ==========================================
step_frontend() {
    step_banner "步骤 5/8  Next.js 前端"

    info "→ 安装 Node ${NODE_MAJOR} 与 pnpm"
    if command -v node &>/dev/null && node -v | grep -q "^v${NODE_MAJOR}\."; then
        dim "  Node ${NODE_MAJOR} 已安装，跳过"
    else
        run_sh "curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash -"
        run_sh "DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs"
    fi
    run_sh "corepack enable"
    run_sh "corepack prepare pnpm@${PNPM_VERSION} --activate"

    info "→ 准备源码"
    ensure_source

    info "→ 写入前端环境变量"
    if [[ "$DRY_RUN" != true ]]; then
        cat >"${APP_SRC}/frontend/.env.production" <<FEEOF
NODE_ENV=production
NEXT_PUBLIC_API_URL=https://${DOMAIN}
NEXT_PUBLIC_WS_URL=wss://${DOMAIN}
NEXT_TELEMETRY_DISABLED=1
FEEOF
        chown "$APP_USER:$APP_USER" "${APP_SRC}/frontend/.env.production"
    fi

    info "→ 安装依赖并构建（构建期是内存峰值，上限 ${BUILD_MEM_MB} MB）"
    run_sh "cd ${APP_SRC}/frontend && sudo -u ${APP_USER} env HOME=${APP_ROOT} \
        pnpm install --frozen-lockfile --silent"
    run_sh "cd ${APP_SRC}/frontend && sudo -u ${APP_USER} env HOME=${APP_ROOT} \
        NODE_OPTIONS='--max-old-space-size=${BUILD_MEM_MB}' NEXT_TELEMETRY_DISABLED=1 \
        pnpm run build"

    info "→ 安装 systemd 单元 inspect-frontend.service"
    if [[ "$DRY_RUN" != true ]]; then
        cat >/etc/systemd/system/inspect-frontend.service <<UNITEOF
[Unit]
Description=Inspect Frontend (Next.js)
After=network-online.target inspect-backend.service
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_SRC}/frontend

Environment="NODE_ENV=production"
Environment="PORT=${FRONTEND_PORT}"
Environment="HOSTNAME=127.0.0.1"
Environment="NEXT_TELEMETRY_DISABLED=1"
Environment="HOME=${APP_ROOT}"

ExecStart=/usr/bin/pnpm start

Restart=always
RestartSec=5s
LimitNOFILE=16384

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

StandardOutput=journal
StandardError=journal
SyslogIdentifier=inspect-frontend

[Install]
WantedBy=multi-user.target
UNITEOF
    fi

    run systemctl daemon-reload
    run systemctl enable inspect-frontend
    run systemctl restart inspect-frontend

    if [[ "$DRY_RUN" != true ]]; then
        local ok=false
        for _ in $(seq 1 20); do
            if curl -fsS --max-time 3 -o /dev/null "http://127.0.0.1:${FRONTEND_PORT}"; then
                ok=true; break
            fi
            sleep 2
        done
        [[ "$ok" == true ]] || warn "前端未在 40 秒内就绪，请查看 journalctl -u inspect-frontend"
    fi

    success "前端已启动"
}

# ==========================================
# 步骤 6: Nginx
# ==========================================
step_nginx() {
    step_banner "步骤 6/8  Nginx 反向代理"

    info "→ 安装 Nginx"
    run_sh "DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx"

    info "→ 生成自签证书（公网环境请改用 certbot）"
    run mkdir -p /etc/nginx/ssl
    if [[ "$DRY_RUN" != true && ! -f /etc/nginx/ssl/inspect.crt ]]; then
        openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
            -keyout /etc/nginx/ssl/inspect.key \
            -out /etc/nginx/ssl/inspect.crt \
            -subj "/CN=${DOMAIN}" >/dev/null 2>&1
        chmod 600 /etc/nginx/ssl/inspect.key
    else
        dim "  证书已存在，跳过"
    fi

    local grafana_block=""
    if [[ "$SKIP_MONITORING" != true ]]; then
        grafana_block=$(cat <<GRAFANA

    location /grafana/ {
        proxy_pass http://127.0.0.1:${GRAFANA_PORT}/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
GRAFANA
)
    fi

    info "→ 写入站点配置"
    if [[ "$DRY_RUN" != true ]]; then
        cat >/etc/nginx/sites-available/inspect <<NGINXEOF
upstream inspect_backend  { server 127.0.0.1:${BACKEND_PORT}; keepalive 32; }
upstream inspect_frontend { server 127.0.0.1:${FRONTEND_PORT}; keepalive 32; }

server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name ${DOMAIN};

    ssl_certificate     /etc/nginx/ssl/inspect.crt;
    ssl_certificate_key /etc/nginx/ssl/inspect.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_session_cache   shared:SSL:10m;

    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;
    add_header Strict-Transport-Security "max-age=31536000" always;

    # 报表导出文件可能较大
    client_max_body_size 64M;

    access_log ${APP_LOGS}/nginx/access.log;
    error_log  ${APP_LOGS}/nginx/error.log;

    location /api/ {
        proxy_pass http://inspect_backend;
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # 批量巡检与报表生成耗时较长
        proxy_connect_timeout 60s;
        proxy_send_timeout    300s;
        proxy_read_timeout    300s;
    }

    location /health {
        proxy_pass http://inspect_backend/health;
    }

    # WebSocket 实时告警推送：默认 60s 超时会导致每分钟断线重连
    location /api/v1/ws/ {
        proxy_pass http://inspect_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade    \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host       \$host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
${grafana_block}
    location / {
        proxy_pass http://inspect_frontend;
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade           \$http_upgrade;
        proxy_set_header Connection        "upgrade";
    }
}
NGINXEOF
        ln -sf /etc/nginx/sites-available/inspect /etc/nginx/sites-enabled/inspect
        rm -f /etc/nginx/sites-enabled/default
        chown -R "$APP_USER:adm" "${APP_LOGS}/nginx" 2>/dev/null || true
    fi

    run nginx -t
    run systemctl enable nginx
    run systemctl reload nginx

    success "Nginx 已配置"
}

# ==========================================
# 步骤 7: 监控组件（可选）
# ==========================================
step_monitoring() {
    if [[ "$SKIP_MONITORING" == true ]]; then
        step_banner "步骤 7/8  监控组件（已跳过）"
        dim "  指定了 --skip-monitoring"
        return 0
    fi

    step_banner "步骤 7/8  Prometheus + Grafana"

    info "→ 安装 Prometheus ${PROM_VERSION}"
    if command -v prometheus &>/dev/null && prometheus --version 2>&1 | grep -q "$PROM_VERSION"; then
        dim "  Prometheus ${PROM_VERSION} 已安装，跳过"
    else
        run_sh "wget -q -O /tmp/prom.tar.gz \
            https://github.com/prometheus/prometheus/releases/download/v${PROM_VERSION}/prometheus-${PROM_VERSION}.linux-amd64.tar.gz"
        run_sh "tar -xzf /tmp/prom.tar.gz -C /tmp"
        run_sh "id prometheus &>/dev/null || useradd -rs /bin/false prometheus"
        run mkdir -p /etc/prometheus /var/lib/prometheus
        run_sh "cp /tmp/prometheus-${PROM_VERSION}.linux-amd64/{prometheus,promtool} /usr/local/bin/"
        run_sh "cp -r /tmp/prometheus-${PROM_VERSION}.linux-amd64/{consoles,console_libraries} /etc/prometheus/"
        run_sh "rm -rf /tmp/prom.tar.gz /tmp/prometheus-${PROM_VERSION}.linux-amd64"
    fi

    if [[ "$DRY_RUN" != true ]]; then
        cat >/etc/prometheus/prometheus.yml <<PROMEOF
global:
  scrape_interval: 30s
  evaluation_interval: 30s

scrape_configs:
  - job_name: 'inspect-backend'
    static_configs:
      - targets: ['127.0.0.1:${PROM_PORT}']

  - job_name: 'node'
    static_configs:
      - targets: ['127.0.0.1:9100']
PROMEOF

        cat >/etc/systemd/system/prometheus.service <<'PROMUNIT'
[Unit]
Description=Prometheus
After=network-online.target
Wants=network-online.target

[Service]
User=prometheus
Group=prometheus
Type=simple
ExecStart=/usr/local/bin/prometheus \
  --config.file=/etc/prometheus/prometheus.yml \
  --storage.tsdb.path=/var/lib/prometheus \
  --storage.tsdb.retention.time=30d \
  --web.listen-address=127.0.0.1:9091 \
  --web.enable-lifecycle
Restart=always
RestartSec=5s

[Install]
WantedBy=multi-user.target
PROMUNIT
        chown -R prometheus:prometheus /etc/prometheus /var/lib/prometheus
    fi

    run_sh "DEBIAN_FRONTEND=noninteractive apt-get install -y -qq prometheus-node-exporter"
    run systemctl daemon-reload
    run systemctl enable --now prometheus prometheus-node-exporter

    info "→ 安装 Grafana"
    run mkdir -p /etc/apt/keyrings
    run_sh "wget -q -O - https://apt.grafana.com/gpg.key | gpg --dearmor -o /etc/apt/keyrings/grafana.gpg --yes"
    run_sh "echo 'deb [signed-by=/etc/apt/keyrings/grafana.gpg] https://apt.grafana.com stable main' \
        > /etc/apt/sources.list.d/grafana.list"
    run_sh "DEBIAN_FRONTEND=noninteractive apt-get update -qq"
    run_sh "DEBIAN_FRONTEND=noninteractive apt-get install -y -qq grafana"

    write_managed_block /etc/grafana/grafana.ini "INSPECT" "$(cat <<GRAFANAINI
[server]
http_addr = 127.0.0.1
http_port = ${GRAFANA_PORT}
root_url = https://${DOMAIN}/grafana/
serve_from_sub_path = true

[users]
allow_sign_up = false
GRAFANAINI
)"

    local gf_pass
    if [[ "$DRY_RUN" == true ]]; then
        gf_pass="<generated>"
    elif grep -q '^GRAFANA_ADMIN_PASSWORD=' "$CRED_FILE" 2>/dev/null; then
        gf_pass="$(grep '^GRAFANA_ADMIN_PASSWORD=' "$CRED_FILE" | tail -1 | cut -d= -f2-)"
    else
        gf_pass="$(gen_secret 24)"
        record_credential "GRAFANA_ADMIN_PASSWORD=${gf_pass}"
    fi

    run systemctl enable --now grafana-server
    if [[ "$DRY_RUN" != true ]]; then
        sleep 5
        grafana-cli admin reset-admin-password "$gf_pass" >/dev/null 2>&1 || \
            warn "Grafana 密码重置失败，可稍后手动执行 grafana-cli admin reset-admin-password"
    fi

    success "监控组件已就绪"
}

# ==========================================
# 运维配置（日志轮转 + 备份）
# ==========================================
setup_ops() {
    info "→ 配置日志轮转"
    # copytruncate: Go 后端持有文件句柄，rename 会导致日志写入已删除 inode
    write_managed_block /etc/logrotate.d/inspect "INSPECT" "$(cat <<LOGROTATE
${APP_LOGS}/**/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
    su ${APP_USER} ${APP_USER}
}
LOGROTATE
)"

    info "→ 配置数据库每日备份"
    if [[ "$DRY_RUN" != true ]]; then
        local db_pass
        db_pass="$(grep '^POSTGRES_PASSWORD=' "$CRED_FILE" 2>/dev/null | tail -1 | cut -d= -f2- || true)"
        cat >"${APP_BIN}/backup-db.sh" <<BACKUPEOF
#!/usr/bin/env bash
set -euo pipefail
BACKUP_DIR=${APP_ROOT}/backups/postgres
RETENTION_DAYS=30
STAMP=\$(date +%Y%m%d_%H%M%S)

mkdir -p "\$BACKUP_DIR"
export PGPASSWORD='${db_pass}'
pg_dump -h 127.0.0.1 -U inspect_user -d inspect_system -Fc \\
  -f "\${BACKUP_DIR}/inspect_\${STAMP}.dump"
find "\$BACKUP_DIR" -name 'inspect_*.dump' -mtime +\${RETENTION_DAYS} -delete
echo "[\$(date '+%F %T')] backup completed: inspect_\${STAMP}.dump"
BACKUPEOF
        chmod 700 "${APP_BIN}/backup-db.sh"
        chown "$APP_USER:$APP_USER" "${APP_BIN}/backup-db.sh"

        # 每日 02:30 备份
        local cron_line="30 2 * * * ${APP_BIN}/backup-db.sh >> ${APP_LOGS}/backup.log 2>&1"
        ( sudo -u "$APP_USER" crontab -l 2>/dev/null | grep -vF 'backup-db.sh' || true
          echo "$cron_line" ) | sudo -u "$APP_USER" crontab -
    fi
}

# ==========================================
# 步骤 8: 验证
# ==========================================
step_verify() {
    step_banner "步骤 8/8  部署验证"

    setup_ops

    if [[ "$DRY_RUN" == true ]]; then
        dim "[dry-run] 跳过验证"
        return 0
    fi

    local failed=0
    check() {
        local desc="$1"; shift
        if "$@" >/dev/null 2>&1; then
            success "$desc"
        else
            error "$desc"
            failed=$((failed + 1))
        fi
    }

    echo
    info "服务状态:"
    check "PostgreSQL 运行中"  systemctl is-active --quiet postgresql
    check "Redis 运行中"       systemctl is-active --quiet redis-server
    check "后端运行中"          systemctl is-active --quiet inspect-backend
    check "前端运行中"          systemctl is-active --quiet inspect-frontend
    check "Nginx 运行中"       systemctl is-active --quiet nginx
    if [[ "$SKIP_MONITORING" != true ]]; then
        check "Prometheus 运行中" systemctl is-active --quiet prometheus
        check "Grafana 运行中"    systemctl is-active --quiet grafana-server
    fi

    echo
    info "接口连通性:"
    check "后端 /health"  curl -fsS --max-time 5 "http://127.0.0.1:${BACKEND_PORT}/health"
    check "前端首页"       curl -fsS --max-time 5 -o /dev/null "http://127.0.0.1:${FRONTEND_PORT}"
    check "HTTPS 入口"     curl -fskS --max-time 5 -o /dev/null "https://127.0.0.1/"

    echo
    info "数据库扩展与时序策略:"
    local ext_count job_count ht_count
    ext_count=$(sudo -u postgres psql -d inspect_system -tAc \
        "SELECT count(*) FROM pg_extension WHERE extname IN ('timescaledb','pg_stat_statements','uuid-ossp');" 2>/dev/null || echo 0)
    ht_count=$(sudo -u postgres psql -d inspect_system -tAc \
        "SELECT count(*) FROM timescaledb_information.hypertables;" 2>/dev/null || echo 0)
    job_count=$(sudo -u postgres psql -d inspect_system -tAc \
        "SELECT count(*) FROM timescaledb_information.jobs WHERE proc_name IN ('policy_compression','policy_retention');" 2>/dev/null || echo 0)

    [[ "$ext_count" == "3" ]] && success "扩展齐全 (timescaledb / pg_stat_statements / uuid-ossp)" \
        || { error "扩展不全，当前 ${ext_count}/3"; failed=$((failed + 1)); }
    [[ "$ht_count" -ge 5 ]] && success "hypertable ${ht_count} 张" \
        || { error "hypertable 仅 ${ht_count} 张，预期 5 张"; failed=$((failed + 1)); }
    [[ "$job_count" -ge 10 ]] && success "压缩+保留策略 ${job_count} 条（7天压缩/90天删除）" \
        || { error "策略仅 ${job_count} 条，预期 10 条；检查 max_worker_processes"; failed=$((failed + 1)); }

    echo
    info "资源占用:"
    free -h | sed -n '1,2p'
    df -h / /var/lib/postgresql 2>/dev/null | sed -n '1,3p'

    echo
    if [[ $failed -eq 0 ]]; then
        color "32" "═══════════════════════════════════════════════════════════"
        success "部署完成，全部检查项通过"
        color "32" "═══════════════════════════════════════════════════════════"
    else
        color "31" "═══════════════════════════════════════════════════════════"
        error "部署完成，但有 ${failed} 项检查未通过，请查看上方输出"
        color "31" "═══════════════════════════════════════════════════════════"
    fi

    cat <<SUMMARY

访问地址   : https://${DOMAIN}
默认账号   : admin （首次登录强制修改密码）
凭据文件   : ${CRED_FILE}  (权限 600，请妥善备份)

常用命令:
  systemctl status inspect-backend inspect-frontend
  journalctl -u inspect-backend -f
  ${APP_BIN}/backup-db.sh

⚠️  重要提醒:
  SECRET_KEY 用于派生设备 CLI/SNMP 凭据的 AES-256-GCM 加密密钥。
  一旦变更，数据库中已存的设备凭据将全部无法解密。请务必备份 ${CRED_FILE}。

SUMMARY

    [[ $failed -eq 0 ]] || exit 1
}

# ==========================================
# 主流程
# ==========================================
main() {
    parse_args "$@"

    if [[ "$HELP" == true ]]; then
        show_help
        exit 0
    fi

    mapfile -t SELECTED_STEPS < <(resolve_steps)

    preflight

    if should_run system;     then step_system;     fi
    if should_run postgres;   then step_postgres;   fi
    if should_run redis;      then step_redis;      fi
    if should_run backend;    then step_backend;    fi
    if should_run frontend;   then step_frontend;   fi
    if should_run nginx;      then step_nginx;      fi
    if should_run monitoring; then step_monitoring; fi
    if should_run verify;     then step_verify;     fi

    exit 0
}

main "$@"
