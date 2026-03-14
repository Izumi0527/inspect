# 企业级网络设备巡检系统开发环境指南（Go 版）

## 概述

后端已迁移至 Go（Echo + GORM），Python 后端仅保留历史代码，不再参与运行。本指南聚焦当前可用的 Go 开发环境。

## 系统要求

### 硬件建议

| 组件 | 最低配置 | 推荐配置 | 说明 |
|------|----------|----------|------|
| CPU | 4 核 | 8 核+ | 支持并行构建与容器运行 |
| 内存 | 8GB | 16GB+ | 数据库与前端工具需要充足内存 |
| 存储 | 100GB | 256GB SSD | SSD 提升依赖安装与容器性能 |

### 主要工具

- Git
- Docker + Docker Compose
- Node.js 20+
- pnpm 8+
- Go 1.22+

## 架构概览

```mermaid
graph TB
    A[开发者工作站] --> B[前端开发环境]
    A --> C[后端开发环境]
    A --> D[数据库环境]
    B --> E[Node.js + pnpm + Next.js]
    C --> F[Go + Echo + GORM]
    D --> G[PostgreSQL + TimescaleDB + Redis]
```

## 环境安装

### Go 安装

- 下载地址：https://go.dev/dl/
- 安装后确认：
  ```bash
  go version
  ```

### Node.js 与 pnpm

```bash
node --version
pnpm --version
```

## 启动方式

### 方式 1：Docker（推荐）

```bash
docker-compose -f docker-compose.dev.yml up -d
```

此模式会启动数据库、后端、前端等完整服务。

### 方式 2：本地启动（适用于网络受限）

1. 启动数据库
   ```bash
   docker-compose -f docker-compose.dev.yml up -d postgres redis
   ```

2. 启动后端
   ```bash
   cd backend-go
   go mod download
   go run ./cmd/api
   ```

3. 启动前端
   ```bash
   cd frontend
   pnpm install
   pnpm dev
   ```

## 服务状态检查

```bash
# 后端健康检查
curl http://localhost:38000/health

# 前端
curl http://localhost:3000

# 数据库
psql -h localhost -p 15500 -U inspect_dev -d inspect_system_dev
```

## 环境变量配置

后端默认读取根目录 `.env`。如需使用其他环境文件，可设置 `ENV_FILE` 指向（例如 `.env.development`），并确保相关变量可用。

```env
SERVER_HOST=0.0.0.0
SERVER_PORT=38000
DATABASE_URL=postgresql://inspect_dev:dev_password_2024@localhost:15500/inspect_system_dev
REDIS_URL=redis://:dev_redis_2024@localhost:16380/0
DB_AUTO_MIGRATE=true
TIMESCALE_ENABLED=true
```

## 常见问题

### 1. Docker 镜像拉取失败

```bash
curl -I https://registry-1.docker.io
```

可配置镜像加速或切换为本地开发模式。

### 2. Go 未安装或版本过低

建议安装 Go 1.22+：https://go.dev/dl/

### 3. 端口冲突

```bash
# Windows
netstat -an | findstr :15500

# Linux/macOS
lsof -i :15500
```

## 常用脚本

```powershell
# 一键设置开发环境
.\scripts\development\setup-dev-env.ps1

# 启动后端（推荐：自动包含数据库检查）
.\scripts\development\dev-start.ps1 -Services backend

# 数据库迁移（Go）
.\scripts\database\db-init-migrate-go.ps1
```

## 测试与质量

```bash
# 后端测试
cd backend-go
go test ./...

# 前端测试
cd frontend
pnpm test --run
```

## VS Code 推荐扩展

- Go
- ESLint
- Tailwind CSS IntelliSense
- Docker

## 旧版说明

Python/uv 相关内容已废弃，仅保留历史参考：
- `../legacy/docs/python-environment-setup.md`
- `../legacy/docs/uv-package-manager-guide.md`
