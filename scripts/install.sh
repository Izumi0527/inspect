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
#   4. 交接时显式 `< /dev/tty` 重定向：管道执行下 stdin 已被脚本自身占用且读空，
#      deploy-ubuntu.sh 的 confirm() 会直接读到 EOF，静默跳过高危操作确认。

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
        DEBIAN_FRONTEND=noninteractive apt-get update -qq \
            || die "apt-get update 失败，请检查网络与 apt 源"
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${missing[@]}" \
            || die "安装 ${missing[*]} 失败"
    fi

    # ---------- 同步源码到中转目录 ----------
    info "同步源码 → ${STAGE_DIR} (ref: ${REF})"
    if [[ -e "$STAGE_DIR" && ! -d "$STAGE_DIR/.git" ]]; then
        die "${STAGE_DIR} 已存在且不是 git 仓库，请先移除或改用 INSPECT_STAGE_DIR 指定其他目录"
    fi

    if [[ -d "$STAGE_DIR/.git" ]]; then
        git -C "$STAGE_DIR" remote set-url origin "$REPO_URL"
        git -C "$STAGE_DIR" fetch --depth 1 origin "$REF" \
            || die "拉取 ref '${REF}' 失败，请确认分支或 tag 是否存在"
        git -C "$STAGE_DIR" reset --hard FETCH_HEAD >/dev/null
        git -C "$STAGE_DIR" clean -fdx >/dev/null
    else
        mkdir -p "$(dirname "$STAGE_DIR")"
        git clone --depth 1 --branch "$REF" "$REPO_URL" "$STAGE_DIR" \
            || die "克隆失败，请确认网络可访问 GitHub 且 ref '${REF}' 存在"
    fi

    local head_sha
    head_sha="$(git -C "$STAGE_DIR" rev-parse --short HEAD)"
    ok "源码就绪: ${REF} @ ${head_sha}"

    local deploy="${STAGE_DIR}/scripts/deploy-ubuntu.sh"
    [[ -f "$deploy" ]] || die "未找到部署脚本: ${deploy}（仓库结构可能已变更）"

    # ---------- 交接给部署脚本 ----------
    # 有可用控制终端时把 stdin 接回终端，保留 deploy-ubuntu.sh 的交互确认；
    # 无终端（CI、无人值守）时要求调用方显式声明非交互意图，避免高危操作被静默确认。
    if (exec 3</dev/tty) 2>/dev/null; then
        info "移交部署脚本: scripts/deploy-ubuntu.sh $*"
        exec bash "$deploy" "$@" </dev/tty
    fi

    local arg
    for arg in "$@"; do
        case "$arg" in
            -y|--yes|--dry-run|-h|--help)
                warn "未检测到控制终端，以非交互模式继续"
                exec bash "$deploy" "$@"
                ;;
        esac
    done

    die "未检测到控制终端，且未指定 --yes；请追加 --yes 显式确认非交互部署（或先用 --dry-run 预演）"
}

main "$@"
