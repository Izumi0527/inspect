#!/usr/bin/env bash
# scripts/deploy-ubuntu.sh —— 步骤失败传播与 apt 环境准备回归测试
#
# 背景：run_step 原写作 `"$fn" || rc=$?`，而 bash 在函数被置于 || 左侧时会在整个
# 函数内抑制 set -e。后果是步骤中任何命令失败都被静默跳过、函数仍返回 0，失败的
# 部署被判定为成功。实测中 apt-get install 被 1800s 超时杀死后，脚本继续执行了
# 后续所有命令。该抑制还会穿透子 shell，故 `( set -e; "$fn" ) || rc=$?` 同样无效。
#
# 测试手法：与 install.test.sh 一致，从源文件提取函数定义后 eval，避免 source
# 整个部署脚本（它会立即执行 main）。

set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
TARGET="$PROJECT_ROOT/scripts/deploy-ubuntu.sh"

PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
ng() { FAIL=$((FAIL + 1)); printf '  \033[31m✗\033[0m %s\n' "$1"; [[ $# -gt 1 ]] && printf '      %s\n' "$2"; }

[[ -f "$TARGET" ]] || { printf '未找到被测脚本: %s\n' "$TARGET" >&2; exit 1; }

# 提取顶层函数（缩进为 0）
extract_fn() {
    awk -v fn="$1" '
        index($0, fn "() {") == 1 { capture = 1 }
        capture                   { print }
        capture && $0 == "}"      { exit }
    ' "$TARGET"
}

FN_SRC="$(extract_fn run_step)"
if [[ -z "$FN_SRC" ]]; then
    printf '\033[31m✗ 未能提取 run_step() 定义\033[0m\n' >&2
    exit 1
fi

# ---------- 依赖替身 ----------
should_run()      { return 0; }
heartbeat_start() { :; }
heartbeat_stop()  { :; }
error()           { printf 'ERROR: %s\n' "$*"; }
dim()             { printf 'DIM: %s\n' "$*"; }
fmt_dur()         { printf '%ds' "$1"; }
CURRENT_STEP=""
SCRIPT_DIR_ORIG="$SCRIPT_DIR"
DOMAIN="example.com"

eval "$FN_SRC"

# ---------- 假步骤 ----------
# 中途失败：MARK-AFTER 若出现，即证明失败未终止步骤
step_mid_fail() {
    echo "MARK-BEFORE"
    false
    echo "MARK-AFTER"
    return 0
}

# 模拟真实形态：run_sh 风格的命令返回 124（timeout 强杀）
step_timeout_like() {
    echo "MARK-BEFORE"
    ( exit 124 )
    echo "MARK-AFTER"
    return 0
}

step_all_ok() {
    echo "MARK-OK"
    return 0
}

printf '\n\033[36mscripts/deploy-ubuntu.sh — 步骤失败传播\033[0m\n'

# ---------- 用例 1：中途失败必须终止步骤 ----------
out="$(run_step demo step_mid_fail 2>&1)"; rc=$?
[[ "$rc" -ne 0 ]] \
    && ok "步骤中途失败时 run_step 返回非零（实际 $rc）" \
    || ng "步骤中途失败却返回 0" "这会把失败的部署判定为成功"
grep -q 'MARK-BEFORE' <<<"$out" \
    && ok "失败点之前的命令正常执行" \
    || ng "失败点之前的命令未执行"
grep -q 'MARK-AFTER' <<<"$out" \
    && ng "失败点之后的命令仍被执行" "set -e 未生效，步骤在残缺状态下继续" \
    || ok "失败点之后的命令不再执行"

# ---------- 用例 2：超时强杀（124）同样必须终止 ----------
out="$(run_step demo step_timeout_like 2>&1)"; rc=$?
[[ "$rc" -ne 0 ]] \
    && ok "命令被超时强杀时 run_step 返回非零（实际 $rc）" \
    || ng "超时强杀却返回 0"
grep -q 'MARK-AFTER' <<<"$out" \
    && ng "超时后续命令仍被执行" "这正是实测中 postgres 步骤的表现" \
    || ok "超时后不再执行后续命令"

# ---------- 用例 3：全部成功时正常返回 ----------
out="$(run_step demo step_all_ok 2>&1)"; rc=$?
[[ "$rc" -eq 0 ]] && grep -q 'MARK-OK' <<<"$out" \
    && ok "步骤全部成功时返回 0" \
    || ng "步骤成功却返回 $rc"

printf '\n\033[36mapt 环境准备\033[0m\n'

# ---------- 用例 4：man-db 触发器必须被关闭 ----------
grep -q 'man-db/auto-update boolean false' "$TARGET" \
    && ok "已禁用 man-db 自动索引重建" \
    || ng "未禁用 man-db 触发器" "它是 apt 装完却不返回的首要原因"

# ---------- 用例 5：准备逻辑必须在 main 中被调用 ----------
# 只放进 step_system 是不够的：--from postgres 续跑会跳过该步骤。
grep -qE '^\s+prepare_apt_env' "$TARGET" \
    && ok "prepare_apt_env 在 main 中被调用（--from 续跑同样生效）" \
    || ng "prepare_apt_env 未在 main 中调用"

printf '\n'
if [[ "$FAIL" -gt 0 ]]; then
    printf '\033[31m失败 %d 项\033[0m，通过 %d 项\n' "$FAIL" "$PASS"
    exit 1
fi
printf '\033[32m全部通过\033[0m（%d 项）\n' "$PASS"
