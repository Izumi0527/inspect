#!/usr/bin/env bash
# 企业级网络设备巡检系统 - Ubuntu 生产环境卸载脚本（对应 deploy-ubuntu.sh）
#
# 用法:
#   sudo ./scripts/uninstall.sh                    # 卸载应用，保留数据库与备份
#   sudo ./scripts/uninstall.sh --dry-run          # 预演，不做任何改动
#   sudo ./scripts/uninstall.sh --purge-data       # 额外删除数据库、凭据、备份、系统用户
#   sudo ./scripts/uninstall.sh --purge-monitoring # 额外移除 Prometheus/Grafana 服务
#   sudo ./scripts/uninstall.sh --reset-firewall   # 额外撤销本项目新增的 ufw 规则
#
# 安全设计:
#   1. 默认「可逆卸载」：停服务、删单元、删源码与构建产物，但保留 PostgreSQL 数据、
#      /opt/inspect/config（含 credentials.txt）与 /opt/inspect/backups。
#   2. 破坏性操作需双重确认：既要显式传 --purge-data，又要手工键入 DELETE（--yes 可跳过）。
#   3. 绝不自动卸载 postgresql / redis / nginx / node / go 等共享软件包，它们可能被其他服务使用；
#      仅移除本项目写入的配置块与单元文件，最后打印残留清单供人工决策。
#   4. 绝不自动修改 /etc/fstab 的 pgdata 挂载项，也绝不格式化或卸载数据盘。
#   5. 全流程幂等：资源不存在时静默跳过，可重复执行。

set -euo pipefail

APP_USER="inspect"
APP_ROOT="/opt/inspect"
APP_SRC="$APP_ROOT/app"
APP_BIN="$APP_ROOT/bin"
APP_CONF="$APP_ROOT/config"
APP_LOGS="$APP_ROOT/logs"
STAGE_DIR="/usr/local/src/inspect"

DB_NAME="inspect_system"
DB_ROLE="inspect_user"

DRY_RUN=false
ASSUME_YES=false
PURGE_DATA=false
PURGE_MONITORING=false
RESET_FIREWALL=false
HELP=false

# ==========================================
# 输出与执行 helper（与 deploy-ubuntu.sh 保持一致）
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

run() {
    if [[ "$DRY_RUN" == true ]]; then dim "[dry-run] $*"; return 0; fi
    "$@"
}

run_sh() {
    if [[ "$DRY_RUN" == true ]]; then dim "[dry-run] $*"; return 0; fi
    bash -c "$*"
}

confirm() {
    [[ "$ASSUME_YES" == true ]] && return 0
    [[ "$DRY_RUN" == true ]] && return 0
    local prompt="$1" reply
    read -r -p "$prompt [y/N] " reply
    [[ "$reply" =~ ^[Yy]$ ]]
}

# 破坏性操作的第二道闸：要求键入字面量 DELETE
confirm_destructive() {
    [[ "$ASSUME_YES" == true ]] && return 0
    [[ "$DRY_RUN" == true ]] && return 0
    local reply
    warn "此操作不可恢复。请键入 DELETE 确认，其他任何输入均视为取消。"
    read -r -p "> " reply
    [[ "$reply" == "DELETE" ]]
}

usage() {
    cat <<'USAGE'
企业级网络设备巡检系统 - Ubuntu 卸载脚本

用法: sudo ./scripts/uninstall.sh [选项]

选项:
  --purge-data         删除 PostgreSQL 数据库与角色、/opt/inspect 全部内容
                       （含 config/credentials.txt 与 backups/）以及 inspect 系统用户
                       不可恢复，需二次键入 DELETE 确认
  --purge-monitoring   停用并移除 Prometheus / node_exporter / Grafana 服务与数据目录
  --reset-firewall     撤销本项目新增的 ufw 规则（5514/tcp、5514/udp、162/udp）
                       不会改动 22 / 80 / 443
  --yes, -y            跳过所有交互确认（含 DELETE 二次确认）
  --dry-run            仅打印将要执行的操作，不做任何改动
  --help, -h           显示本帮助

默认行为（不带任何 purge 选项）:
  停止并移除 inspect-backend / inspect-frontend 服务、Nginx 站点与自签证书、
  logrotate / sysctl / apt 重试配置、Redis 配置块、备份 cron，删除源码与构建产物；
  保留数据库、/opt/inspect/config、/opt/inspect/backups 与中转目录
  /usr/local/src/inspect（本脚本自身所在处，保证可重复执行）。

始终不会自动执行:
  卸载 postgresql / redis / nginx / nodejs / go 等共享软件包；
  修改 /etc/fstab；卸载或格式化 pgdata 数据盘。
USAGE
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --purge-data)       PURGE_DATA=true; shift ;;
            --purge-monitoring) PURGE_MONITORING=true; shift ;;
            --reset-firewall)   RESET_FIREWALL=true; shift ;;
            --dry-run)          DRY_RUN=true; shift ;;
            --yes|-y)           ASSUME_YES=true; shift ;;
            --help|-h)          HELP=true; shift ;;
            *) die "未知参数: $1（使用 --help 查看用法）" ;;
        esac
    done
}

# ==========================================
# 单个资源的移除动作（全部幂等）
# ==========================================

remove_unit() {
    local unit="$1"
    local path="/etc/systemd/system/${unit}"
    if systemctl is-active --quiet "$unit" 2>/dev/null; then
        info "  停止 $unit"
        run systemctl stop "$unit"
    fi
    if systemctl is-enabled --quiet "$unit" 2>/dev/null; then
        info "  取消开机自启 $unit"
        run_sh "systemctl disable '$unit' >/dev/null 2>&1 || true"
    fi
    if [[ -f "$path" ]]; then
        info "  删除单元文件 $path"
        run rm -f "$path"
    fi
}

# 删除 write_managed_block 写入的受管配置块，保留文件其余内容
remove_managed_block() {
    local file="$1" marker="${2:-INSPECT}"
    [[ -f "$file" ]] || return 0
    grep -qF "# ===== BEGIN ${marker} =====" "$file" || return 0
    info "  移除受管配置块 ${marker} <- $file"
    run_sh "sed -i '/^# ===== BEGIN ${marker} =====\$/,/^# ===== END ${marker} =====\$/d' '$file'"
}

stop_services() {
    step_banner "步骤 1/7  停止并移除应用服务"
    remove_unit inspect-frontend.service
    remove_unit inspect-backend.service
    run systemctl daemon-reload
    run_sh "systemctl reset-failed >/dev/null 2>&1 || true"
    success "应用服务已移除"
}

remove_nginx() {
    step_banner "步骤 2/7  移除 Nginx 站点与自签证书"
    if ! command -v nginx >/dev/null 2>&1; then
        dim "  未安装 Nginx，跳过"
        return 0
    fi
    if [[ -L /etc/nginx/sites-enabled/inspect ]]; then
        info "  删除 sites-enabled/inspect"
        run rm -f /etc/nginx/sites-enabled/inspect
    fi
    if [[ -f /etc/nginx/sites-available/inspect ]]; then
        info "  删除 sites-available/inspect"
        run rm -f /etc/nginx/sites-available/inspect
    fi
    local f
    # 含 .bak.<时间戳>：重新签发 SAN 证书时会留下旧证书副本，一并清理。
    # glob 无匹配时 bash 保留字面量，下方 -f 判断会跳过，无需 nullglob。
    for f in /etc/nginx/ssl/inspect.crt /etc/nginx/ssl/inspect.key \
             /etc/nginx/ssl/inspect.crt.bak.* /etc/nginx/ssl/inspect.key.bak.*; do
        if [[ -f "$f" ]]; then
            info "  删除 $f"
            run rm -f "$f"
        fi
    done

    # 仅在配置校验通过时才 reload，避免把 Nginx 整体搞挂
    if [[ "$DRY_RUN" == true ]]; then
        dim "[dry-run] nginx -t && systemctl reload nginx"
    elif nginx -t >/dev/null 2>&1; then
        systemctl reload nginx 2>/dev/null || true
        success "Nginx 已重新加载"
    else
        warn "Nginx 配置校验未通过，已跳过 reload；请手工检查 nginx -t"
    fi

    if [[ ! -e /etc/nginx/sites-enabled/default ]]; then
        warn "Nginx 已无启用站点（部署脚本曾删除 default），如需恢复默认页请手工处理"
    fi
}

remove_ops_config() {
    step_banner "步骤 3/7  移除运维配置（cron / logrotate / sysctl / redis）"

    if id "$APP_USER" >/dev/null 2>&1; then
        if crontab -u "$APP_USER" -l 2>/dev/null | grep -qF 'backup-db.sh'; then
            info "  清理 ${APP_USER} 的备份 cron"
            run_sh "crontab -u ${APP_USER} -l 2>/dev/null | grep -vF 'backup-db.sh' | crontab -u ${APP_USER} -"
        fi
    fi

    if [[ -f /etc/logrotate.d/inspect ]]; then
        info "  删除 /etc/logrotate.d/inspect"
        run rm -f /etc/logrotate.d/inspect
    fi

    # deploy-ubuntu.sh 步骤 1 写入的 apt 重试配置（整文件由本项目创建，直接删除）
    if [[ -f /etc/apt/apt.conf.d/99-inspect-retries ]]; then
        info "  删除 /etc/apt/apt.conf.d/99-inspect-retries"
        run rm -f /etc/apt/apt.conf.d/99-inspect-retries
    fi

    if [[ -f /etc/sysctl.d/99-inspect.conf ]]; then
        info "  删除 /etc/sysctl.d/99-inspect.conf"
        run rm -f /etc/sysctl.d/99-inspect.conf
        run_sh "sysctl --system >/dev/null 2>&1 || true"
    fi

    if [[ -f /etc/redis/redis.conf ]]; then
        remove_managed_block /etc/redis/redis.conf INSPECT
        if systemctl is-active --quiet redis-server 2>/dev/null; then
            info "  重启 redis-server 以应用配置"
            run systemctl restart redis-server
        fi
    fi

    success "运维配置已清理"
}

remove_app_files() {
    step_banner "步骤 4/7  删除源码与构建产物"

    local d
    for d in "$APP_SRC" "$APP_BIN" "$APP_LOGS" "$APP_ROOT/data"; do
        if [[ -e "$d" ]]; then
            info "  删除 $d"
            run rm -rf "$d"
        fi
    done

    # 中转目录刻意保留：本脚本自身就在其中（install.sh 克隆到此处），删掉它等于在执行过程中
    # 删除自己——bash 惰性读取脚本文件，可能导致执行截断；且用户随后无法再次运行卸载
    # （例如先默认卸载、稍后再 --purge-data），只能重新下载。它仅占数十 MB，交由人工决定。
    if [[ -d "$STAGE_DIR" ]]; then
        warn "已保留一键安装中转目录: ${STAGE_DIR}（含本卸载脚本；确认无需重跑后可手工 rm -rf 该目录）"
    fi

    if [[ "$PURGE_DATA" != true ]]; then
        [[ -d "$APP_CONF" ]] && warn "已保留配置与凭据: $APP_CONF（含 credentials.txt）"
        [[ -d "$APP_ROOT/backups" ]] && warn "已保留数据库备份: ${APP_ROOT}/backups"
    fi
    success "应用文件已删除"
}

remove_monitoring() {
    step_banner "步骤 5/7  移除监控组件"
    if [[ "$PURGE_MONITORING" != true ]]; then
        dim "  未指定 --purge-monitoring，跳过（Prometheus / Grafana 保持原状）"
        return 0
    fi

    remove_unit prometheus.service
    local u
    for u in prometheus-node-exporter.service grafana-server.service; do
        if systemctl is-enabled --quiet "$u" 2>/dev/null || systemctl is-active --quiet "$u" 2>/dev/null; then
            info "  停用 $u"
            run_sh "systemctl disable --now '$u' >/dev/null 2>&1 || true"
        fi
    done
    run systemctl daemon-reload

    local d
    for d in /etc/prometheus /var/lib/prometheus; do
        if [[ -e "$d" ]]; then
            info "  删除 $d"
            run rm -rf "$d"
        fi
    done
    if id prometheus >/dev/null 2>&1; then
        info "  删除 prometheus 系统用户"
        run_sh "userdel prometheus 2>/dev/null || echo '删除 prometheus 用户失败，请手工检查' >&2"
    fi

    warn "apt 包 prometheus-node-exporter / grafana 与 apt 源未卸载，如需彻底移除："
    dim "    apt-get purge -y prometheus-node-exporter grafana"
    dim "    rm -f /etc/apt/sources.list.d/grafana.list /etc/apt/keyrings/grafana.gpg"
    success "监控组件已移除"
}

reset_firewall() {
    step_banner "步骤 6/7  撤销防火墙规则"
    if [[ "$RESET_FIREWALL" != true ]]; then
        dim "  未指定 --reset-firewall，跳过"
        return 0
    fi
    if ! command -v ufw >/dev/null 2>&1; then
        dim "  未安装 ufw，跳过"
        return 0
    fi
    # 只撤本项目新增的应用端口，绝不触碰 22 / 80 / 443
    local rule
    for rule in '5514/tcp' '5514/udp' '162/udp'; do
        info "  删除 ufw 规则 $rule"
        run_sh "ufw --force delete allow ${rule} >/dev/null 2>&1 || true"
    done
    success "已撤销 Syslog / SNMP Trap 规则（SSH、HTTP、HTTPS 保持不变）"
}

purge_data() {
    step_banner "步骤 7/7  删除数据（数据库 / 凭据 / 备份 / 系统用户）"
    if [[ "$PURGE_DATA" != true ]]; then
        dim "  未指定 --purge-data，跳过"
        info "如需彻底删除数据，重新执行并追加 --purge-data"
        return 0
    fi

    error "即将永久删除以下内容："
    echo "  - PostgreSQL 数据库 ${DB_NAME} 及角色 ${DB_ROLE}（全部巡检数据、设备档案、审计日志）"
    echo "  - ${APP_ROOT}（含 config/credentials.txt 与 backups/ 下的全部备份）"
    echo "  - 系统用户 ${APP_USER}"
    echo
    confirm_destructive || die "已取消，未删除任何数据"

    if command -v psql >/dev/null 2>&1 && systemctl is-active --quiet postgresql 2>/dev/null; then
        info "  断开会话并删除数据库 ${DB_NAME}"
        run_sh "sudo -u postgres psql -q -c \"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}' AND pid <> pg_backend_pid();\" >/dev/null 2>&1 || true"
        run_sh "sudo -u postgres dropdb --if-exists ${DB_NAME}"
        info "  删除角色 ${DB_ROLE}"
        run_sh "sudo -u postgres psql -q -c 'DROP ROLE IF EXISTS ${DB_ROLE};' >/dev/null 2>&1 || echo '删除角色失败（可能仍被其他对象引用），请手工检查' >&2"
    else
        warn "PostgreSQL 未运行或未安装，跳过数据库删除；如稍后需要手工执行："
        dim "    sudo -u postgres dropdb --if-exists ${DB_NAME}"
        dim "    sudo -u postgres psql -c 'DROP ROLE IF EXISTS ${DB_ROLE};'"
    fi

    if [[ -e "$APP_ROOT" ]]; then
        info "  删除 $APP_ROOT"
        run rm -rf "$APP_ROOT"
    fi

    if id "$APP_USER" >/dev/null 2>&1; then
        info "  删除系统用户 ${APP_USER}"
        run_sh "pkill -u ${APP_USER} 2>/dev/null || true"
        run_sh "userdel -r ${APP_USER} 2>/dev/null || userdel ${APP_USER} 2>/dev/null || echo '删除用户 ${APP_USER} 失败，请手工检查' >&2"
    fi

    success "数据已彻底删除"
}

print_residue() {
    step_banner "残留清单（需人工决策，脚本不自动处理）"
    cat <<'RESIDUE'
以下资源为系统级或可能被其他服务共享，本脚本不会自动移除：

  软件包    postgresql-16 / timescaledb / redis-server / nginx / nodejs / ufw
            如确认无其他用途:  apt-get purge -y <包名> && apt-get autoremove -y

  Go 工具链 /usr/local/go 与 /etc/profile.d/go.sh
            如确认无其他用途:  rm -rf /usr/local/go /etc/profile.d/go.sh

  apt 源    /etc/apt/sources.list.d/timescaledb.list
            （--purge-monitoring 还会提示 grafana.list）

  数据盘    /etc/fstab 中的 LABEL=pgdata /var/lib/postgresql 挂载项
            本脚本绝不修改 fstab、不卸载也不格式化该磁盘；
            如需回收，请先确认磁盘内容后手工处理。

  时间同步  chrony（系统级服务，未改动）

  中转目录  /usr/local/src/inspect（install.sh 克隆的源码，含本卸载脚本自身）
            确认不再需要重跑卸载后:  rm -rf /usr/local/src/inspect
RESIDUE
}

main() {
    parse_args "$@"
    if [[ "$HELP" == true ]]; then usage; exit 0; fi

    [[ "$(id -u)" -eq 0 ]] || die "需要 root 权限，请使用 sudo 执行"

    step_banner "巡检系统卸载"
    if [[ "$DRY_RUN" == true ]]; then info "模式:        预演（不做任何改动）"; else info "模式:        实际执行"; fi
    if [[ "$PURGE_DATA" == true ]]; then info "删除数据:    是（数据库 + 凭据 + 备份 + 用户）"; else info "删除数据:    否（保留数据库、config、backups）"; fi
    if [[ "$PURGE_MONITORING" == true ]]; then info "移除监控:    是"; else info "移除监控:    否"; fi
    if [[ "$RESET_FIREWALL" == true ]]; then info "撤销防火墙:  是（仅 5514、162）"; else info "撤销防火墙:  否"; fi

    confirm "确认开始卸载？" || die "用户取消"

    stop_services
    remove_nginx
    remove_ops_config
    remove_app_files
    remove_monitoring
    reset_firewall
    purge_data
    print_residue

    echo
    if [[ "$DRY_RUN" == true ]]; then
        success "预演完成，未做任何改动"
    else
        success "卸载完成"
    fi
}

main "$@"
