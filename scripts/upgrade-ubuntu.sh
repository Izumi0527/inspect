#!/usr/bin/env bash
# ============================================
# 企业级网络设备巡检系统 - Ubuntu 原生部署升级脚本
#
# 面向已按 deploy-ubuntu.sh 完成部署的机器：升级应用到指定 git ref（默认 main
# 最新），带版本对比、升级前数据库备份、版本号注入构建、健康检查与失败自动回滚。
#
# 为什么独立于 deploy-ubuntu.sh --steps backend,frontend：
#   那条路径面向部署调试（要求 --domain、重生成 ENV_FILE、重跑 seed），没有
#   升级前备份、版本对比与回滚——对生产升级而言安全网不足。本脚本只做四件事：
#   备份、换代码、换二进制/构建产物、验证版本，其余一概不碰。
#
# 版本号约定：仓库根 VERSION 文件是版本权威源（README 声明），构建时经
# ldflags 注入 backend-go/internal/config.defaultAppVersion、经
# NEXT_PUBLIC_APP_VERSION 注入前端，升级成功与否以 /health 返回的 version
# 是否等于目标版本号为准。
# ============================================
set -euo pipefail

APP_USER="inspect"
APP_ROOT="/opt/inspect"
APP_SRC="$APP_ROOT/app"
APP_BIN="$APP_ROOT/bin"
APP_CONF="$APP_ROOT/config"
ENV_FILE="$APP_CONF/.env"
CRED_FILE="$APP_CONF/credentials.txt"
BACKUP_DIR="$APP_ROOT/backups/postgres"

BACKEND_PORT=9000
FRONTEND_PORT=13000
BACKEND_UNIT="inspect-backend"
FRONTEND_UNIT="inspect-frontend"

# 与 build-release.sh / deploy-ubuntu.sh 保持一致的注入路径与构建环境默认值
GO_CONFIG_PKG="github.com/your-org/inspect-system/backend-go/internal/config"
GOPROXY_URL="${GOPROXY_URL:-https://goproxy.cn,direct}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"
BUILD_MEM_MB="${BUILD_MEM_MB:-4096}"

# git fetch 的网络重试次数与单次超时（秒）。跨境链路对 github.com 偶发超时，
# 短间隔多次重试优于挂死。
FETCH_RETRIES=3
FETCH_TIMEOUT=60

TARGET_REF="main"
FORCE=false
SKIP_BACKUP=false
DRY_RUN=false
ASSUME_YES=false
HELP=false

# 升级过程状态（跨步骤传递）
OLD_COMMIT="" NEW_COMMIT="" OLD_VERSION="" NEW_VERSION=""
BACKUP_FILE="" PREV_BIN="${APP_BIN}/inspect-api.prev"

# ==========================================
# 输出与执行 helper（与 uninstall.sh / deploy-ubuntu.sh 保持一致）
# ==========================================
color() {
    local code="$1"; shift
    if [[ -t 1 ]]; then printf '\033[%sm%s\033[0m\n' "$code" "$*"; else printf '%s\n' "$*"; fi
}
info()    { color "36" "$*"; }
success() { color "32" "✅ $*"; }
warn()    { color "33" "⚠️  $*"; }
error()   { color "31" "❌ $*"; }
dim()     { color "90" "$*"; }
die()     { error "$*"; exit 1; }

step_banner() {
    echo
    color "35" "==========================================================="
    color "35" "  $*"
    color "35" "==========================================================="
}

# 构建类命令的硬超时。timeout 必须带 --foreground：GNU timeout 默认 setpgid
# 把被管命令挪进后台进程组，命令对终端 tcsetattr 会触发 SIGTTOU 静默停摆
# （deploy-ubuntu.sh 的 with_timeout 同款教训，详见其注释）。
with_timeout() {
    local secs="$1"; shift
    timeout --foreground --signal=TERM --kill-after=30 "$secs" "$@"
}

run() {
    if [[ "$DRY_RUN" == true ]]; then dim "[dry-run] $*"; return 0; fi
    with_timeout 1800 "$@"
}

run_sh() {
    if [[ "$DRY_RUN" == true ]]; then dim "[dry-run] $*"; return 0; fi
    # 必须显式 pipefail：父 shell 的该选项不跨 bash -c 继承
    with_timeout 1800 bash -o pipefail -c "$*"
}

# 构建专用（pnpm install 在慢速链路上可能远超普通命令）
run_build() {
    if [[ "$DRY_RUN" == true ]]; then dim "[dry-run] $*"; return 0; fi
    with_timeout 3600 bash -o pipefail -c "$*"
}

confirm() {
    [[ "$ASSUME_YES" == true || "$DRY_RUN" == true ]] && return 0
    local reply
    read -r -p "$1 [y/N] " reply
    [[ "$reply" =~ ^[Yy]$ ]]
}

# 数值版本比较：$1 >= $2 时返回 0（sort -V 处理 1.23.5 与 1.23 的语义比较）
version_ge() {
    [[ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -1)" == "$2" ]]
}

# 从 /health 提取运行中版本。不用 jq：目标机不保证安装。
# 服务未运行/未就绪时返回空串，调用方按「未知」展示。
running_version() {
    curl -fsS --max-time 3 "http://127.0.0.1:${BACKEND_PORT}/health" 2>/dev/null \
        | grep -o '"version":"[^"]*"' | head -1 | cut -d'"' -f4 || true
}

# ==========================================
# 各阶段
# ==========================================
preflight() {
    step_banner "前置检查"

    [[ "$(id -u)" -eq 0 ]] || die "需要 root 权限，请使用 sudo 执行"

    local missing=""
    [[ -x "$APP_BIN/inspect-api" ]]                    || missing+="  - ${APP_BIN}/inspect-api（后端二进制）"$'\n'
    [[ -f "/etc/systemd/system/${BACKEND_UNIT}.service" ]]  || missing+="  - /etc/systemd/system/${BACKEND_UNIT}.service"$'\n'
    [[ -f "/etc/systemd/system/${FRONTEND_UNIT}.service" ]] || missing+="  - /etc/systemd/system/${FRONTEND_UNIT}.service"$'\n'
    [[ -f "$ENV_FILE" ]]                               || missing+="  - ${ENV_FILE}"$'\n'
    [[ -d "$APP_SRC/.git" ]]                           || missing+="  - ${APP_SRC}（git 源码目录）"$'\n'
    [[ -z "$missing" ]] || die "未检测到已完成的原生部署，缺少：
${missing}请先执行 scripts/deploy-ubuntu.sh"

    for cmd in git curl; do
        command -v "$cmd" >/dev/null 2>&1 || die "缺少命令 $cmd"
    done

    success "前置检查通过"
}

probe_current() {
    step_banner "当前版本"

    OLD_COMMIT="$(sudo -u "$APP_USER" git -C "$APP_SRC" rev-parse --short HEAD)"
    OLD_VERSION="$(cat "$APP_SRC/VERSION" 2>/dev/null || echo 未知)"
    local live
    live="$(running_version)"
    info "  源码版本   : ${OLD_VERSION}"
    info "  源码 commit: ${OLD_COMMIT}"
    if [[ -n "$live" ]]; then
        info "  运行中版本 : ${live}"
        [[ "$live" == "$OLD_VERSION" ]] || warn "运行中版本 (${live}) 与源码版本 (${OLD_VERSION}) 不一致，可能存在未完成的升级"
    else
        dim "  运行中版本 : 未知（后端 /health 不可达，服务可能未运行）"
    fi
}

fetch_ref() {
    local ref="$1" attempt rc=1
    for attempt in $(seq 1 "$FETCH_RETRIES"); do
        info "→ 拉取 ${ref}（第 ${attempt}/${FETCH_RETRIES} 次）"
        # fetch 只更新远程跟踪引用，对工作区无破坏——不纳入 dry-run 跳过范围，
        # 否则 dry-run 的版本对比与目标解析（rev-parse FETCH_HEAD）没有数据来源
        if with_timeout "$FETCH_TIMEOUT" \
            sudo -u "$APP_USER" git -C "$APP_SRC" fetch origin "$ref"; then
            rc=0
            break
        fi
        [[ $attempt -lt $FETCH_RETRIES ]] && sleep 2
    done
    [[ $rc -eq 0 ]] || die "git fetch origin ${ref} 连续 ${FETCH_RETRIES} 次失败，请检查网络后重试"
}

resolve_target() {
    step_banner "解析目标版本"
    fetch_ref "$TARGET_REF"

    NEW_COMMIT="$(sudo -u "$APP_USER" git -C "$APP_SRC" rev-parse --short FETCH_HEAD)"
    NEW_VERSION="$(sudo -u "$APP_USER" git -C "$APP_SRC" show "FETCH_HEAD:VERSION" 2>/dev/null)" \
        || die "目标 ${TARGET_REF} (${NEW_COMMIT}) 缺少 VERSION 文件——版本权威源约定被破坏，中止升级"

    info "  目标版本   : ${NEW_VERSION} (${NEW_COMMIT})"
    info "  目标 ref   : ${TARGET_REF}"

    if [[ "$NEW_COMMIT" == "$OLD_COMMIT" && "$NEW_VERSION" == "$OLD_VERSION" && "$FORCE" != true ]]; then
        die "当前已位于 ${TARGET_REF} 最新提交 (${NEW_COMMIT})，无需升级；如需强制重建请加 --force"
    fi
}

backup_database() {
    step_banner "升级前备份"

    if [[ "$SKIP_BACKUP" == true ]]; then
        warn "已指定 --skip-backup，跳过数据库备份（不建议在生产环境使用）"
        return 0
    fi

    local db_pass stamp
    db_pass="$(grep '^POSTGRES_PASSWORD=' "$CRED_FILE" | tail -1 | cut -d= -f2-)"
    [[ -n "$db_pass" ]] || die "未在 ${CRED_FILE} 找到 POSTGRES_PASSWORD，无法备份数据库"

    stamp="$(date +%Y%m%d_%H%M%S)"
    BACKUP_FILE="${BACKUP_DIR}/inspect-pre-upgrade-${stamp}.dump"
    run mkdir -p "$BACKUP_DIR"
    # 只读操作以 postgres 角色执行即可；密码经环境变量传递，不进 argv
    run_sh "PGPASSWORD='${db_pass}' pg_dump -h 127.0.0.1 -U inspect_user -d inspect_system -Fc -f '${BACKUP_FILE}'" \
        || die "数据库备份失败，中止升级（未做任何改动）"
    [[ "$DRY_RUN" == true ]] || run ls -lh "$BACKUP_FILE"
    success "数据库已备份: ${BACKUP_FILE}"
}

update_source() {
    step_banner "更新源码"
    # reset --hard 而非 clone：APP_SRC/data 是运行时数据目录
    # （systemd ReadWritePaths 与报告输出都指向这里），任何 clean 类操作都会把它清空
    run_sh "sudo -u ${APP_USER} git -C ${APP_SRC} reset --hard FETCH_HEAD" \
        || die "源码更新失败（git reset），数据库未受影响，可安全重试"
    run_sh "sudo -u ${APP_USER} git -C ${APP_SRC} log --oneline -1"
}

check_toolchain() {
    if [[ "$DRY_RUN" == true ]]; then
        dim "[dry-run] 跳过工具链检查"
        return 0
    fi

    local required installed
    required="$(grep -E '^go [0-9]' "$APP_SRC/backend-go/go.mod" 2>/dev/null | awk '{print $2}')"
    installed="$(/usr/local/go/bin/go env GOVERSION 2>/dev/null | sed 's/^go//')"
    [[ -n "$installed" ]] || die "未检测到 Go 工具链 (/usr/local/go)——升级脚本不负责安装依赖，请先完成初始部署"
    if [[ -n "$required" ]] && ! version_ge "$installed" "$required"; then
        die "Go ${installed} 低于 go.mod 要求的 ${required}，请先升级 Go 工具链后重试"
    fi

    command -v node >/dev/null 2>&1 || die "未检测到 node——请先完成初始部署"
    command -v pnpm >/dev/null 2>&1 || die "未检测到 pnpm——请先完成初始部署（corepack enable）"
    success "工具链就绪 (go ${installed})"
}

build_backend() {
    step_banner "构建后端 ${NEW_VERSION}"

    # 回滚副本：健康检查失败时还原此副本即恢复旧版服务。
    # 覆盖写（cp -f）：prev 只需保证「上一个可运行版本」，无需历史链。
    run cp -f "$APP_BIN/inspect-api" "$PREV_BIN"

    # 版本注入与 build-release.sh 同一机制：ldflags -X 覆盖 config 包默认值，
    # /health 返回的 version 随之变为真实发布版本。
    run_build "sudo -u ${APP_USER} env \
        HOME=${APP_ROOT} \
        GOCACHE=${APP_ROOT}/.cache/go-build \
        GOMODCACHE=${APP_ROOT}/.cache/go-mod \
        GOPROXY=${GOPROXY_URL} \
        PATH=/usr/local/go/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
        CGO_ENABLED=0 \
        go -C ${APP_SRC}/backend-go build \
        -ldflags=\"-s -w -X ${GO_CONFIG_PKG}.defaultAppVersion=${NEW_VERSION}\" \
        -o ${APP_BIN}/inspect-api.new ./cmd/api" \
        || die "后端构建失败（旧版服务仍在运行，未受影响）"

    run mv "${APP_BIN}/inspect-api.new" "${APP_BIN}/inspect-api"
    run chown "${APP_USER}:${APP_USER}" "$APP_BIN/inspect-api"
    run chmod 755 "$APP_BIN/inspect-api"
    success "后端二进制已替换（旧版保留于 ${PREV_BIN}）"
}

build_frontend() {
    step_banner "构建前端 ${NEW_VERSION}"

    run_build "cd ${APP_SRC}/frontend && sudo -u ${APP_USER} env HOME=${APP_ROOT} \
        npm_config_registry=${NPM_REGISTRY} \
        pnpm install --frozen-lockfile" \
        || die "前端依赖安装失败（旧版服务仍在运行，未受影响）"

    run_build "cd ${APP_SRC}/frontend && sudo -u ${APP_USER} env HOME=${APP_ROOT} \
        npm_config_registry=${NPM_REGISTRY} \
        NODE_OPTIONS='--max-old-space-size=${BUILD_MEM_MB}' NEXT_TELEMETRY_DISABLED=1 \
        NEXT_PUBLIC_APP_VERSION=${NEW_VERSION} \
        pnpm run build" \
        || die "前端构建失败（.next 产物可能处于中间态，旧版二进制未受影响；重跑本脚本即可重试）"

    success "前端构建完成"
}

rollback_and_die() {
    error "升级验证失败，正在回滚后端二进制……"
    if [[ -f "$PREV_BIN" ]]; then
        mv -f "$PREV_BIN" "${APP_BIN}/inspect-api"
        chown "${APP_USER}:${APP_USER}" "${APP_BIN}/inspect-api"
        systemctl restart "$BACKEND_UNIT" 2>/dev/null || true
        warn "已恢复旧版后端二进制并重启（版本 ${OLD_VERSION}）"
    fi
    echo
    error "回滚完成。前后端源码与前端产物仍是新版本，如需完全还原请在源码目录执行:"
    error "  sudo -u ${APP_USER} git -C ${APP_SRC} reset --hard ${OLD_COMMIT}"
    error "  然后重跑本脚本（会重新构建并覆盖为新检出内容的产物）"
    die "升级失败：${1:-后端健康检查未通过，请查看 journalctl -u ${BACKEND_UNIT} -n 100}"
}

restart_and_verify() {
    step_banner "重启并验证"

    run systemctl restart "$BACKEND_UNIT" "$FRONTEND_UNIT"

    info "  等待后端就绪（最多 60 秒）"
    local ok=false i
    if [[ "$DRY_RUN" != true ]]; then
        for i in $(seq 1 30); do
            if curl -fsS --max-time 3 "http://127.0.0.1:${BACKEND_PORT}/health" >/dev/null 2>&1; then
                ok=true; break
            fi
            sleep 2
        done
        [[ "$ok" == true ]] || rollback_and_die "后端 60 秒内未就绪"
    else
        dim "[dry-run] 跳过健康检查"
    fi

    # 版本断言：/health 的 version 必须等于目标版本号。这是「升级成功」的
    # 硬证据——进程活着不代表跑的是新版本（旧二进制残留、启动失败被
    # Restart=always 掩盖等形态都靠这一步识别）。
    if [[ "$DRY_RUN" != true ]]; then
        local live
        live="$(running_version)"
        [[ "$live" == "$NEW_VERSION" ]] || rollback_and_die "运行版本 (${live:-未知}) ≠ 目标版本 (${NEW_VERSION})"
        success "运行版本已确认为 ${NEW_VERSION}"
    fi

    if [[ "$DRY_RUN" != true ]]; then
        ok=false
        for i in $(seq 1 20); do
            if curl -fsS --max-time 3 -o /dev/null "http://127.0.0.1:${FRONTEND_PORT}" 2>/dev/null; then
                ok=true; break
            fi
            sleep 2
        done
        [[ "$ok" == true ]] || warn "前端未在 40 秒内就绪，请查看 journalctl -u ${FRONTEND_UNIT}"
    fi
}

final_banner() {
    echo
    if [[ "$DRY_RUN" == true ]]; then
        color "33" "==========================================================="
        warn "预演完成（--dry-run），未做任何实际改动"
        color "33" "==========================================================="
    else
        color "32" "==========================================================="
        success "升级完成: ${OLD_VERSION} (${OLD_COMMIT}) → ${NEW_VERSION} (${NEW_COMMIT})"
        color "32" "==========================================================="
        dim "  数据库备份: ${BACKUP_FILE:-（--skip-backup 未备份）}"
        dim "  旧版后端二进制保留于 ${PREV_BIN}（确认稳定后可删除）"
        dim "  回退到本版之前: 手工还原 ${PREV_BIN} 并 git reset --hard ${OLD_COMMIT}"
    fi
}

usage() {
    cat <<'USAGE'
企业级网络设备巡检系统 - Ubuntu 原生部署升级脚本

用法: sudo ./scripts/upgrade-ubuntu.sh [选项]

流程: 探测当前版本 → 拉取目标版本 → 升级前数据库备份 → 更新源码 →
      注入版本号构建前后端 → 原子替换 → 重启 → /health 版本断言；
      后端验证失败时自动回滚旧二进制并恢复服务。

选项:
  --version <ref>   升级目标：分支 / tag / commit（默认 main 最新）
  --force           目标与当前一致时仍强制重建
  --skip-backup     跳过升级前数据库备份（不建议在生产环境使用）
  --dry-run         仅打印将要执行的操作，不做任何改动
  --yes, -y         跳过交互确认
  --help, -h        显示本帮助

环境变量（与 deploy-ubuntu.sh 同名同义）:
  GOPROXY_URL / NPM_REGISTRY / BUILD_MEM_MB

说明:
  - 仅适用于已按 deploy-ubuntu.sh 完成部署的机器；不安装/升级 Go、Node 等依赖，
    新版本要求更高工具链时会在构建前明确报错
  - 数据库结构变更由后端启动迁移（DB_AUTO_MIGRATE）自动完成；
    .env 与 credentials.txt 全程保留不动
  - 跨多个版本升级前请先阅读发布说明：迁移只增不减，降级需用备份恢复数据库
USAGE
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --version)     TARGET_REF="${2:-}"; [[ -n "$TARGET_REF" ]] || die "--version 需要一个分支/tag/commit 参数"; shift 2 ;;
            --force)       FORCE=true; shift ;;
            --skip-backup) SKIP_BACKUP=true; shift ;;
            --dry-run)     DRY_RUN=true; shift ;;
            --yes|-y)      ASSUME_YES=true; shift ;;
            --help|-h)     HELP=true; shift ;;
            *) die "未知参数: $1（使用 --help 查看用法）" ;;
        esac
    done
}

main() {
    parse_args "$@"
    if [[ "$HELP" == true ]]; then usage; exit 0; fi

    preflight

    step_banner "巡检系统升级"
    info "目标:   ${TARGET_REF}"
    if [[ "$DRY_RUN" == true ]]; then info "模式:   预演（不做任何改动）"; fi
    if [[ "$SKIP_BACKUP" == true ]]; then warn "备份:   已跳过（--skip-backup）"; fi

    probe_current
    resolve_target
    check_toolchain

    confirm "确认升级到 ${NEW_VERSION} (${NEW_COMMIT})？" || die "用户取消"

    backup_database
    update_source
    build_backend
    build_frontend
    restart_and_verify
    final_banner
}

# 非交互环境（CI/管道）必须显式 -y / --dry-run / --help，避免 confirm 的 read
# 阻塞或误读输入。逐参数精确匹配而非 *-y* 通配，防止参数值撞上子串。
need_tty=true
for arg in "$@"; do
    case "$arg" in
        -y|--yes|--dry-run|-h|--help) need_tty=false ;;
    esac
done
if [[ ! -t 0 && "$need_tty" == true ]]; then
    echo "非交互环境请显式使用 --yes（或 --dry-run）执行" >&2
    exit 1
fi

main "$@"
