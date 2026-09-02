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
skip() { printf '  \033[90m- %s（跳过：%s）\033[0m\n' "$1" "$2"; }

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
    || ng "未禁用 man-db 触发器" "装包后会重建整个 man 索引，对服务器部署毫无价值"

# ---------- 用例 5：准备逻辑必须在 main 中被调用 ----------
# 只放进 step_system 是不够的：--from postgres 续跑会跳过该步骤。
grep -qE '^\s+prepare_apt_env' "$TARGET" \
    && ok "prepare_apt_env 在 main 中被调用（--from 续跑同样生效）" \
    || ng "prepare_apt_env 未在 main 中调用"

printf '\n\033[36m超时包装与终端作业控制\033[0m\n'

# ---------- 用例 6：with_timeout 不得把命令放进后台进程组 ----------
# GNU timeout 默认 setpgid(0,0) 新建进程组，被管命令却仍继承控制终端。后台进程组
# 对终端做 tcsetattr 会被内核以 SIGTTOU 停止（读终端则是 SIGTTIN），而 timeout 自身
# 忽略这两个信号不受影响。apt 在 dpkg 结束后恰会 tcsetattr(stdin) 恢复终端且不屏蔽
# SIGTTOU——交互模式下它在打印完 Processing triggers 之后静默停住，直到 1800s 超时
# 才被唤醒杀死。静态断言 --foreground 标志，所有平台都能跑。
grep -qE '^\s+timeout\s+--foreground\b' "$TARGET" \
    && ok "with_timeout 使用 timeout --foreground（不新建后台进程组）" \
    || ng "with_timeout 未使用 --foreground" "被管命令位于后台进程组，apt 收尾 tcsetattr 会触发 SIGTTOU 静默停摆"

# ---------- 用例 7：pty 下行为复现 ----------
# 用 script(1) 分配 pty 并让被测 shell 成为其前台进程组，再经 with_timeout 执行
# stty -echo——它对 stdin 做的 tcsetattr 与 apt 收尾完全相同。有缺陷时 stty 被停住，
# 直到 6s 超时才返回 124；正确实现瞬间返回 0。
WT_SRC="$(extract_fn with_timeout)"
if [[ -z "$WT_SRC" ]]; then
    ng "未能提取 with_timeout() 定义"
elif ! command -v script >/dev/null 2>&1 || ! command -v timeout >/dev/null 2>&1; then
    skip "pty 下 tcsetattr 不触发 SIGTTOU 停止" "缺少 script(1)/timeout(1)，请在 Linux/WSL 下运行"
else
    probe="$(mktemp)"
    {
        printf '%s\n' "$WT_SRC"
        printf '%s\n' 'error() { :; }'
        printf '%s\n' 't0=$(date +%s)'
        printf '%s\n' 'with_timeout 6 "stty probe" stty -echo; rc=$?'
        printf '%s\n' 'stty echo 2>/dev/null'
        printf '%s\n' 'echo "PROBE rc=$rc elapsed=$(( $(date +%s) - t0 ))s"'
    } >"$probe"
    out="$(timeout -s KILL 20 script -qec "bash '$probe'" /dev/null </dev/null 2>&1 | tr -d '\r')"
    rm -f "$probe"
    if grep -q 'PROBE rc=0 ' <<<"$out"; then
        ok "pty 下经 with_timeout 执行 tcsetattr 立即返回 0"
    else
        ng "pty 下经 with_timeout 执行 tcsetattr 未正常返回" "$(grep 'PROBE' <<<"$out" || echo "$out")"
    fi
fi

printf '\n\033[36m多源下载回退\033[0m\n'

# ---------- 用例 8：二进制下载必须走 fetch_file 多源回退 ----------
# 真实故障：Go 步骤 wget -q 从阿里云单源拉 70MB，海外链路涓流传输时 --timeout=30
# 永不触发（它只管连接/读空闲），-q 又吞掉全部进度，表现为「安装 Go」后静默假死
# 直到外层 1800s。修复后下载统一走 fetch_file：进度可见、单源限时、失败换源。
grep -q 'fetch_file /tmp/go.tar.gz' "$TARGET" \
    && ok "Go 工具链下载走 fetch_file（多源回退）" \
    || ng "Go 工具链仍是裸 wget 单源下载" "镜像链路故障会直接卡死部署"
grep -q 'fetch_file /tmp/prom.tar.gz' "$TARGET" \
    && ok "Prometheus 下载走 fetch_file（多源回退）" \
    || ng "Prometheus 仍是裸 wget 单源下载" "ghfast.top 代理挂掉会直接卡死部署"

# ---------- 用例 9：fetch_file 必须限时 + 可见进度 ----------
grep -q 'timeout ${FETCH_TIMEOUT} wget' "$TARGET" \
    && ok "fetch_file 对单一下载源施加硬限时" \
    || ng "fetch_file 无单源限时" "死源会一直占用到外层 CMD_TIMEOUT（30 分钟）"
grep -q -- '--show-progress' "$TARGET" \
    && ok "下载进度可见（--show-progress）" \
    || ng "下载进度不可见" "慢与死不可区分，用户无从决定等待或中断"

# ---------- 用例 10：内置镜像链必须含官方源兜底 ----------
grep -q '"https://go.dev/dl"' "$TARGET" \
    && ok "Go 镜像链含官方源兜底" \
    || ng "Go 镜像链缺官方源" "全内网镜像均不可达时（如海外机）无处可退"

# ---------- 用例 11：fetch_file 多源回退行为 ----------
# 首 URL 指向必然拒绝连接的端口模拟死源，次 URL 为本地 http.server 的真实文件，
# 验证「死源立即失败→自动换源→文件完整落地」。缺陷形态：die 于首源或整链失败。
FF_SRC="$(extract_fn fetch_file)"
if [[ -z "$FF_SRC" ]]; then
    ng "未能提取 fetch_file() 定义"
elif ! command -v python3 >/dev/null 2>&1 || ! command -v wget >/dev/null 2>&1; then
    skip "fetch_file 多源回退行为" "缺少 python3/wget，请在 Linux/WSL 下运行"
else
    workdir="$(mktemp -d)"
    printf 'PAYLOAD-OK' >"$workdir/payload.bin"
    port=$(( (RANDOM % 20000) + 20000 ))
    ( cd "$workdir" && exec python3 -m http.server "$port" --bind 127.0.0.1 ) >/dev/null 2>&1 &
    httpd_pid=$!
    ready=""
    for _ in 1 2 3 4 5 6 7 8 9 10; do
        if wget -q -O /dev/null "http://127.0.0.1:${port}/payload.bin" 2>/dev/null; then ready=1; break; fi
        sleep 0.3
    done
    if [[ -z "$ready" ]]; then
        skip "fetch_file 多源回退行为" "本地 http.server 未能就绪"
        kill "$httpd_pid" 2>/dev/null
    else
        probe="$(mktemp)"
        {
            printf '%s\n' "$FF_SRC"
            printf "info() { :; }\nwarn() { :; }\ndie() { echo 'DIED: %s' \"\$*\"; exit 99; }\n"
            printf 'run_sh() { bash -c "$*"; }\n'
            printf '%s\n' 'FETCH_TIMEOUT=30'
            printf '%s\n' 'WGET_RETRY_OPTS="--tries=1 --timeout=2"'
            # 下载目标必须独立于 http.server 的文档文件：wget -O 会先截断输出，
        # 若两者同路径则读到的就是自己刚截断的空文件
        printf "fetch_file '%s/downloaded.bin' 'http://127.0.0.1:1/x.bin' 'http://127.0.0.1:${port}/payload.bin'; rc=\$?\n" "$workdir"
            printf '%s\n' 'echo "PROBE rc=$rc content=$(cat "'"$workdir"'/downloaded.bin")"'
        } >"$probe"
        out="$(bash "$probe" 2>&1)"
        rm -f "$probe"
        kill "$httpd_pid" 2>/dev/null
        rm -rf "$workdir"
        if grep -q 'PROBE rc=0 content=PAYLOAD-OK' <<<"$out"; then
            ok "死源后自动回退下一源并完整下载"
        else
            ng "fetch_file 多源回退未按预期工作" "$(grep -E 'PROBE|DIED' <<<"$out" | head -1)"
        fi
    fi
fi

printf '\n\033[36m管道失败传播与前端安装\033[0m\n'

# ---------- 用例 12：run_sh 必须显式 pipefail ----------
# 父 shell 的 set -o pipefail 不跨 bash -c 继承（实测）。缺陷形态：
# curl -fsSL nodesource/setup | bash - 在 curl 失败时被空输入的 bash - 判为成功，
# 静默跳过 Node 源配置，apt 随即装上 Ubuntu 自带的 Node 18 继续构建。
grep -q 'bash -o pipefail -c' "$TARGET" \
    && ok "run_sh/run_build 显式启用 pipefail" \
    || ng "run_sh 未启用 pipefail" "curl | bash 的左侧失败会被空输入静默吞掉"

# ---------- 用例 13：pipefail 行为复现 ----------
RS_SRC="$(extract_fn run_sh)"
if [[ -z "$RS_SRC" ]]; then
    ng "未能提取 run_sh() 定义"
else
    probe="$(mktemp)"
    {
        printf "DRY_RUN=false\n"
        printf "with_timeout() { local d=\"\$2\"; shift 2; \"\$@\"; }\n"
        printf '%s\n' "$RS_SRC"
        printf '%s\n' 'run_sh "false | echo hi" >/dev/null 2>&1; rc=$?'
        printf '%s\n' 'echo "PROBE rc=$rc"'
    } >"$probe"
    out="$(bash "$probe" 2>&1)"
    rm -f "$probe"
    if grep -q 'PROBE rc=0' <<<"$out"; then
        ng "管道左侧失败仍被吞掉" "run_sh 输出 rc=0，nodesource 类管道命令会静默失败"
    else
        ok "管道左侧失败正确传播为非零（$(grep -o 'rc=[0-9]*' <<<"$out" | head -1)）"
    fi
fi

# ---------- 用例 14：curl 必须有总时长上限 ----------
grep -q 'CURL_RETRY_OPTS=.*--max-time' "$TARGET" \
    && ok "curl 重试参数含 --max-time（总时长上限）" \
    || ng "curl 缺少 --max-time" "--connect-timeout 只管连接建立，涓流传输会一直挂着"

# ---------- 用例 15：pnpm install 不得静默 ----------
grep -q 'pnpm install --frozen-lockfile --silent' "$TARGET" \
    && ng "pnpm install 仍带 --silent" "几百 MB 依赖下载零进度，慢与死不可区分" \
    || ok "pnpm install 无 --silent（进度可见）"

printf '\n\033[36madmin 账户初始化\033[0m\n'

# ---------- 用例 16：seed 工具必须随部署编译并执行 ----------
# 数据库 SQL 与后端启动都不创建 admin，若部署脚本不显式执行 seed，部署「全绿」
# 却无账号可登（verify 只查进程与 /health，不会暴露）。
grep -q 'inspect-seed.new ./cmd/seed' "$TARGET" \
    && ok "seed 工具随主程序一起编译" \
    || ng "seed 工具未被编译" "部署后数据库中没有 admin 账户，无人能登录"
grep -q 'INSPECT_SEED_PASSWORD=' "$TARGET" \
    && ok "部署时自动执行 seed 初始化 admin" \
    || ng "部署流程未执行 seed" "admin 账户永远不会被创建"

# ---------- 用例 17：admin 初始密码必须入凭据文件 ----------
# summary 向用户承诺「默认账号 admin」，密码必须落在 credentials.txt 的
# ADMIN_PASSWORD 字段，与 REDIS_PASSWORD 等凭据同一机制；重跑时复用同一值，
# 否则 seed 的 UPDATE 语义会在续跑时悄悄重置用户已改过的密码。
grep -q 'record_credential "ADMIN_PASSWORD=' "$TARGET" \
    && ok "ADMIN_PASSWORD 经 record_credential 写入凭据文件" \
    || ng "ADMIN_PASSWORD 未写入凭据文件" "初始密码无处可查，且重跑会反复重置"
grep -q '复用已生成的管理员密码' "$TARGET" \
    && ok "凭据已存在时复用（重跑不重置密码）" \
    || ng "未复用既有 ADMIN_PASSWORD" "重跑部署会用新随机密码覆盖 admin"

# ---------- 用例 18：seed 不得与运行中的服务抢迁移锁 ----------
grep -q -- '--skip-migrate' "$TARGET" \
    && ok "seed 以 --skip-migrate 执行（迁移已由后端完成）" \
    || ng "seed 未跳过迁移" "与运行中的 inspect-backend 并发 GORM 迁移会竞争表锁"

# ---------- 用例 19：verify 必须检查 admin 账户存在 ----------
grep -q "admin 账户已初始化" "$TARGET" \
    && ok "verify 显式检查 admin 账户" \
    || ng "verify 不检查 admin" "账户缺失被进程全绿掩盖，用户登录失败才发现"

printf '\n'
if [[ "$FAIL" -gt 0 ]]; then
    printf '\033[31m失败 %d 项\033[0m，通过 %d 项\n' "$FAIL" "$PASS"
    exit 1
fi
printf '\033[32m全部通过\033[0m（%d 项）\n' "$PASS"
