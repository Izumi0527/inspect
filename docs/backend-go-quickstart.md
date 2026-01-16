# Go 后端快速启动指南

## 目标

本指南用于替代旧的 Python 后端开发方式，当前后端以 `backend-go` 为主，Python 后端仅保留历史代码，不再参与运行。

## 本地启动

1. 进入后端目录：
   ```bash
   cd backend-go
   ```
2. 下载依赖并启动：
   ```bash
   go mod download
   go run ./cmd/api
   ```

默认监听 `0.0.0.0:8000`，可通过 `.env` / `.env.development` 中的 `SERVER_HOST`、`SERVER_PORT` 覆盖。

## Docker 启动（开发）

```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

后端服务将使用 `backend-go/Dockerfile` 的 `development` 阶段运行。

## Docker 启动（生产）

```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

后端服务将使用 `backend-go/Dockerfile` 的 `release` 阶段运行。

## 数据库迁移说明

- 默认开启自动迁移：`DB_AUTO_MIGRATE=true`
- 默认启用 TimescaleDB：`TIMESCALE_ENABLED=true`
- 迁移包含所有业务表与时序指标表，并创建 hypertable 与索引

如需关闭自动迁移，请在环境变量中设置 `DB_AUTO_MIGRATE=false`。

如需单独执行迁移，可运行：

```bash
go run ./cmd/migrate
```

或使用脚本：

```powershell
.\scripts\database\db-init-migrate-go.ps1
```
