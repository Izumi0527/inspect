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

# 网络重试参数：跨境链路对 packagecloud / go.dev / nodesource 偶发 TLS 超时，
# 显式限定单次超时并重试，优于默认行为下长时间挂死后一次性失败。
WGET_RETRY_OPTS="--tries=3 --timeout=30"
CURL_RETRY_OPTS="--retry 3 --retry-delay 2 --connect-timeout 15"

# 依赖镜像源。默认国内源：本系统主要部署于国内内网，官方源在此不可达
# （实测 proxy.golang.org 解析到 Google IP，全部模块 i/o timeout）。
# 境外部署用 --goproxy / --npm-registry，或同名环境变量覆盖。
GOPROXY_URL="${GOPROXY_URL:-https://goproxy.cn,direct}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"

# 二进制下载源。与 GOPROXY 是两回事：GOPROXY 管 Go「模块」下载，
# 这里管 Go「工具链」本身和 Prometheus 的 tar 包——两者在国内均实测超时
# （go.dev 与 github.com/*/releases/download 都不可达）。
GO_DL_BASE="${GO_DL_BASE:-https://mirrors.aliyun.com/golang}"
# GitHub 下载前缀，置空即直连 github.com。境外部署: --gh-proxy ''
GH_PROXY="${GH_PROXY:-https://ghfast.top/}"

# 单条命令的墙钟超时上限（秒）。必须外挂硬超时：apt 的 Acquire::Timeout 只管
# 「空闲无数据」不管总时长，慢速链路（几 KB/s）永不触发，表现为静默挂死。
CMD_TIMEOUT="${CMD_TIMEOUT:-1800}"
BUILD_TIMEOUT="${BUILD_TIMEOUT:-3600}"

# apt 前端锁等待上限。新装机上 unattended-upgrades 常在后台持有 dpkg 锁，
# apt 默认无限期等待，且安静模式会把 "Waiting for cache lock" 提示一并吞掉。
APT_OPTS="-o DPkg::Lock::Timeout=300"

BACKEND_PORT=9000
FRONTEND_PORT=13000
GRAFANA_PORT=3001
# Prometheus 自身的监听端口。此前该变量被同时当作「后端 metrics 端口」，
# 而 service 里又硬编码监听 9091，导致抓取目标指向无人监听的 9090，
# job inspect-backend 恒为 down —— 一个变量背两种语义的典型后果。
PROM_PORT=9091

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

# 运行期状态：供中断提示定位与总耗时统计
CURRENT_STEP=""
DEPLOY_START_TS=0

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

# 秒数格式化为 XmYYs
fmt_dur() { printf '%dm%02ds' $(( $1 / 60 )) $(( $1 % 60 )); }

# 带硬超时执行。本脚本对「命令返回错误」防御完备，却对「命令永不返回」
# 毫无防御——后者才是部署卡死的实际形态（apt 等 dpkg 锁 / 镜像慢速传输）。
#
# --foreground 不可省略：GNU timeout 默认 setpgid(0,0) 把被管命令挪进新的
# 后台进程组（控制终端的前台组仍是本脚本所在组）。apt 在 dpkg 收尾时会
# tcsetattr 恢复终端属性，而后台进程组一旦 tcsetattr，内核即对其发送
# SIGTTOU；apt 不屏蔽该信号被就地停住，timeout 自己却忽略 SIGTTOU/SIGTTIN
# 照常等待——表现为「输出全部打完便静默假死」，直到 secs 超时才被唤醒
# 强杀（真实故障：redis 步骤打印完 Processing triggers 后停摆 2 分钟以上）。
# 加 --foreground 让命令留在前台进程组，SIGTTOU/SIGTTIN 一并消除；代价是
# 超时信号只送达直接子进程（bash -c），孙进程会成为孤儿——但超时本就是
# 异常路径，让 apt 跑完收尾远好于留一个停止状态占着 dpkg 锁的僵尸。
# 用法: with_timeout <秒> <描述> <命令...>
with_timeout() {
    local secs="$1" desc="$2"
    shift 2
    local rc=0
    timeout --foreground --signal=TERM --kill-after=30 "$secs" "$@" || rc=$?
    if [[ $rc -eq 124 || $rc -eq 137 ]]; then
        error "命令超过 ${secs}s 未完成，已强制终止:"
        error "  ${desc}"
        error "  常见原因: apt 等待 dpkg 锁、镜像源慢速传输、DNS 解析挂起"
        error "  可用环境变量放宽: CMD_TIMEOUT / BUILD_TIMEOUT（单位秒）"
    fi
    return $rc
}

# 心跳。长步骤执行期间定期报告已用时，让「慢」与「死」可区分——
# 这是原脚本最缺的一环：apt 下载期间完全静默，用户无从判断该等还是该中断。
HEARTBEAT_PID=""
heartbeat_start() {
    local label="$1"
    (
        local n=0
        while true; do
            sleep 60
            n=$(( n + 1 ))
            color "90" "    … ${label} 进行中，已用 ${n} 分钟"
        done
    ) &
    HEARTBEAT_PID=$!
}
heartbeat_stop() {
    [[ -n "$HEARTBEAT_PID" ]] || return 0
    kill "$HEARTBEAT_PID" 2>/dev/null || true
    wait "$HEARTBEAT_PID" 2>/dev/null || true
    HEARTBEAT_PID=""
}

# 执行命令；--dry-run 时仅打印
run() {
    if [[ "$DRY_RUN" == true ]]; then
        dim "[dry-run] $*"
        return 0
    fi
    with_timeout "$CMD_TIMEOUT" "$*" "$@"
}

# 执行 shell 片段（含管道/重定向）
run_sh() {
    if [[ "$DRY_RUN" == true ]]; then
        dim "[dry-run] $*"
        return 0
    fi
    with_timeout "$CMD_TIMEOUT" "$*" bash -c "$*"
}

# 长耗时构建专用（go build / pnpm install / next build）：超时上限更宽
run_build() {
    if [[ "$DRY_RUN" == true ]]; then
        dim "[dry-run] $*"
        return 0
    fi
    with_timeout "$BUILD_TIMEOUT" "$*" bash -c "$*"
}

# 交互确认。不可交互时必须立即失败而非等待——「/dev/tty 是终端」不等于
# 「本进程在前台进程组」，后台场景下 read 会收到 SIGTTIN 而被停止（State: T），
# 表现为永久静默挂起，与本脚本要消灭的失败形态完全一致。
confirm() {
    [[ "$ASSUME_YES" == true ]] && return 0
    [[ "$DRY_RUN" == true ]] && return 0
    local prompt="$1"

    if [[ ! -t 0 ]] \
        || [[ "$(ps -o stat= -p $$ 2>/dev/null)" != *+* ]]; then
        error "需要交互确认，但当前 stdin 不可交互: ${prompt}"
        error "  请追加 --yes 显式确认，或改在交互式终端中执行"
        return 1
    fi

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
  --goproxy <URL>          Go 模块代理，默认 https://goproxy.cn,direct
                           境外部署改用 https://proxy.golang.org,direct
  --npm-registry <URL>     npm 源，默认 https://registry.npmmirror.com
                           境外部署改用 https://registry.npmjs.org
  --go-mirror <URL>        Go 工具链下载前缀，默认 https://mirrors.aliyun.com/golang
                           境外部署改用 https://go.dev/dl
  --gh-proxy <URL>         GitHub 下载加速前缀，默认 https://ghfast.top/
                           境外部署传空串 '' 直连 github.com
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
  - 单命令硬超时: CMD_TIMEOUT（默认 1800s）/ BUILD_TIMEOUT（默认 3600s）
  - 任一步骤失败或被 Ctrl+C 中断，都会提示可用 --from <step> 从该步续跑
  - 境外服务器一次性切回官方源:
      --goproxy https://proxy.golang.org,direct --npm-registry https://registry.npmjs.org \
      --go-mirror https://go.dev/dl --gh-proxy ''
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
            --goproxy)         GOPROXY_URL="${2:-}"; shift 2 ;;
            --npm-registry)    NPM_REGISTRY="${2:-}"; shift 2 ;;
            --go-mirror)       GO_DL_BASE="${2:-}"; shift 2 ;;
            --gh-proxy)        GH_PROXY="${2:-}"; shift 2 ;;
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
# apt / dpkg 环境准备
# ==========================================
# 必须由 main 直接调用，而非并入 step_system：用 --from postgres 之类续跑时会跳过
# system 步骤，而 postgres 同样大量装包，一样会踩到下面这两个坑。
prepare_apt_env() {
    if [[ "$DRY_RUN" == true ]]; then
        dim "[dry-run] 准备 apt 环境（关闭 man-db 触发器、暂停自动更新）"
        return 0
    fi

    # man-db 触发器会在装包后重建整个 man 索引，实测在低 IO 机器上可占用 20 分钟
    # 以上，而对服务器部署毫无价值。它是「dpkg 已打印 Setting up / Processing
    # triggers，apt 却迟迟不返回」的首要原因——进程没有死，只是在跑 mandb。
    if command -v debconf-set-selections >/dev/null 2>&1; then
        echo 'man-db man-db/auto-update boolean false' | debconf-set-selections 2>/dev/null || true
        dim "  已关闭 man-db 自动索引重建"
    fi

    # unattended-upgrades 与部署争抢 dpkg 锁。APT_OPTS 里的 DPkg::Lock::Timeout
    # 只覆盖「等锁」这一段；对端持锁跑 trigger 期间本进程依旧是静默等待，
    # 从输出上无从判断是慢还是死。部署期间先停掉它，结束后由系统自行恢复。
    if systemctl is-active --quiet unattended-upgrades 2>/dev/null; then
        info "→ 暂停 unattended-upgrades（部署期间避免争抢 dpkg 锁）"
        systemctl stop unattended-upgrades >/dev/null 2>&1 || true
    fi

    # 把「静默等锁」变成可见进度：装包前先等现存 apt/dpkg 进程退出。
    # fuser 来自 psmisc，缺失时直接跳过——apt 自身仍有 Lock::Timeout 兜底。
    if command -v fuser >/dev/null 2>&1; then
        local waited=0
        while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1; do
            [[ $waited -eq 0 ]] && info "→ 等待其他 apt/dpkg 进程释放锁"
            sleep 5
            waited=$((waited + 5))
            if [[ $waited -ge 300 ]]; then
                warn "dpkg 锁被占用已 ${waited}s，继续执行（apt 自身仍会重试等待）"
                break
            fi
        done
        if [[ $waited -gt 0 && $waited -lt 300 ]]; then
            dim "  等待 ${waited}s 后锁已释放"
        fi
    fi

    return 0
}

# ==========================================
# 步骤 1: 系统基础配置
# ==========================================
step_system() {
    step_banner "步骤 1/8  系统基础配置"

    # 必须先于任何 apt 操作：跨境链路瞬时超时会让 apt-get update 直接失败，
    # 默认无重试，一次抖动就导致整步失败（TimescaleDB 仓库尤其易触发）。
    info "→ 配置 apt 重试与超时"
    write_managed_block /etc/apt/apt.conf.d/99-inspect-retries "INSPECT" "$(cat <<'APTCONF'
Acquire::Retries "3";
Acquire::http::Timeout "30";
Acquire::https::Timeout "30";
APTCONF
)"

    info "→ 更新软件包索引并安装基础工具"
    run_sh "DEBIAN_FRONTEND=noninteractive apt-get ${APT_OPTS} update -q"
    run_sh "DEBIAN_FRONTEND=noninteractive apt-get ${APT_OPTS} install -y -q \
        curl wget gnupg lsb-release ca-certificates apt-transport-https \
        software-properties-common build-essential git jq unzip \
        htop net-tools chrony cron openssl acl"

    info "→ 配置时区与时间同步"
    run timedatectl set-timezone Asia/Shanghai
    run systemctl enable --now chrony
    # 每日数据库备份靠 cron 触发；不依赖 apt 自动启动服务（容器/精简镜像下不会启动）
    run systemctl enable --now cron

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
        run_sh "DEBIAN_FRONTEND=noninteractive apt-get ${APT_OPTS} install -y -q ufw"
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
    run_sh "DEBIAN_FRONTEND=noninteractive apt-get ${APT_OPTS} install -y -q postgresql-common"
    run_sh "/usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y"

    info "→ 添加 TimescaleDB 仓库"
    # 取发行版代号用 /etc/os-release 而非 lsb_release：后者依赖 lsb-release 包，该包由步骤 1 安装，
    # 而 --dry-run 会跳过安装、此处的命令替换却是无条件真实执行的，会让预演直接崩在这一行。
    local codename
    codename="$(. /etc/os-release 2>/dev/null && printf '%s' "${VERSION_CODENAME:-noble}")"
    run_sh "echo 'deb https://packagecloud.io/timescale/timescaledb/ubuntu/ ${codename} main' \
        > /etc/apt/sources.list.d/timescaledb.list"
    run_sh "wget --quiet ${WGET_RETRY_OPTS} -O - https://packagecloud.io/timescale/timescaledb/gpgkey \
        | gpg --dearmor --yes -o /etc/apt/trusted.gpg.d/timescale_timescaledb.gpg"
    run_sh "DEBIAN_FRONTEND=noninteractive apt-get ${APT_OPTS} update -q"

    # 判定候选版本是否存在。必须先取输出再匹配，不能用 `apt-cache ... | grep -q`：
    # grep -q 命中即退出，向上游 apt-cache 发 SIGPIPE，在 set -o pipefail 下整条管道
    # 返回 141，被误判为「无此包」——包其实一直存在。同类陷阱见 gen_secret() 的注释。
    has_timescale_candidate() {
        local policy
        policy="$(apt-cache policy "timescaledb-2-postgresql-${PG_VERSION}" 2>/dev/null || true)"
        [[ "$policy" == *"Candidate: "[0-9]* ]]
    }

    # 关键校验：新发行版代号的 TimescaleDB 仓库可能尚未发布，需回退
    if [[ "$DRY_RUN" != true ]]; then
        if ! has_timescale_candidate; then
            warn "TimescaleDB 仓库无 ${codename} 对应包，回退到 noble (24.04) 仓库（二进制兼容）"
            echo "deb https://packagecloud.io/timescale/timescaledb/ubuntu/ noble main" \
                >/etc/apt/sources.list.d/timescaledb.list
            DEBIAN_FRONTEND=noninteractive apt-get ${APT_OPTS} update -q
            has_timescale_candidate \
                || die "TimescaleDB 包不可用：仓库 ${codename} 与 noble 均无 timescaledb-2-postgresql-${PG_VERSION} 候选版本。请检查网络、密钥环 /etc/apt/trusted.gpg.d/timescale_timescaledb.gpg 是否有效，或手动指定仓库代号"
        fi
    fi

    info "→ 安装 PostgreSQL 与 TimescaleDB"
    run_sh "DEBIAN_FRONTEND=noninteractive apt-get ${APT_OPTS} install -y -q \
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
    run_sh "DEBIAN_FRONTEND=noninteractive apt-get ${APT_OPTS} install -y -q redis-server"

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

    # 源码树内的运行时目录必须在此创建（不能提前到步骤 1：git clone 要求目标目录为空）。
    # 仓库不跟踪 data/（内容全部被 gitignore），全新克隆后该目录不存在，而 systemd 单元的
    # ReadWritePaths 要求列出的路径已存在，否则启动即 226/NAMESPACE，且报错只提
    # "Failed to set up mount namespacing"，完全不提示是哪个目录缺失。
    # 后端的 REPORT_OUTPUT_DIR / REPORTS_OUTPUT_DIR 是相对 WorkingDirectory=$APP_SRC 的
    # 相对路径，确实需要该目录可写。
    run mkdir -p "$APP_SRC/data/reports/monitoring"
    run chown -R "$APP_USER:$APP_USER" "$APP_SRC/data"
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
        run_sh "wget -q ${WGET_RETRY_OPTS} -O /tmp/go.tar.gz \
            ${GO_DL_BASE}/go${GO_VERSION}.linux-amd64.tar.gz"
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

# 后端当前未实现 Prometheus exporter（go.mod 无 client_golang、路由无 /metrics），
# 故置 false；原先还有一行 METRICS_PORT 指向 Prometheus 自身端口，属语义错误已移除。
# 后端实现 exporter 后：改回 true、补 METRICS_PORT，并在 prometheus.yml 恢复抓取 job。
ENABLE_METRICS=false
HEALTH_CHECK_ENABLED=true
HEALTH_CHECK_INTERVAL=30
ENVEOF
        chmod 600 "$ENV_FILE"
        chown "$APP_USER:$APP_USER" "$ENV_FILE"
    fi

    info "→ 编译后端（CGO_ENABLED=0 静态二进制）"
    # 必须显式传 HOME/GOCACHE：sudo 默认重置环境，Go 的构建缓存默认落在
    # $HOME/.cache/go-build，HOME 缺失或不可写会导致构建失败。
    # GOPROXY 同理必须显式传：不传则走默认 proxy.golang.org（Google IP），
    # 国内实测全部模块 i/o timeout，且 sudo 会把外部导出的同名变量丢掉。
    # PATH 写死而非继承 $PATH：env 按空格分词，继承来的 PATH 一旦含空格路径
    # （如 WSL 注入的 /mnt/c/Program Files/...）会被拆断，报 127。
    run_build "sudo -u ${APP_USER} env \
        HOME=${APP_ROOT} \
        GOCACHE=${APP_ROOT}/.cache/go-build \
        GOMODCACHE=${APP_ROOT}/.cache/go-mod \
        GOPROXY=${GOPROXY_URL} \
        PATH=/usr/local/go/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
        CGO_ENABLED=0 \
        go -C ${APP_SRC}/backend-go build -ldflags='-s -w' -o ${APP_BIN}/inspect-api.new ./cmd/api"
    run mv "${APP_BIN}/inspect-api.new" "${APP_BIN}/inspect-api"
    run chown "$APP_USER:$APP_USER" "${APP_BIN}/inspect-api"
    run chmod 755 "${APP_BIN}/inspect-api"

    # 初始化 SQL 需要执行两次，这不是冗余：
    #   第一次（此处）建立不依赖后端的表与 hypertable；
    #   第二次（后端健康检查通过后）建立 device_status_history / user_activity_logs——
    #   它们分别外键引用 devices(id) / users(id)，而这两张表由后端 GORM AutoMigrate 创建，
    #   在后端首次启动前并不存在，此时建表必然失败，进而导致对应 hypertable 缺失、
    #   紧随其后的策略 DO 块整块中止（实测为 3/5 hypertable、2/10 策略）。
    # SQL 全程使用 IF NOT EXISTS / if_not_exists => TRUE，重复执行安全。
    apply_init_sql() {
        if [[ "$DRY_RUN" == true ]]; then
            dim "[dry-run] 执行 database-init-complete.sql"
            return 0
        fi
        local log="${APP_LOGS}/db-init.log"
        PGPASSWORD="$db_pass" psql -h 127.0.0.1 -U inspect_user -d inspect_system \
            -v ON_ERROR_STOP=0 -q -f "${APP_SRC}/database/database-init-complete.sql" >"$log" 2>&1 \
            || warn "初始化 SQL 返回非零，详见 $log"
        # 原实现把输出重定向到 /dev/null 2>&1，错误全部被吞掉，排查时毫无线索；改为留档
        local errs
        errs="$(grep -ci '^ERROR' "$log" 2>/dev/null || true)"
        if [[ "${errs:-0}" -gt 0 ]]; then
            dim "  初始化 SQL 有 ${errs} 条 ERROR（详见 $log）"
        fi
        return 0
    }

    info "→ 初始化数据库结构（幂等，首轮）"
    apply_init_sql

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

    # 后端已完成 GORM 迁移，devices / users 就位，此时补建外键依赖它们的时序表与策略
    info "→ 初始化数据库结构（幂等，补齐外键依赖表）"
    apply_init_sql

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
        run_sh "curl -fsSL ${CURL_RETRY_OPTS} https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash -"
        run_sh "DEBIAN_FRONTEND=noninteractive apt-get ${APT_OPTS} install -y -q nodejs"
    fi
    run_sh "corepack enable"
    # corepack 的版本激活记录写在 COREPACK_HOME（默认 $HOME/.cache/node/corepack），按用户隔离。
    # 前端构建以 ${APP_USER} + HOME=${APP_ROOT} 执行，若在 root 下激活则构建时读不到该记录，
    # corepack 会退化为下载“最新版”pnpm（当前 11.x 要求 Node>=22），在 Node 20 上直接崩溃。
    run_sh "sudo -u ${APP_USER} env HOME=${APP_ROOT} \
        COREPACK_NPM_REGISTRY=${NPM_REGISTRY} \
        corepack prepare pnpm@${PNPM_VERSION} --activate"

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
    run_build "cd ${APP_SRC}/frontend && sudo -u ${APP_USER} env HOME=${APP_ROOT} \
        npm_config_registry=${NPM_REGISTRY} \
        pnpm install --frozen-lockfile --silent"
    run_build "cd ${APP_SRC}/frontend && sudo -u ${APP_USER} env HOME=${APP_ROOT} \
        npm_config_registry=${NPM_REGISTRY} \
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
# TLS 证书
# ==========================================
# build_cert_san 按目标主机形态构造 X.509 subjectAltName。
# X.509 对 IP 与域名使用不同的条目类型（IP: / DNS:），类型填错等同于未填。
# Chrome 58+ 起已完全忽略证书 CN 字段，仅凭 SAN 判定身份是否匹配，
# 因此缺少 SAN 的证书即便 CN 正确，浏览器一样判为身份不符。
build_cert_san() {
    local host="$1"
    if [[ "$host" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
        printf 'IP:%s,IP:127.0.0.1,DNS:localhost' "$host"
    else
        printf 'DNS:%s,DNS:localhost,IP:127.0.0.1' "$host"
    fi
}

# cert_san_covers 判断已有证书的 SAN 是否覆盖目标主机，用于区分三种情形：
# 无证书（签发）、旧版本遗留的无 SAN 证书（重新签发）、
# 运维手工放置且已覆盖目标主机的证书（保留，不得覆盖）。
cert_san_covers() {
    local cert="$1" host="$2" san escaped
    [[ -f "$cert" ]] || return 1
    san="$(openssl x509 -in "$cert" -noout -ext subjectAltName 2>/dev/null)" || return 1
    [[ -n "$san" ]] || return 1
    escaped="${host//./\\.}"
    # openssl 回显的条目名是 "IP Address:"，与输入侧的 "IP:" 写法不同，不能直接比对。
    # 尾部断言用于排除前缀误命中（如 192.168.1.10 命中 192.168.1.100）。
    if [[ "$host" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
        grep -qE "IP Address:${escaped}([^0-9]|$)" <<<"$san"
    else
        grep -qiE "DNS:${escaped}([^0-9A-Za-z.-]|$)" <<<"$san"
    fi
}

# ==========================================
# 步骤 6: Nginx
# ==========================================
step_nginx() {
    step_banner "步骤 6/8  Nginx 反向代理"

    info "→ 安装 Nginx"
    run_sh "DEBIAN_FRONTEND=noninteractive apt-get ${APT_OPTS} install -y -q nginx"

    info "→ 准备自签证书（含 SAN；公网域名环境建议改用 certbot）"
    run mkdir -p /etc/nginx/ssl
    local ssl_cert=/etc/nginx/ssl/inspect.crt
    local ssl_key=/etc/nginx/ssl/inspect.key
    local cert_san
    cert_san="$(build_cert_san "$DOMAIN")"
    if [[ "$DRY_RUN" == true ]]; then
        dim "[dry-run] 签发自签证书 subjectAltName=${cert_san}"
    elif cert_san_covers "$ssl_cert" "$DOMAIN"; then
        dim "  已有证书的 SAN 已覆盖 ${DOMAIN}，保留不动"
    else
        local cert_stamp cert_err
        if [[ -f "$ssl_cert" ]]; then
            cert_stamp="$(date +%Y%m%d%H%M%S)"
            warn "已有证书未覆盖 ${DOMAIN}（旧版本无 SAN，或访问地址已变更），备份后重新签发"
            mv "$ssl_cert" "${ssl_cert}.bak.${cert_stamp}"
            if [[ -f "$ssl_key" ]]; then
                mv "$ssl_key" "${ssl_key}.bak.${cert_stamp}"
            fi
        fi
        info "  subjectAltName=${cert_san}"
        if ! cert_err="$(openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
                -keyout "$ssl_key" -out "$ssl_cert" \
                -subj "/CN=${DOMAIN}" -addext "subjectAltName=${cert_san}" 2>&1)"; then
            die "自签证书生成失败：${cert_err}"
        fi
        chmod 600 "$ssl_key"
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

    # nginx 1.25.1 起才提供独立的 `http2 on;` 指令；Ubuntu 24.04 自带 1.24.0 只认旧写法
    # `listen ... http2`，直接写 http2 on 会导致 nginx -t 报 unknown directive 而整步失败。
    # 反之在 1.25+ 上用旧写法只会产生弃用警告，因此按实际版本分派而非二选一。
    local http2_listen="" http2_directive=""
    local nginx_ver
    local nginx_banner
    nginx_banner="$(nginx -v 2>&1 || true)"   # 形如: nginx version: nginx/1.24.0 (Ubuntu)
    nginx_ver="${nginx_banner##*nginx/}"
    nginx_ver="${nginx_ver%% *}"
    # nginx 尚未安装时（如 --dry-run），nginx_banner 是 shell 的 "command not found"
    # 文本，其中并不含 "nginx/"，## 不匹配便原样返回而非置空，因此仅判非空拦不住它：
    # 会把脚本路径当版本号喂给 dpkg（报 bad syntax），并让下方 :-未知 的兜底失效。
    # 故在此显式校验版本号格式，提取失败一律归一为空。
    [[ "$nginx_ver" =~ ^[0-9]+(\.[0-9]+)*$ ]] || nginx_ver=""
    if [[ -n "$nginx_ver" ]] && dpkg --compare-versions "$nginx_ver" ge 1.25.1; then
        http2_directive="    http2 on;"
    else
        http2_listen=" http2"
    fi
    info "→ 写入站点配置（nginx ${nginx_ver:-未知}）"
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
    listen 443 ssl${http2_listen};
${http2_directive}
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
    # reload 对未运行的服务会直接失败（容器内 policy-rc.d 阻止 apt 自动启动，或上次部署后
    # 被手工 stop 过）；reload-or-restart 未运行时启动、运行中时热重载，两种状态都成立。
    run systemctl reload-or-restart nginx

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
        run_sh "wget -q ${WGET_RETRY_OPTS} -O /tmp/prom.tar.gz \
            ${GH_PROXY}https://github.com/prometheus/prometheus/releases/download/v${PROM_VERSION}/prometheus-${PROM_VERSION}.linux-amd64.tar.gz"
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
  # 此处原有 inspect-backend job，因后端尚未实现 Prometheus exporter 而移除
  # （go.mod 无 client_golang 依赖，路由中也无 /metrics）。待后端实现后恢复:
  #   - job_name: 'inspect-backend'
  #     static_configs:
  #       - targets: ['127.0.0.1:<后端 metrics 端口>']
  - job_name: 'node'
    static_configs:
      - targets: ['127.0.0.1:9100']
PROMEOF

        # 非 quoted heredoc: 需展开 ${PROM_PORT}；本段内无其他 $ 变量，安全
        cat >/etc/systemd/system/prometheus.service <<PROMUNIT
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
  --web.listen-address=127.0.0.1:${PROM_PORT} \
  --web.enable-lifecycle
Restart=always
RestartSec=5s

[Install]
WantedBy=multi-user.target
PROMUNIT
        chown -R prometheus:prometheus /etc/prometheus /var/lib/prometheus
    fi

    run_sh "DEBIAN_FRONTEND=noninteractive apt-get ${APT_OPTS} install -y -q prometheus-node-exporter"
    run systemctl daemon-reload
    run systemctl enable prometheus prometheus-node-exporter
    # 必须 restart 而非 --now：本步骤每次重写 prometheus.yml 与 unit，
    # 而 --now 对已运行的服务是 no-op，会导致配置变更永不生效。
    run systemctl restart prometheus prometheus-node-exporter

    info "→ 安装 Grafana"
    run mkdir -p /etc/apt/keyrings
    run_sh "wget -q ${WGET_RETRY_OPTS} -O - https://apt.grafana.com/gpg.key | gpg --dearmor -o /etc/apt/keyrings/grafana.gpg --yes"
    run_sh "echo 'deb [signed-by=/etc/apt/keyrings/grafana.gpg] https://apt.grafana.com stable main' \
        > /etc/apt/sources.list.d/grafana.list"
    run_sh "DEBIAN_FRONTEND=noninteractive apt-get ${APT_OPTS} update -q"
    run_sh "DEBIAN_FRONTEND=noninteractive apt-get ${APT_OPTS} install -y -q grafana"

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

    run systemctl enable grafana-server
    # 同上：本步骤每次重写 grafana.ini，需 restart 才能生效
    run systemctl restart grafana-server
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
        success "验收通过，全部检查项均正常"
        color "32" "═══════════════════════════════════════════════════════════"
    else
        color "31" "═══════════════════════════════════════════════════════════"
        error "验收未通过：${failed} 项检查失败，请查看上方输出"
        color "31" "═══════════════════════════════════════════════════════════"
    fi

    cat <<SUMMARY

访问地址   : https://${DOMAIN}
默认账号   : admin （首次登录强制修改密码）
凭据文件   : ${CRED_FILE}  (权限 600，请妥善备份)

消除浏览器证书警告（脚本签发的是自签证书，客户端需导入一次；
若已换用受信任 CA 签发的证书则忽略本节）:
  1. 取回证书（在客户端机器执行）
       scp root@${DOMAIN}:/etc/nginx/ssl/inspect.crt .
  2. 导入系统信任库
       Windows : certutil -addstore -f Root inspect.crt      （管理员 PowerShell）
       macOS   : sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain inspect.crt
       Ubuntu  : sudo cp inspect.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates
     Firefox 使用独立证书库，需在 设置 → 隐私与安全 → 证书 → 查看证书 → 颁发机构 中导入
  3. 重启浏览器后访问 https://${DOMAIN}

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
# 信号处理。原脚本无任何 trap：Ctrl+C 后静默死亡，不告知停在哪一步、
# 系统处于何种状态、能否续跑——而此时 systemd 单元/用户/fstab 可能已写入。
on_signal() {
    local sig="$1"
    heartbeat_stop
    echo
    error "部署被 ${sig} 中断"
    if [[ -n "$CURRENT_STEP" ]]; then
        error "  中断于步骤: ${CURRENT_STEP}（该步可能只完成了一半）"
        error "  修复后可从该步续跑:"
        error "    sudo ${SCRIPT_DIR}/deploy-ubuntu.sh --domain ${DOMAIN:-<域名>} --from ${CURRENT_STEP}"
    fi
    exit 130
}

# 执行单个步骤：登记当前步骤名、挂心跳、统计耗时、失败时给出续跑指引
run_step() {
    local key="$1" fn="$2"
    should_run "$key" || return 0

    CURRENT_STEP="$key"
    local t0 rc=0
    t0=$(date +%s)
    heartbeat_start "步骤 ${key}"
    # 必须写成「先 set +e，子 shell 独立成句，再取 $?」这一形式，不可简写。
    # 若写作 "$fn" || rc=$?，bash 会在整个 $fn 内部抑制 set -e：步骤中任何命令
    # 失败都被静默跳过、函数最终仍返回 0，失败的部署会被判定为成功。实测中
    # apt-get install 被 1800s 超时杀死后，postgres 步骤仍一路执行到底。
    # 该抑制还会穿透子 shell，故 ( set -e; "$fn" ) || rc=$? 同样无效——子 shell
    # 一旦处于 || 左侧便同样被抑制。步骤间状态经 CRED_FILE 落盘传递，隔离无副作用。
    set +e
    ( set -e; "$fn" )
    rc=$?
    set -e
    heartbeat_stop
    local elapsed=$(( $(date +%s) - t0 ))

    if [[ $rc -ne 0 ]]; then
        error "步骤 ${key} 失败（已用 $(fmt_dur "$elapsed")），退出码 ${rc}"
        error "  修复后可从该步续跑:"
        error "    sudo ${SCRIPT_DIR}/deploy-ubuntu.sh --domain ${DOMAIN} --from ${key}"
        exit "$rc"
    fi
    dim "  [步骤 ${key} 用时 $(fmt_dur "$elapsed")]"
}

# 收尾横幅。必须独立于 step_verify：完成信号与验收结果是两件事，
# 原先绑在一起，导致 --dry-run / --steps 跳过验收时一句提示都没有。
final_banner() {
    local total=$(( $(date +%s) - DEPLOY_START_TS ))
    echo
    if [[ "$DRY_RUN" == true ]]; then
        color "33" "═══════════════════════════════════════════════════════════"
        warn "预演完成（--dry-run），未做任何实际改动 · 用时 $(fmt_dur "$total")"
        color "33" "═══════════════════════════════════════════════════════════"
    else
        color "32" "═══════════════════════════════════════════════════════════"
        success "全部步骤执行完毕 · 总用时 $(fmt_dur "$total")"
        color "32" "═══════════════════════════════════════════════════════════"
    fi
    dim "  已执行步骤: ${SELECTED_STEPS[*]}"
}

main() {
    parse_args "$@"

    if [[ "$HELP" == true ]]; then
        show_help
        exit 0
    fi

    # 非交互模式下彻底断开 stdin。此时 confirm() 不读输入，而 apt 的 postinst
    # 若继承到 /dev/tty 且本进程不在前台进程组，读取时会收到 SIGTTIN 被停止
    # （State: T / wchan: do_signal_stop），表现为永久静默挂起。
    # install.sh 已在交接处规避，但本脚本也可能被 CI、ssh host cmd 直接调用，
    # 故在此再兜一层——防御要放在被绕不过去的位置。
    if [[ "$ASSUME_YES" == true || "$DRY_RUN" == true ]]; then
        exec </dev/null
    fi

    DEPLOY_START_TS=$(date +%s)
    trap 'on_signal SIGINT' INT
    trap 'on_signal SIGTERM' TERM

    mapfile -t SELECTED_STEPS < <(resolve_steps)

    preflight
    prepare_apt_env

    run_step system     step_system
    run_step postgres   step_postgres
    run_step redis      step_redis
    run_step backend    step_backend
    run_step frontend   step_frontend
    run_step nginx      step_nginx
    run_step monitoring step_monitoring
    run_step verify     step_verify

    final_banner
    exit 0
}

main "$@"
