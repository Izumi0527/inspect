# 企业级网络设备巡检系统

企业级网络设备巡检系统用于管理网络设备、执行巡检策略、采集监控指标、处理告警、查看日志并生成报表。当前主线后端为 Go，前端为 Next.js，数据库使用 PostgreSQL + TimescaleDB，缓存使用 Redis。

## 仓库信息

- GitHub 远端仓库：`https://github.com/Izumi0527/inspect`
- 可见性：私有仓库
- 默认分支：`main`

## 你可以用它做什么

- 管理网络设备台账，支持设备搜索、详情查看、探测和批量操作。
- 配置巡检模板和巡检策略，查看执行记录、结果明细和统计分析。
- 在监控中心查看设备状态、性能指标、告警摘要和趋势数据。
- 处理告警，查看告警详情、统计结果和历史记录。
- 生成监控报告、巡检报告和报表中心相关报告。
- 查看系统日志、采集日志、Syslog 和 SNMP Trap 相关数据。
- 管理用户、角色、安全策略、通知、备份和系统配置。

## 技术概览

| 部分 | 当前技术 |
|------|----------|
| 前端 | Next.js 15、React 19、TypeScript、TanStack Query、Tailwind CSS |
| 后端 | Go 1.23、Echo、GORM、Zap、JWT、WebSocket |
| 数据库 | PostgreSQL 16、TimescaleDB 2.15.3 |
| 缓存 | Redis 7 |
| 报表 | PDF、Excel 等文件导出 |

### 1. 准备环境文件

```powershell
if (-not (Test-Path ".env")) { Copy-Item ".env.example" ".env" }
```

默认开发端口：

| 服务 | 地址 |
|------|------|
| 前端 | `http://localhost:13000` |
| 后端 | `http://127.0.0.1:18080` |
| PostgreSQL | `localhost:15500` |
| Redis | `localhost:16380` |

### 2. 使用脚本启动

Windows 推荐：

```powershell
.\scripts\dev-start.ps1 -Diagnose
.\scripts\dev-start.ps1 -Setup
.\scripts\dev-start.ps1 -Services all -Wait
```

Bash 环境：

```bash
./scripts/dev-start.sh --diagnose
./scripts/dev-start.sh --setup
./scripts/dev-start.sh --services all --wait
```

### 3. 手动启动

日常开发请优先使用上一节的脚本方式；手动启动仅用于脚本不可用或排查启动问题时。

先启动数据库和 Redis：

```powershell
docker-compose -f "docker-compose.dev.yml" up -d postgres redis
```

启动后端：

```powershell
$env:ENV_FILE = (Resolve-Path ".env").Path
Set-Location "backend-go"
go run ./cmd/api
```

另开终端启动前端：

```powershell
Set-Location "frontend"
pnpm install
pnpm dev
```

## 登录账号

开发环境首次初始化的默认管理员用户名为 `admin`，开发环境初始口令默认为 `admin123`。

> 安全提示：使用默认口令初始化的管理员**首次登录会被强制要求修改密码**，改密前无法访问业务接口。生产环境请在安装时设置强口令。

如果账号不存在，可执行：

```powershell
.\scripts\db-manage.ps1 seed-admin
```

## 一键安装（Ubuntu 生产环境）

在干净的 Ubuntu Server LTS 上，单条命令完成原生部署（PostgreSQL 16 + Redis + 后端 + 前端 + Nginx）：

```bash
# 推荐：先审阅脚本再执行
curl -fsSL https://raw.githubusercontent.com/Izumi0527/inspect/main/scripts/install.sh -o install.sh
less install.sh
sudo bash install.sh --domain inspect.example.com
```

```bash
# 一键形态（脚本会保留交互确认）
curl -fsSL https://raw.githubusercontent.com/Izumi0527/inspect/main/scripts/install.sh \
  | sudo bash -s -- --domain inspect.example.com
```

生产环境建议锁定版本，避免装到未发布的主干提交：

```bash
curl -fsSL https://raw.githubusercontent.com/Izumi0527/inspect/refs/tags/v1.1.1/scripts/install.sh \
  | sudo INSPECT_REF=v1.1.1 bash -s -- --domain inspect.example.com --yes
```

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `INSPECT_REF` | `main` | 要部署的分支或 tag |
| `INSPECT_STAGE_DIR` | `/usr/local/src/inspect` | 源码中转目录 |

说明：

- `install.sh` 只做引导（校验系统、拉取源码、移交），全部部署动作由
  [`scripts/deploy-ubuntu.sh`](scripts/deploy-ubuntu.sh) 执行，其参数（`--steps`、`--from`、
  `--skip-monitoring`、`--dry-run`、`--yes` 等）可直接透传。
- 首次执行前可加 `--dry-run` 预演全部步骤，不产生任何变更。
- 无控制终端（CI、无人值守）时必须显式追加 `--yes`，否则脚本拒绝执行。
- 完整部署文档见 `docs/deployment/ubuntu-production.md`。
- 卸载：`sudo ./scripts/uninstall.sh --dry-run` 预演，`sudo ./scripts/uninstall.sh` 卸载应用并保留
  数据库与备份，`--purge-data` 才彻底删除数据（需二次键入 DELETE 确认）。

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

脚本签发的自签证书已包含 `subjectAltName`（覆盖目标主机、`127.0.0.1` 与 `localhost`）。
但自签证书不在系统信任链内，客户端仍需导入一次，否则每次访问都提示「不安全」：

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

Firefox 使用独立证书库，需在 `设置 → 隐私与安全 → 证书 → 查看证书 → 颁发机构` 中导入。
导入后重启浏览器生效；部署结束时脚本也会打印同样的指引。

若已持有受信任 CA 签发的证书，在部署前放到 `/etc/nginx/ssl/inspect.crt` 与 `inspect.key`，
脚本检测到其 SAN 已覆盖目标主机便会保留不动；反之（例如旧版本遗留的无 SAN 证书）会备份
旧文件并重新签发。

## Windows 安装包

项目支持生成 Inno Setup `.exe` 安装包，安装包启动后会自动准备
`config/.env`、创建运行目录、启动 Docker 数据库服务、等待后端完成迁移，
并初始化默认管理员、内置角色、权限和业务种子数据。

安装包说明见：[installer/README.md](installer/README.md)。

## 常用命令

### 开发环境

```powershell
.\scripts\dev-start.ps1 -Diagnose
.\scripts\dev-start.ps1 -Services database
.\scripts\dev-start.ps1 -Services backend
.\scripts\dev-start.ps1 -Services frontend
```

### 数据库

```powershell
.\scripts\db-manage.ps1 start
.\scripts\db-manage.ps1 status
.\scripts\db-manage.ps1 init
.\scripts\db-manage.ps1 seed-admin
```

### 测试与质量校验

测试与类型检查已收敛到统一入口，覆盖后端 `go build` + 单测、前端 `tsc` 类型检查 +
Jest 单测，以及安装包脚本回归：

```powershell
.\scripts\test.ps1                     # 全量
.\scripts\test.ps1 -Scope backend      # 仅后端
.\scripts\test.ps1 -Scope frontend     # 仅前端
.\scripts\test.ps1 -Scope installer    # 仅安装包脚本

# TDD 快速反馈：只跑指定 Go 包，跳过 go build 与全量用例
.\scripts\test.ps1 -Package ./internal/devices/...
```

Bash 环境：

```bash
./scripts/test.sh --scope frontend
./scripts/test.sh --skip-build --skip-type-check
```

## 脚本文档索引

- [脚本总览](scripts/README.md)：查看所有维护中的脚本、参数和示例。
- `scripts/install.sh`：远程一键安装引导（`curl | bash`），校验环境后移交 `deploy-ubuntu.sh`。
- `scripts/deploy-ubuntu.sh`：Ubuntu 生产环境原生部署（无 Docker，目标平台专用，无 `.ps1` 版本）。
- `scripts/uninstall.sh`：Ubuntu 卸载（默认保留数据库与备份，`--purge-data` 才彻底删除）。
- `scripts/build-release.ps1` / `scripts/build-release.sh`：构建 Linux 发布产物（后端静态二进制 + SQL + sha256）。
- `scripts/dev-start.ps1` / `scripts/dev-start.sh`：开发环境诊断、初始化和启动。
- `scripts/prod-start.ps1` / `scripts/prod-start.sh`：生产环境 Docker Compose 启动、停止、状态和日志。
- `scripts/db-manage.ps1` / `scripts/db-manage.sh`：数据库启动、初始化、验证、备份和默认管理员账号。
- `scripts/test.ps1` / `scripts/test.sh`：测试与质量校验统一入口（后端 build + 单测、前端类型检查 + 单测）。
- `scripts/clean-cache.ps1` / `scripts/clean-cache.sh`：清理缓存、日志、测试产物和运行时数据。

最常用入口：

```powershell
.\scripts\dev-start.ps1 -Diagnose
.\scripts\dev-start.ps1 -Setup
.\scripts\db-manage.ps1 status
.\scripts\test.ps1
.\scripts\clean-cache.ps1 -WhatIf
```

## 关键配置

本地开发主要使用根目录 `.env`。常用配置如下：

```env
SERVER_HOST=127.0.0.1
SERVER_PORT=18080

NEXT_PUBLIC_API_URL=http://127.0.0.1:18080
NEXT_PUBLIC_WS_URL=ws://127.0.0.1:18080

DATABASE_URL=postgresql://inspect_dev:dev_password_2024@localhost:15500/inspect_system_dev
REDIS_URL=redis://:dev_redis_2024@127.0.0.1:16380/0

REPORT_OUTPUT_DIR=data/reports/monitoring
REPORTS_OUTPUT_DIR=data/reports
```

如果后端端口变更，请同时修改：

- `SERVER_PORT`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_WS_URL`

当前 Windows 本机联调已验证使用 `18080`。如果切换到其他端口，三项配置必须同步更新并重启前后端。

## 常见入口

| 入口 | 地址 |
|------|------|
| 前端页面 | `http://localhost:13000` |
| 后端健康检查 | `http://127.0.0.1:18080/health` |
| API 根路径 | `http://127.0.0.1:18080/api/v1` |
| WebSocket | `ws://127.0.0.1:18080/api/v1/ws/:user_id` |
| pgAdmin | `http://localhost:5050` |
| Redis Commander | `http://localhost:8081` |

## 文档

- [项目详细架构文档](docs/PROJECT_ARCHITECTURE.md)
- [后端说明](backend-go/README.md)

## 注意事项

- 生产环境必须替换 `.env.example` 中的默认密钥、数据库密码和 Redis 密码。
- `data/`、`logs/`、`backend-go/data/` 是运行时目录，不应提交到 Git。
- 前端请求地址和后端监听端口必须保持一致。
- Windows 环境中如端口被系统 TCP 排除范围保留，请改用当前示例端口 `18080` 或其他可用端口，并保持前后端配置一致。
- 权限最终以后端校验为准，前端隐藏入口只用于改善体验。
- 报表和导出文件由后端写入 `data/reports` 相关目录。

---

<div align="center">

**🌟 如果这个项目对你有帮助，请给个 Star 支持一下！**

Made with ❤️ by Izumi0527

**项目版本**: v1.1.1 | **API版本**: v1.1.1 | **最后更新**: 2026-08-26

版本号权威源为仓库根 `VERSION` 文件

</div>
