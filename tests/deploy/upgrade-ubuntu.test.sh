#!/usr/bin/env bash
# scripts/upgrade-ubuntu.sh —— 升级入口回归测试
#
# 测试手法与 deploy-ubuntu.test.sh 一致：awk 提取顶层函数定义后 eval（不能
# source 整个脚本——末尾 main "$@" 会立即执行），依赖替身补齐外部符号。

set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
TARGET="$PROJECT_ROOT/scripts/upgrade-ubuntu.sh"

PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
ng() { FAIL=$((FAIL + 1)); printf '  \033[31m✗\033[0m %s\n' "$1"; [[ $# -gt 1 ]] && printf '      %s\n' "$2"; }

[[ -f "$TARGET" ]] || { printf '未找到被测脚本: %s\n' "$TARGET" >&2; exit 1; }

extract_fn() {
    awk -v fn="$1" '
        index($0, fn "() {") == 1 { capture = 1 }
        capture                   { print }
        capture && $0 == "}"      { exit }
    ' "$TARGET"
}

printf '\n\033[36mscripts/upgrade-ubuntu.sh — 参数与版本逻辑\033[0m\n'

# ---------- 用例 1：--version 默认 main ----------
PA_SRC="$(extract_fn parse_args)"
if [[ -z "$PA_SRC" ]]; then
    ng "未能提取 parse_args() 定义"
else
    probe="$(mktemp)"
    {
        printf "TARGET_REF=main\nFORCE=false\nSKIP_BACKUP=false\nDRY_RUN=false\nASSUME_YES=false\nHELP=false\n"
        printf 'die() { echo "DIE:$*"; exit 99; }\n'
        printf '%s\n' "$PA_SRC"
        printf '%s\n' 'parse_args --version v9.9.9; echo "REF=$TARGET_REF"'
    } >"$probe"
    out="$(bash "$probe" 2>&1)"
    rm -f "$probe"
    grep -q 'REF=v9.9.9' <<<"$out" \
        && ok "--version 参数生效" \
        || ng "--version 未生效" "$out"
fi

# ---------- 用例 2：目标 ref 默认 main ----------
grep -q '^TARGET_REF="main"' "$TARGET" \
    && ok "升级目标默认 main 最新" \
    || ng "默认升级目标不是 main"

# ---------- 用例 3：未知参数必须拒绝 ----------
if [[ -n "${PA_SRC:-}" ]]; then
    probe="$(mktemp)"
    {
        printf "TARGET_REF=main\nDRY_RUN=false\nASSUME_YES=false\nHELP=false\n"
        printf 'die() { echo "DIE:$*"; exit 99; }\n'
        printf '%s\n' "$PA_SRC"
        printf '%s\n' 'parse_args --bogus'
    } >"$probe"
    out="$(bash "$probe" 2>&1)"; rc=$?
    rm -f "$probe"
    [[ $rc -eq 99 ]] \
        && ok "未知参数被拒绝（退出码 99）" \
        || ng "未知参数未被拒绝" "rc=$rc out=$out"
else
    ng "跳过未知参数用例（parse_args 未提取）"
fi

# ---------- 用例 4：version_ge 语义比较 ----------
VG_SRC="$(extract_fn version_ge)"
if [[ -z "$VG_SRC" ]]; then
    ng "未能提取 version_ge() 定义"
else
    eval "$VG_SRC"
    version_ge 1.23.5 1.23   && ok "1.23.5 ≥ 1.23（go 版本检测语义）" || ng "1.23.5 ≥ 1.23 判断错误"
    version_ge 1.23 1.23     && ok "1.23 ≥ 1.23（相等通过）"        || ng "相等版本判断错误"
    if version_ge 1.22 1.23; then
        ng "1.22 ≥ 1.23 判断错误（应为否）"
    else
        ok "1.22 < 1.23 正确判否"
    fi
fi

printf '\n\033[36m升级安全网（静态断言）\033[0m\n'

# ---------- 用例 5：升级前默认备份数据库 ----------
grep -q 'pg_dump -h 127.0.0.1 -U inspect_user -d inspect_system -Fc' "$TARGET" \
    && ok "内置 pg_dump 升级前备份" \
    || ng "缺少升级前数据库备份" "生产升级没有回退数据就是裸奔"
grep -q -- '--skip-backup' "$TARGET" \
    && ok "提供 --skip-backup 显式跳过" \
    || ng "缺少 --skip-backup 参数"

# ---------- 用例 6：失败自动回滚旧二进制 ----------
grep -q 'inspect-api.prev' "$TARGET" \
    && ok "升级前保留旧版二进制（inspect-api.prev）" \
    || ng "无旧版二进制副本" "新版本起不来时服务无法恢复"
grep -q 'rollback_and_die' "$TARGET" \
    && ok "验证失败走回滚路径" \
    || ng "缺少回滚处理"

# ---------- 用例 7：源码更新不得清空运行时数据 ----------
grep -q 'reset --hard FETCH_HEAD' "$TARGET" \
    && ok "源码更新用 reset --hard（保留未跟踪文件）" \
    || ng "源码更新方式未用 reset --hard"
# 断言的是实际命令而非全文：脚本注释里解释「为什么不用 clean -fdx」属正常
US_SRC="$(extract_fn update_source)"
if [[ -z "$US_SRC" ]]; then
    ng "未能提取 update_source() 定义"
elif grep -q 'clean -fdx' <<<"$US_SRC"; then
    ng "update_source 含 clean -fdx" "APP_SRC/data 是运行时数据目录，clean -fdx 会清空报告输出"
else
    ok "update_source 命令体无 clean -fdx（APP_SRC/data 运行时数据安全）"
fi

# ---------- 用例 8：版本号必须注入构建 ----------
grep -q 'defaultAppVersion' "$TARGET" \
    && ok "后端构建注入 defaultAppVersion（与 build-release.sh 同机制）" \
    || ng "后端构建未注入版本号" "/health 版本断言将失真"
grep -q 'NEXT_PUBLIC_APP_VERSION' "$TARGET" \
    && ok "前端构建注入 NEXT_PUBLIC_APP_VERSION" \
    || ng "前端构建未注入版本号"

# ---------- 用例 9：升级成功必须有版本断言 ----------
# 进程活着不代表跑的是新版本：旧二进制残留、启动失败被 Restart=always 掩盖，
# 只有 /health 的 version 等于目标版本才算升级成功。
grep -q '≠ 目标版本' "$TARGET" \
    && ok "以 /health version 是否等于目标版本作为成功判据" \
    || ng "缺少升级后版本断言" "进程全绿但版本没换的形态会被漏过"

# ---------- 用例 10：timeout 必须 --foreground ----------
# deploy-ubuntu.sh 的实测教训：默认 timeout 建后台进程组，被管命令 tcsetattr
# 触发 SIGTTOU 静默停摆。
grep -qE 'timeout --foreground' "$TARGET" \
    && ok "with_timeout 使用 --foreground（不重蹈 SIGTTOU 停摆）" \
    || ng "timeout 缺少 --foreground"

# ---------- 用例 11：run_sh 显式 pipefail ----------
grep -q 'bash -o pipefail -c' "$TARGET" \
    && ok "run_sh/run_build 显式 pipefail" \
    || ng "run_sh 缺少 pipefail" "管道左侧失败会被空输入吞掉"

printf '\n'
if [[ "$FAIL" -gt 0 ]]; then
    printf '\033[31m失败 %d 项\033[0m，通过 %d 项\n' "$FAIL" "$PASS"
    exit 1
fi
printf '\033[32m全部通过\033[0m（%d 项）\n' "$PASS"
