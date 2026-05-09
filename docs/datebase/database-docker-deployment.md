# Docker开发环境数据库部署指南

## 概述

本项目在开发环境仅使用 **PostgreSQL + TimescaleDB 扩展** 与 **Redis**：
- PostgreSQL 负责业务数据与时序指标的统一存储（TimescaleDB 作为扩展启用）。
- Redis 负责缓存、会话与短期队列。

## 系统架构

```mermaid
graph TB
    A[企业级网络设备巡检系统] --> B[PostgreSQL + TimescaleDB<br/>端口:15500]
    A --> C[Redis<br/>端口:26380]

    B --> D[用户/设备/巡检/报表/指标]
    C --> E[会话缓存/热点数据/临时队列]
```

## 配置对照表

| 数据库 | 版本 | 容器名 | 内部端口 | 外部端口 | 用户名 | 密码 | 数据库名 |
|--------|------|--------|----------|----------|--------|------|----------|
| PostgreSQL | 16-alpine | inspect-postgres-dev | 5432 | 15500 | inspect_dev | dev_password_2024 | inspect_system_dev |
| Redis | 7-alpine | inspect-redis-dev | 6379 | 26380 | - | dev_redis_2024 | - |

> TimescaleDB 为 PostgreSQL 扩展，无需单独容器或端口。

## 环境变量

`.env.development` 示例：

```bash
DATABASE_URL=postgresql://inspect_dev:dev_password_2024@localhost:15500/inspect_system_dev
REDIS_URL=redis://:dev_redis_2024@localhost:26380/0
# TimescaleDB 复用 PostgreSQL 连接，无需单独配置
```

## 一键启动

```bash
# 启动数据库与开发辅助工具
# Linux/macOS
./scripts/dev-start.ps1

# 或仅启动数据库容器
docker-compose -f docker-compose.dev.yml up -d postgres redis
```

## TimescaleDB 初始化

- SQL 初始化脚本：`database/database-init-complete.sql`
- 模板脚本：`database/builtin-templates-complete.sql`
- 迁移与初始化脚本：`scripts/db-manage.ps1 init`

建议在首次启动后执行：

```powershell
.\scripts\db-manage.ps1 init
```

## 健康检查

```bash
# PostgreSQL
pg_isready -h localhost -p 15500 -U inspect_dev

# Redis
redis-cli -h localhost -p 26380 -a dev_redis_2024 ping
```

## 数据备份

```bash
# PostgreSQL 备份
pg_dump -h localhost -p 15500 -U inspect_dev inspect_system_dev > backups/postgres_backup.sql

# Redis 备份
redis-cli -h localhost -p 26380 -a dev_redis_2024 --rdb backups/redis_backup.rdb
```

## 故障排查

- 端口占用：`15500`、`26380`
- 容器状态：`docker-compose -f docker-compose.dev.yml ps`
- 日志查看：`docker-compose -f docker-compose.dev.yml logs -f postgres redis`

---

如需生产环境部署，请结合 `docs/datebase/database-deployment.md` 与实际基础设施规划调整。
