# UltraThink 脚本目录结构

本目录包含项目当前仍在维护的脚本。数据库脚本已收敛为根目录下的
`db-manage.ps1` / `db-manage.sh`，开发脚本已收敛为根目录下的
`dev-start.ps1` / `dev-start.sh`，生产环境启动入口为
`prod-start.ps1` / `prod-start.sh`，测试维护目录目前仅保留缓存清理入口。

## 目录结构

```text
scripts/
├── dev-start.ps1      # 开发环境设置、启动、诊断统一入口
├── dev-start.sh       # 开发环境设置、启动、诊断统一入口 Bash 版
├── prod-start.ps1     # 生产环境 Docker Compose 启动、状态、日志和停止入口
├── prod-start.sh      # 生产环境 Docker Compose 启动、状态、日志和停止入口 Bash 版
├── db-manage.ps1      # 数据库统一管理、初始化、验证与管理员种子
├── db-manage.sh       # 数据库统一管理 Bash 版
├── clean-cache.ps1    # 缓存、临时文件、日志和测试产物清理
├── clean-cache.sh     # 缓存、临时文件、日志和测试产物清理 Bash 版
└── README.md
```

> Python 后端相关脚本已迁移至 `legacy/scripts/`，仅保留历史参考。

## 快速开始

### 环境设置

```powershell
.\scripts\dev-start.ps1 -Setup
```

```bash
./scripts/dev-start.sh --setup
```

### 启动开发服务

```powershell
.\scripts\dev-start.ps1
```

```bash
./scripts/dev-start.sh
```

也可以手动启动：

```powershell
cd backend-go
go run ./cmd/api

cd frontend
pnpm dev
```

## 开发环境管理

统一入口：

```powershell
.\scripts\dev-start.ps1 [-Setup] [-Diagnose] [-Services <database|backend|frontend|all>]
```

```bash
./scripts/dev-start.sh [--setup] [--diagnose] [--services <database|backend|frontend|all>]
```

常用命令：

```powershell
# 初始化完整开发环境（前置检查、配置文件、数据库、后端、前端、测试验证）
.\scripts\dev-start.ps1 -Setup

# 初始化开发环境但跳过测试验证
.\scripts\dev-start.ps1 -Setup -SkipTests

# 初始化开发环境但跳过数据库环境设置
.\scripts\dev-start.ps1 -Setup -SkipDatabase

# 启动全部开发服务
.\scripts\dev-start.ps1

# 仅启动数据库
.\scripts\dev-start.ps1 -Services database

# 启动数据库和后端
.\scripts\dev-start.ps1 -Services backend

# 仅启动前端
.\scripts\dev-start.ps1 -Services frontend

# 跳过启动后的健康检查
.\scripts\dev-start.ps1 -SkipHealthCheck

# 仅执行开发环境诊断，不启动服务
.\scripts\dev-start.ps1 -Diagnose

# 输出更详细的诊断信息
.\scripts\dev-start.ps1 -Diagnose -Verbose
```

```bash
# 初始化完整开发环境（前置检查、配置文件、数据库、后端、前端、测试验证）
./scripts/dev-start.sh --setup

# 初始化开发环境但跳过测试验证
./scripts/dev-start.sh --setup --skip-tests

# 初始化开发环境但跳过数据库环境设置
./scripts/dev-start.sh --setup --skip-database

# 启动全部开发服务
./scripts/dev-start.sh

# 仅启动数据库
./scripts/dev-start.sh --services database

# 启动数据库和后端
./scripts/dev-start.sh --services backend

# 仅启动前端
./scripts/dev-start.sh --services frontend

# 跳过启动后的健康检查
./scripts/dev-start.sh --skip-health-check

# 仅执行开发环境诊断，不启动服务
./scripts/dev-start.sh --diagnose

# 输出更详细的诊断信息
./scripts/dev-start.sh --diagnose --verbose
```

`dev-start.ps1 -Setup` 已合并原环境设置脚本能力：

- 检查 Git、Docker、Node.js、pnpm、Go 等前置工具
- 创建根环境文件和 `frontend/.env.local`
- 拉取并启动数据库容器
- 下载 Go 依赖并执行数据库迁移
- 安装前端依赖并执行类型检查、代码检查
- 可选执行后端和前端测试验证

`dev-start.ps1` 默认启动开发服务：

- `database`：启动 PostgreSQL 与 Redis
- `backend`：启动数据库与 Go 后端 API
- `frontend`：启动前端开发服务器
- `all`：启动数据库、后端和前端

诊断模式会检查必需工具、Docker 服务、数据库容器、配置文件、目录结构、
端口占用和 Docker 网络，并给出下一步建议。

## 生产环境管理

统一入口：

```powershell
.\scripts\prod-start.ps1 [-Action <start|stop|restart|status|logs|build|pull|config|down>]
```

```bash
./scripts/prod-start.sh [--action <start|stop|restart|status|logs|build|pull|config|down>]
```

生产脚本默认使用 `docker-compose.prod.yml`，环境变量文件优先级为：

1. `-EnvFile` 显式指定的文件
2. 根目录 `.env.production`
3. 根目录 `.env`
4. 当前 PowerShell 进程中的环境变量

Bash 版同样遵循上述优先级，最后回退到当前 Shell 进程中的环境变量。

启动前会检查生产必需变量：

- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- `SECRET_KEY`
- `JWT_SECRET_KEY`
- 启用 `-Monitoring` 时还会检查 `GRAFANA_ADMIN_PASSWORD`

常用命令：

```powershell
# 启动生产核心服务
.\scripts\prod-start.ps1

# 使用指定生产环境变量文件启动
.\scripts\prod-start.ps1 -EnvFile .env.production

# 启动前拉取镜像，并重新构建本地镜像
.\scripts\prod-start.ps1 -Pull -Build

# 启用 Nginx profile（要求先准备 config/nginx 与 ssl 目录）
.\scripts\prod-start.ps1 -WithNginx

# 启用监控 profile
.\scripts\prod-start.ps1 -Monitoring

# 仅查看生产服务状态
.\scripts\prod-start.ps1 -Action status

# 查看后端日志
.\scripts\prod-start.ps1 -Action logs -Service backend -Follow

# 校验生产 Compose 配置
.\scripts\prod-start.ps1 -Action config

# 预览将要执行的 docker compose 命令，不实际执行
.\scripts\prod-start.ps1 -DryRun

# 停止生产服务
.\scripts\prod-start.ps1 -Action stop
```

```bash
# 启动生产核心服务
./scripts/prod-start.sh

# 使用指定生产环境变量文件启动
./scripts/prod-start.sh --env-file .env.production

# 启动前拉取镜像，并重新构建本地镜像
./scripts/prod-start.sh --pull --build

# 启用 Nginx profile（要求先准备 config/nginx 与 ssl 目录）
./scripts/prod-start.sh --with-nginx

# 启用监控 profile
./scripts/prod-start.sh --monitoring

# 仅查看生产服务状态
./scripts/prod-start.sh --action status

# 查看后端日志
./scripts/prod-start.sh --action logs --service backend --follow

# 校验生产 Compose 配置
./scripts/prod-start.sh --action config

# 预览将要执行的 docker compose 命令，不实际执行
./scripts/prod-start.sh --dry-run

# 停止生产服务
./scripts/prod-start.sh --action stop
```

`down` 动作会移除生产容器和网络；如需删除数据卷必须显式追加
`-RemoveVolumes`，执行前请确认已有备份。

## 数据库管理

统一入口：

```powershell
.\scripts\db-manage.ps1 <start|stop|reset|backup|status|logs|init|verify|seed-admin>
```

```bash
./scripts/db-manage.sh <start|stop|reset|backup|status|logs|init|verify|seed-admin>
```

如果 Bash 环境提示没有执行权限，可改用 `bash scripts/db-manage.sh ...` 执行。

常用命令：

```powershell
# 启动 PostgreSQL 与 Redis
.\scripts\db-manage.ps1 start

# 查看数据库服务状态
.\scripts\db-manage.ps1 status

# 查看数据库服务日志
.\scripts\db-manage.ps1 logs

# 执行完整初始化（基础配置 + 内置模板）
.\scripts\db-manage.ps1 init

# 仅执行基础初始化
.\scripts\db-manage.ps1 init -InitOnly

# 仅导入内置模板
.\scripts\db-manage.ps1 init -TemplatesOnly

# 静态验证整合 SQL、文档归档和 Docker 引用
.\scripts\db-manage.ps1 verify

# 初始化默认管理员账号与 RBAC
.\scripts\db-manage.ps1 seed-admin -Username admin -Password admin123 -Email admin@admin.com -Role superadmin

# 停止服务
.\scripts\db-manage.ps1 stop
```

```bash
# 启动 PostgreSQL 与 Redis
./scripts/db-manage.sh start

# 查看数据库服务状态
./scripts/db-manage.sh status

# 执行完整初始化（基础配置 + 内置模板）
./scripts/db-manage.sh init --force

# 仅执行基础初始化
./scripts/db-manage.sh init --init-only --force

# 仅导入内置模板
./scripts/db-manage.sh init --templates-only --force

# 静态验证整合 SQL、文档归档和 Docker 引用
./scripts/db-manage.sh verify

# 初始化默认管理员账号与 RBAC
./scripts/db-manage.sh seed-admin --username admin --password admin123 --email admin@admin.com --role superadmin
```

`db-manage.ps1 init` 和 `db-manage.sh init` 均已合并原独立初始化脚本的能力：

- 基础数据库初始化
- TimescaleDB 扩展、hypertable、压缩策略和保留策略配置
- 带宽单位迁移
- 18 个内置巡检模板导入
- 静态整合验证

## 测试与维护

测试和质量检查不再通过独立封装脚本转发，按改动范围直接运行对应模块命令即可。
缓存清理已收敛到 `scripts/clean-cache.ps1` / `scripts/clean-cache.sh`，
不再保留测试脚本子目录。

### 常用验证命令

```powershell
# 后端测试
Push-Location backend-go
go test ./...
Pop-Location

# 前端类型检查
Push-Location frontend
pnpm run type-check
Pop-Location

# 前端单元测试
Push-Location frontend
pnpm test -- --runInBand
Pop-Location

# 前端 E2E 测试
Push-Location frontend
pnpm run test:e2e
Pop-Location
```

### 缓存清理

```powershell
# 交互式选择清理项
.\scripts\clean-cache.ps1

# 预览将要清理的内容，不实际删除
.\scripts\clean-cache.ps1 -All -WhatIf

# 清理所有缓存并跳过确认
.\scripts\clean-cache.ps1 -All -Force

# 仅清理前端构建缓存
.\scripts\clean-cache.ps1 -Frontend

# 仅清理 Go 构建缓存和编译产物
.\scripts\clean-cache.ps1 -GoBuild

# 仅清理历史重复报表输出目录（backend-go/backend-go）
.\scripts\clean-cache.ps1 -ReportArtifacts

# 仅清理 Playwright 测试报告和结果
.\scripts\clean-cache.ps1 -Playwright
```

```bash
# 交互式选择清理项
./scripts/clean-cache.sh

# 预览将要清理的内容，不实际删除
./scripts/clean-cache.sh --all --what-if

# 清理所有缓存并跳过确认
./scripts/clean-cache.sh --all --force

# 仅清理前端构建缓存
./scripts/clean-cache.sh --frontend

# 仅清理 Go 构建缓存和编译产物
./scripts/clean-cache.sh --go-build

# 仅清理历史重复报表输出目录（backend-go/backend-go）
./scripts/clean-cache.sh --report-artifacts

# 仅清理 Playwright 测试报告和结果
./scripts/clean-cache.sh --playwright
```

`clean-cache.ps1` 支持的清理目标：

- `-Backend`：后端覆盖率文件、临时目录和 Go 编译/测试缓存
- `-Frontend`：Next.js、Turbo、ESLint、SWC 和前端构建缓存
- `-Logs`：超过 7 天的项目日志
- `-Temp`：`.DS_Store`、`Thumbs.db`、`*.tmp`
- `-ProjectFiles`：运行时配置、Lint 报告、覆盖率和 MCP 快照
- `-GoBuild`：Go 项目缓存目录、编译产物和根目录覆盖率文件
- `-ReportArtifacts`：历史重复报表输出目录（仅 `backend-go/backend-go`，不清理当前 `backend-go/data/reports`）
- `-PackageCache`：项目内 pnpm store
- `-Playwright`：Playwright 报告、测试结果和 MCP 快照
- `-All`：执行以上全部清理项

安全选项：

- `-WhatIf`：仅预览，不实际删除
- `-Force`：跳过确认
- `-Verbose`：输出详细跳过原因和路径信息

## 使用建议

1. 新环境优先运行 `dev-start.ps1 -Setup`。
2. 日常开发优先使用 `dev-start.ps1`。
3. 生产部署优先使用 `prod-start.ps1` 包装 `docker-compose.prod.yml`。
4. 数据库操作在 Windows PowerShell 下使用 `db-manage.ps1`，在 Bash 环境下使用 `db-manage.sh`。
5. 开发、生产和缓存维护在 Bash 环境下分别使用 `dev-start.sh`、`prod-start.sh`、`clean-cache.sh`。
6. 提交前按改动范围运行后端、前端或 E2E 定向测试。
7. 新增脚本时同步更新本文件。
