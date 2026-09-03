# 企业级网络设备巡检系统

管理网络设备、执行巡检策略、采集监控指标、处理告警、查看日志并生成报表。后端为 Go，前端为 Next.js，数据库使用 PostgreSQL + TimescaleDB，缓存使用 Redis。

- **设备与巡检**：设备台账、搜索探测与批量操作；巡检模板与策略配置，执行记录与结果明细。
- **监控与告警**：设备状态、性能指标与趋势数据；告警处理、统计与历史记录。
- **报表与日志**：监控报告、巡检报告导出；系统日志、采集日志、Syslog 与 SNMP Trap。
- **系统管理**：用户、角色、安全策略、通知、备份与系统配置。

## 技术概览

| 部分 | 当前技术 |
|------|----------|
| 前端 | Next.js 15、React 19、TypeScript、TanStack Query、Tailwind CSS |
| 后端 | Go 1.23、Echo、GORM、Zap、JWT、WebSocket |
| 数据库 | PostgreSQL 16、TimescaleDB 2.15.3 |
| 缓存 | Redis 7 |
| 报表 | PDF、Excel 等文件导出 |

## 生产部署（Ubuntu）

在干净的 Ubuntu Server LTS 上，单条命令完成原生部署（PostgreSQL 16 + Redis + 后端 + 前端 + Nginx）：

```bash
# 推荐：先取回脚本审阅再执行
curl -fsSL https://raw.githubusercontent.com/Izumi0527/inspect/main/scripts/install.sh -o install.sh
less install.sh
sudo bash install.sh --domain inspect.example.com
```

生产环境建议锁定版本，避免装到未发布的主干提交。仓库以根目录 `VERSION` 文件作为版本权威源，
锁定 ref 支持分支、tag 或 commit 短 hash（尚未打 tag 时用 commit 即可）：

```bash
# 锁定到某个 commit（示例为 1.1.4 版本提交）
curl -fsSL https://raw.githubusercontent.com/Izumi0527/inspect/3358ef7/scripts/install.sh \
  | sudo INSPECT_REF=3358ef7 bash -s -- --domain inspect.example.com --yes
```

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `INSPECT_REF` | `main` | 要部署的分支或 tag |
| `INSPECT_STAGE_DIR` | `/usr/local/src/inspect` | 源码中转目录 |

- `install.sh` 只做引导（校验系统、拉取源码、移交），部署动作全部由
  [`scripts/deploy-ubuntu.sh`](scripts/deploy-ubuntu.sh) 执行，其参数（`--steps`、`--from`、
  `--skip-monitoring`、`--dry-run`、`--yes`）可直接透传。
- 首次执行前建议加 `--dry-run` 预演，不产生任何变更；CI 等无终端场景必须显式加 `--yes`。
- 卸载：`sudo ./scripts/uninstall.sh` 停服务并保留数据库与备份，`--purge-data` 才彻底删除
  （需二次键入 DELETE 确认）。

### 无域名部署（仅 IP）

`--domain` 同样接受 IP，脚本不校验域名格式：

```bash
sudo bash install.sh --domain 192.168.1.100
```

- 必须填客户端实际可达的地址，不能填 `127.0.0.1`。
- `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` 在**构建期**写入前端产物，服务器换 IP 后只改
  `.env` 不生效，需重跑 `sudo ./scripts/deploy-ubuntu.sh --domain <新IP> --steps frontend,nginx`。
  建议为服务器配置静态 IP。

### 消除浏览器证书警告

脚本签发的自签证书已包含 `subjectAltName`（覆盖目标主机、`127.0.0.1` 与 `localhost`），但自签
证书不在系统信任链内，客户端仍需导入一次，否则每次访问都提示「不安全」：

```bash
# 1. 在客户端机器取回证书
scp root@192.168.1.100:/etc/nginx/ssl/inspect.crt .

# 2. 导入系统信任库（按客户端系统三选一）
certutil -addstore -f Root inspect.crt                       # Windows，管理员 PowerShell
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain inspect.crt          # macOS
sudo cp inspect.crt /usr/local/share/ca-certificates/ \
  && sudo update-ca-certificates                             # Ubuntu
```

Firefox 使用独立证书库，需在 `设置 → 隐私与安全 → 证书 → 查看证书 → 颁发机构` 中导入。导入后
重启浏览器生效；部署结束时脚本也会打印同样的指引。

若已持有受信任 CA 签发的证书，在部署前放到 `/etc/nginx/ssl/inspect.crt` 与 `inspect.key`，
脚本检测到其 SAN 已覆盖目标主机便会保留不动。

### 版本升级（已部署环境）

已按 `deploy-ubuntu.sh` 完成部署的机器，使用 [`scripts/upgrade-ubuntu.sh`](scripts/upgrade-ubuntu.sh)
升级版本并更新代码，目标默认 `main` 最新：

```bash
sudo ./scripts/upgrade-ubuntu.sh                    # 升级到 main 最新
sudo ./scripts/upgrade-ubuntu.sh --version v1.1.4   # 锁定到指定 tag / 分支 / commit
sudo ./scripts/upgrade-ubuntu.sh --dry-run          # 仅打印将执行的操作，不产生任何变更
sudo ./scripts/upgrade-ubuntu.sh --force            # 目标与当前一致时仍强制重建
sudo ./scripts/upgrade-ubuntu.sh --yes              # CI/无终端场景必须显式 --yes
```

升级流程：探测当前版本 → 拉取目标 ref → 数据库备份 → 更新源码 → 注入版本号构建前后端 →
原子替换二进制 → 校验后端单元能力（缺 `CAP_NET_RAW` 则写 drop-in 补齐，否则设备探测的 ping 无法执行）→ 重启 → **以 `/health` 返回的 version 是否等于目标版本作为升级成功依据**。
后端健康检查或版本断言失败时自动回滚旧二进制并恢复服务。

- 版本号权威源为仓库根 `VERSION` 文件：发布新版本时先更新该文件并提交，构建时经 ldflags
  注入后端 `/health`、经 `NEXT_PUBLIC_APP_VERSION` 注入前端。
- 升级前自动执行 `pg_dump` 备份到 `/opt/inspect/backups/postgres/`（`--skip-backup` 可跳过，
  不建议在生产环境使用）；数据库结构变更由后端启动迁移自动完成。
- 源码更新使用 `git reset --hard`，`/opt/inspect/app/data` 等运行时数据目录不受影响；
  旧版后端二进制保留于 `/opt/inspect/bin/inspect-api.prev`，确认稳定后可删除。
- 本地开发环境更新代码只需 `git pull` 后重启前后端服务。
- 设备探测排障：页面上探测结果会直接附带失败原因；后端在 `LOG_LEVEL=debug` 下会记录每次探测的
  ICMP/SNMP 结论与耗时（`/opt/inspect/logs/backend/app.log`），ping 无法执行会以 WARN 浮出。
  「手工 ping 正常但探测判离线」先查 `systemctl show inspect-backend -p AmbientCapabilities`
  是否含 `cap_net_raw`。

### Windows 安装包

项目支持生成 Inno Setup `.exe` 安装包，安装后自动准备 `config/.env`、创建运行目录、启动
Docker 数据库服务、等待后端迁移完成，并初始化默认管理员、角色权限与业务种子数据。
详见 [installer/README.md](installer/README.md)。

## 本地开发

### 1. 准备环境

```powershell
if (-not (Test-Path ".env")) { Copy-Item ".env.example" ".env" }
```

| 服务 | 开发端口 |
|------|------|
| 前端 | `http://localhost:13000` |
| 后端 | `http://127.0.0.1:18080` |
| PostgreSQL | `localhost:15500` |
| Redis | `localhost:16380` |

### 2. 启动

```powershell
.\scripts\dev-start.ps1 -Diagnose          # 环境诊断
.\scripts\dev-start.ps1 -Setup             # 初始化（配置、数据库、依赖）
.\scripts\dev-start.ps1 -Services all -Wait # 启动全部服务
```

```bash
./scripts/dev-start.sh --diagnose
./scripts/dev-start.sh --setup
./scripts/dev-start.sh --services all --wait
```

`-Services` 可单独指定 `database` / `backend` / `frontend`。数据库单独操作用
`.\scripts\db-manage.ps1 start|status|init|seed-admin`。脚本不可用时的手动启动步骤见
[scripts/README.md](scripts/README.md)。

### 3. 登录账号

开发环境默认管理员为 `admin` / `admin123`。账号不存在时执行 `.\scripts\db-manage.ps1 seed-admin`。

> 安全提示：使用默认口令初始化的管理员**首次登录会被强制要求修改密码**，改密前无法访问业务
> 接口。生产环境请在安装时设置强口令。

### 4. 测试与质量校验

统一入口，覆盖后端 `go build` + 单测、前端 `tsc` 类型检查 + Jest 单测、安装包脚本回归：

```powershell
.\scripts\test.ps1                          # 全量
.\scripts\test.ps1 -Scope backend           # backend | frontend | installer
.\scripts\test.ps1 -Package ./internal/devices/...  # TDD 快速反馈，跳过 build 与全量用例
```

```bash
./scripts/test.sh --scope frontend
./scripts/test.sh --skip-build --skip-type-check
```

## 关键配置

本地开发使用根目录 `.env`：

```env
SERVER_HOST=127.0.0.1
SERVER_PORT=18080

NEXT_PUBLIC_API_URL=http://127.0.0.1:18080
NEXT_PUBLIC_WS_URL=ws://127.0.0.1:18080

DATABASE_URL=postgresql://inspect_dev:dev_password_2024@localhost:15500/inspect_system_dev
REDIS_URL=redis://:dev_redis_2024@127.0.0.1:16380/0
```

> 后端端口变更时，`SERVER_PORT`、`NEXT_PUBLIC_API_URL`、`NEXT_PUBLIC_WS_URL` **三项必须同步
> 修改并重启前后端**。Windows 上若端口被系统 TCP 排除范围保留，改用 `18080` 或其他可用端口。

## 常见入口

| 入口 | 地址 |
|------|------|
| 前端页面 | `http://localhost:13000` |
| 后端健康检查 | `http://127.0.0.1:18080/health` |
| API 根路径 | `http://127.0.0.1:18080/api/v1` |
| WebSocket | `ws://127.0.0.1:18080/api/v1/ws/:user_id` |
| pgAdmin | `http://localhost:5050` |
| Redis Commander | `http://localhost:8081` |

## 更多文档

- [脚本总览](scripts/README.md)：所有脚本的完整参数与示例（部署、开发、数据库、测试、清理）。
- [项目详细架构文档](docs/PROJECT_ARCHITECTURE.md)
- [后端说明](backend-go/README.md) ｜ [安装包说明](installer/README.md)

常用脚本速查：

| 脚本 | 用途 |
|------|------|
| `install.sh` / `deploy-ubuntu.sh` / `uninstall.sh` | Ubuntu 生产环境安装、部署与卸载（原生，无 Docker） |
| `upgrade-ubuntu.sh` | Ubuntu 已部署环境的版本升级与代码更新（备份、构建、健康检查、失败自动回滚） |
| `prod-start.*` | 生产环境 Docker Compose 启动、停止、状态与日志 |
| `dev-start.*` / `db-manage.*` | 开发环境启动、数据库管理 |
| `test.*` / `clean-cache.*` | 测试质量校验、清理缓存与运行时数据 |
| `build-release.*` | 构建 Linux 发布产物（静态二进制 + SQL + sha256） |

## 注意事项

- 生产环境必须替换 `.env.example` 中的默认密钥、数据库密码和 Redis 密码。
- `data/`、`logs/`、`backend-go/data/` 是运行时目录，不提交到 Git；报表导出写入 `data/reports`。
- 权限最终以后端校验为准，前端隐藏入口只用于改善体验。

---

<div align="center">

**🌟 如果这个项目对你有帮助，请给个 Star 支持一下！**

Made with ❤️ by Izumi0527

**项目版本**: v1.1.4 | **API版本**: v1.1.4 | **最后更新**: 2026-09-03

版本号权威源为仓库根 `VERSION` 文件

</div>
