#!/usr/bin/env bash
# 一键安装引导（Ubuntu 生产环境，原生部署，无 Docker）
#
# 用法（推荐先审阅再执行）:
#   curl -fsSL https://raw.githubusercontent.com/Izumi0527/inspect/main/scripts/install.sh -o install.sh
#   less install.sh && sudo bash install.sh --domain inspect.example.com
#
# 一键形态:
#   curl -fsSL https://raw.githubusercontent.com/Izumi0527/inspect/main/scripts/install.sh \
#     | sudo bash -s -- --domain inspect.example.com
#
# 环境变量:
#   INSPECT_REF        指定分支或 tag（默认 main；生产建议锁定 tag，如 v1.1.1）
#   INSPECT_STAGE_DIR  源码中转目录（默认 /usr/local/src/inspect）
#
# 设计约束:
#   1. 本脚本只做「引导」，不实现任何部署逻辑；所有实际动作由 scripts/deploy-ubuntu.sh 承担。
#   2. 源码克隆到中转目录而非 /opt/inspect/app：后者由 deploy-ubuntu.sh 以 inspect 用户身份
#      管理，若在此处预先以 root 克隆，后续 `sudo -u inspect git pull` 会因属主不符而失败。
#   3. 全部逻辑包在 main() 内、最后一行才调用：确保脚本未完整下载时不会执行到一半。
#   4. 交接前「先判非交互意图，再判终端」，顺序不可颠倒：显式 `< /dev/tty` 的本意是让
#      管道执行下的 confirm() 读到真实输入（stdin 已被脚本自身读空），但「/dev/tty 可
#      打开」不等于「进程在前台进程组」。CI、nohup、ssh host cmd 等后台场景下把 stdin
#      接过去，子进程一读就收到 SIGTTIN 被停止（State: T），表现为永久静默挂起。

set -euo pipefail

main() {
    local REPO_URL="https://github.com/Izumi0527/inspect.git"
    local REF="${INSPECT_REF:-main}"
    local STAGE_DIR="${INSPECT_STAGE_DIR:-/usr/local/src/inspect}"

    # ---------- 输出 helper ----------
    local C_INFO=36 C_OK=32 C_WARN=33 C_ERR=31
    say() { local c="$1"; shift; if [[ -t 1 ]]; then printf '\033[%sm%s\033[0m\n' "$c" "$*"; else printf '%s\n' "$*"; fi; }
    info() { say "$C_INFO" "$*"; }
    ok()   { say "$C_OK" "✅ $*"; }
    warn() { say "$C_WARN" "⚠️  $*"; }
    die()  { say "$C_ERR" "❌ $*" >&2; exit 1; }

    # ---------- 前置校验 ----------
    [[ "$(id -u)" -eq 0 ]] || die "需要 root 权限，请使用 sudo 执行（例如 curl ... | sudo bash -s -- --domain x）"

    [[ -r /etc/os-release ]] || die "无法读取 /etc/os-release，当前系统不受支持"
    # shellcheck disable=SC1091
    . /etc/os-release
    if [[ "${ID:-}" != "ubuntu" ]]; then
        die "当前仅支持 Ubuntu Server LTS，检测到: ${PRETTY_NAME:-${ID:-unknown}}"
    fi

    case "$(uname -m)" in
        x86_64|amd64|aarch64|arm64) ;;
        *) die "不受支持的架构: $(uname -m)（仅支持 x86_64 / aarch64）" ;;
    esac

    info "系统: ${PRETTY_NAME:-ubuntu} ($(uname -m))"

    # ---------- 依赖 ----------
    local missing=()
    command -v git >/dev/null 2>&1 || missing+=(git)
    command -v curl >/dev/null 2>&1 || missing+=(curl ca-certificates)
    if [[ ${#missing[@]} -gt 0 ]]; then
        info "安装引导依赖: ${missing[*]}"
        # -o DPkg::Lock::Timeout: 新装机上 unattended-upgrades 常在后台持有
        # dpkg 锁，apt 默认无限期等待且安静模式会吞掉等待提示，表现为静默挂死。
        DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=300 update -q \
            || die "apt-get update 失败，请检查网络与 apt 源"
        DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=300 \
            install -y -q "${missing[@]}" \
            || die "安装 ${missing[*]} 失败"
    fi

    # ---------- git 网络操作封装 ----------
    # 跨境链路对 github.com 偶发 TLS 中断（GnuTLS -110 / schannel 握手失败），与
    # deploy-ubuntu.sh 中 CURL_RETRY_OPTS 应对的是同一类问题，此处为 git 补齐等价防护。
    # 按失败原因分流：网络抖动重试有意义，ref 不存在则重试多少次都是徒劳，且必须
    # 把 git 的原始报错透传给用户，不替他臆断原因（否则会把排查引向错误方向）。
    # 返回码：0=成功；1=网络故障且重试耗尽；2=其余原因（原始报错已写入 stderr）。
    git_net_run() {
        local what="$1"; shift
        local max=3 attempt delay out
        for ((attempt = 1; attempt <= max; attempt++)); do
            if out="$("$@" 2>&1)"; then
                return 0
            fi
            # 仅在命中已知网络特征时才重试；识别不出的一律原样透传，宁可不重试也不误导
            if ! grep -qiE 'gnutls|schannel|openssl|ssl_read|ssl connect|ssl/tls|could not resolve|failed to connect|connection (reset|refused|timed out)|operation timed out|network is unreachable|early eof|rpc failed|transfer closed|empty reply|timed out after' <<<"$out"; then
                printf '%s\n' "$out" >&2
                return 2
            fi
            if [[ "$attempt" -lt "$max" ]]; then
                delay=$((attempt * 3))
                warn "${what}失败（网络原因，第 ${attempt}/${max} 次），${delay}s 后重试"
                sleep "$delay"
            else
                printf '%s\n' "$out" >&2
            fi
        done
        return 1
    }

    # ---------- 同步源码到中转目录 ----------
    info "同步源码 → ${STAGE_DIR} (ref: ${REF})"
    if [[ -e "$STAGE_DIR" && ! -d "$STAGE_DIR/.git" ]]; then
        die "${STAGE_DIR} 已存在且不是 git 仓库，请先移除或改用 INSPECT_STAGE_DIR 指定其他目录"
    fi

    local sync_rc=0
    if [[ -d "$STAGE_DIR/.git" ]]; then
        git -C "$STAGE_DIR" remote set-url origin "$REPO_URL"
        git_net_run "拉取 ref '${REF}'" git -C "$STAGE_DIR" fetch --depth 1 origin "$REF" || sync_rc=$?
        case "$sync_rc" in
            0) ;;
            1) die "拉取 ref '${REF}' 失败：与 GitHub 的连接不稳定，重试 3 次仍未成功；请检查网络或代理后重新执行" ;;
            *) die "拉取 ref '${REF}' 失败，git 原始报错见上；若提示 couldn't find remote ref，说明该分支或 tag 在远端不存在" ;;
        esac
        git -C "$STAGE_DIR" reset --hard FETCH_HEAD >/dev/null
        git -C "$STAGE_DIR" clean -fdx >/dev/null
    else
        mkdir -p "$(dirname "$STAGE_DIR")"
        git_net_run "克隆仓库" git clone --depth 1 --branch "$REF" "$REPO_URL" "$STAGE_DIR" || sync_rc=$?
        case "$sync_rc" in
            0) ;;
            1) die "克隆仓库失败：与 GitHub 的连接不稳定，重试 3 次仍未成功；请检查网络或代理后重新执行" ;;
            *) die "克隆失败，git 原始报错见上；若提示 Remote branch not found，说明 ref '${REF}' 在远端不存在" ;;
        esac
    fi

    local head_sha
    head_sha="$(git -C "$STAGE_DIR" rev-parse --short HEAD)"
    ok "源码就绪: ${REF} @ ${head_sha}"

    local deploy="${STAGE_DIR}/scripts/deploy-ubuntu.sh"
    [[ -f "$deploy" ]] || die "未找到部署脚本: ${deploy}（仓库结构可能已变更）"

    # ---------- 交接给部署脚本 ----------
    # 已声明非交互意图的，直接断开 stdin 交接，不碰 /dev/tty。
    # 这一分支必须在终端检测之前：这些参数下 confirm() 根本不读 stdin，
    # 而把 stdin 接到 /dev/tty 反而会在后台进程组场景把 apt 的 postinst 挂死。
    # 用 </dev/null 而非原样继承：curl|bash 下 stdin 已被读空，显式给 EOF 更确定。
    local arg
    for arg in "$@"; do
        case "$arg" in
            -y|--yes|--dry-run|-h|--help)
                info "移交部署脚本（非交互）: scripts/deploy-ubuntu.sh $*"
                exec bash "$deploy" "$@" </dev/null
                ;;
        esac
    done

    # 需要交互确认：既要 /dev/tty 可打开，还要本进程处于该终端的前台进程组，
    # 否则子进程读 stdin 会触发 SIGTTIN 停止。ps 的 stat 字段含 '+' 即前台。
    # ps 不可用时该判断为假，落到下方 die，属安全降级——宁可要求显式 --yes，
    # 也不能静默挂起。
    if (exec 3</dev/tty) 2>/dev/null \
        && [[ "$(ps -o stat= -p $$ 2>/dev/null)" == *+* ]]; then
        info "移交部署脚本: scripts/deploy-ubuntu.sh $*"
        exec bash "$deploy" "$@" </dev/tty
    fi

    die "未检测到可交互的控制终端（或当前不在前台进程组）；请追加 --yes 显式确认非交互部署（或先用 --dry-run 预演）"
}

main "$@"
