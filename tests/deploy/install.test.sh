#!/usr/bin/env bash
# scripts/install.sh —— git 网络重试与错误分流回归测试
#
# 背景：跨境链路对 github.com 偶发 TLS 中断（GnuTLS -110 / schannel 握手失败），
# 而 install.sh 曾把 git 的任何失败一律归因为「分支或 tag 不存在」，且一次失败即退出。
# 本测试锁定两项契约：① 按错误原因分流，网络故障才重试；② fetch 与 clone 两条路径都接入。
#
# 测试手法：install.sh 的设计约束要求全部逻辑包在 main() 内（未完整下载时不执行到一半），
# 因此无法 source。改为从源文件提取函数定义文本后 eval，既不破坏生产脚本结构，
# 又保证测的是真实生产代码而非副本。

set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
TARGET="$PROJECT_ROOT/scripts/install.sh"

PASS=0
FAIL=0

ok()   { PASS=$((PASS + 1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
ng()   { FAIL=$((FAIL + 1)); printf '  \033[31m✗\033[0m %s\n' "$1"; [[ $# -gt 1 ]] && printf '      %s\n' "$2"; }

[[ -f "$TARGET" ]] || { printf '未找到被测脚本: %s\n' "$TARGET" >&2; exit 1; }

# ---------- 从 install.sh 提取 main() 内定义的函数 ----------
extract_fn() {
    awk -v fn="$1" '
        index($0, "    " fn "() {") == 1    { capture = 1 }
        capture                            { print }
        capture && $0 == "    }"           { exit }
    ' "$TARGET"
}

FN_SRC="$(extract_fn git_net_run)"
if [[ -z "$FN_SRC" ]]; then
    printf '\033[31m✗ 未能在 %s 中提取到 git_net_run() 定义\033[0m\n' "$TARGET" >&2
    printf '  （函数需以 4 空格缩进定义在 main() 内）\n' >&2
    exit 1
fi
eval "$FN_SRC"

# ---------- 测试替身 ----------
# 被测函数用命令替换捕获输出，子 shell 内的变量自增无法回传父 shell，故用文件计数。
CALL_LOG="$(mktemp)"
trap 'rm -f "$CALL_LOG" "$CALL_LOG.plan"' EXIT

calls() { wc -l < "$CALL_LOG" | tr -d ' '; }
reset_calls() { : > "$CALL_LOG"; }

# install.sh 内的输出 helper，在测试环境提供等价替身
say()  { :; }
info() { :; }
warn() { :; }
ok_()  { :; }

# 重试退避不应拖慢测试：函数优先于外部命令，覆盖 sleep
sleep() { :; }

# 替身 A：远端没有该 ref（git 的真实报文，实测于 git 2.43）
fake_missing_ref() {
    echo 1 >> "$CALL_LOG"
    printf "fatal: couldn't find remote ref no-such-branch-xyz\n" >&2
    return 128
}

# 替身 B：TLS 连接被中途掐断（截图中的真实报文）
fake_tls_broken() {
    echo 1 >> "$CALL_LOG"
    printf "fatal: unable to access 'https://github.com/Izumi0527/inspect.git/': GnuTLS recv error (-110): The TLS connection was non-properly terminated.\n" >&2
    return 128
}

# 替身 C：前两次网络中断，第三次恢复
fake_flaky() {
    echo 1 >> "$CALL_LOG"
    if [[ "$(calls)" -lt 3 ]]; then
        printf "fatal: unable to access 'https://github.com/x.git/': GnuTLS recv error (-110): The TLS connection was non-properly terminated.\n" >&2
        return 128
    fi
    printf 'From https://github.com/x\n * branch main -> FETCH_HEAD\n'
    return 0
}

# 替身 D：一次即成功
fake_success() {
    echo 1 >> "$CALL_LOG"
    printf 'From https://github.com/x\n'
    return 0
}

printf '\n\033[36mscripts/install.sh — git 网络重试与错误分流\033[0m\n'

# ---------- 用例 1：ref 不存在必须立即失败，不做无谓重试 ----------
reset_calls
rc=0
git_net_run "拉取" fake_missing_ref || rc=$?
[[ "$rc" -eq 2 ]] \
    && ok "ref 不存在返回码 2（与网络故障可区分）" \
    || ng "ref 不存在应返回 2" "实际返回 $rc"
[[ "$(calls)" -eq 1 ]] \
    && ok "ref 不存在不触发重试（仅调用 1 次）" \
    || ng "ref 不存在不应重试" "实际调用 $(calls) 次"

# ---------- 用例 2：网络故障重试到上限 ----------
reset_calls
rc=0
git_net_run "拉取" fake_tls_broken || rc=$?
[[ "$rc" -eq 1 ]] \
    && ok "网络故障耗尽重试后返回码 1" \
    || ng "网络故障应返回 1" "实际返回 $rc"
[[ "$(calls)" -eq 3 ]] \
    && ok "网络故障共尝试 3 次" \
    || ng "网络故障应尝试 3 次" "实际调用 $(calls) 次"

# ---------- 用例 3：网络抖动后恢复，最终成功 ----------
reset_calls
rc=0
git_net_run "拉取" fake_flaky || rc=$?
[[ "$rc" -eq 0 ]] \
    && ok "前两次中断、第三次恢复则整体成功" \
    || ng "抖动恢复后应返回 0" "实际返回 $rc"

# ---------- 用例 4：一次成功不产生多余调用 ----------
reset_calls
rc=0
git_net_run "拉取" fake_success || rc=$?
[[ "$rc" -eq 0 && "$(calls)" -eq 1 ]] \
    && ok "首次成功即返回，无多余重试" \
    || ng "首次成功应只调用 1 次" "返回 $rc，调用 $(calls) 次"

# ---------- 用例 5：fetch 与 clone 两条路径都必须接入 ----------
# 同类逻辑分处两地时极易漏改一处，此断言防止只修一条路径。
grep -qE 'git_net_run[^|]*fetch' "$TARGET" \
    && ok "fetch 路径已接入 git_net_run" \
    || ng "fetch 路径未接入 git_net_run"
grep -qE 'git_net_run[^|]*clone' "$TARGET" \
    && ok "clone 路径已接入 git_net_run" \
    || ng "clone 路径未接入 git_net_run"

# ---------- 汇总 ----------
printf '\n'
if [[ "$FAIL" -gt 0 ]]; then
    printf '\033[31m失败 %d 项\033[0m，通过 %d 项\n' "$FAIL" "$PASS"
    exit 1
fi
printf '\033[32m全部通过\033[0m（%d 项）\n' "$PASS"
