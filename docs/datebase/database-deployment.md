# 数据库部署与启动文档

## 目录
- [数据库架构概览](#数据库架构概览)
- [环境配置说明](#环境配置说明)
- [快速启动指南](#快速启动指南)
- [详细部署步骤](#详细部署步骤)
- [运维管理](#运维管理)
- [安全配置](#安全配置)
- [故障排查](#故障排查)

## 数据库架构概览

企业级网络设备巡检系统采用 **PostgreSQL + TimescaleDB 扩展** 与 **Redis** 的双存储架构：

```mermaid
graph TB
    A[应用层] --> B[PostgreSQL + TimescaleDB]
    A --> C[Redis]

    B --> D[业务数据/时序指标/报表归档]
    C --> E[缓存/会话/短期队列]
```

## 环境配置说明

```env
DATABASE_URL=postgresql://user:password@host:5432/database
REDIS_URL=redis://:password@host:6379/0
# TimescaleDB 复用 PostgreSQL 连接，无需单独配置
```

## 快速启动指南

### Docker（开发/测试）

```bash
docker-compose -f docker-compose.dev.yml up -d postgres redis
```

### 生产环境（示例）

- PostgreSQL 16+ 安装后启用 TimescaleDB 扩展。
- Redis 7+ 部署为独立服务。

## 详细部署步骤

### 1. PostgreSQL + TimescaleDB

1) 安装 PostgreSQL 与 TimescaleDB 扩展
2) 初始化数据库与扩展

```sql
CREATE EXTENSION IF NOT EXISTS "timescaledb";
```

推荐使用项目提供脚本：

```powershell
.\scripts\database\db-init-migrate-go.ps1
```

### 2. Redis

安装并设置密码后，更新 `REDIS_URL`。

## 运维管理

### 健康检查

```bash
# PostgreSQL
pg_isready -h host -p 5432 -U user

# Redis
redis-cli -h host -p 6379 -a password ping
```

### 备份

```bash
# PostgreSQL
pg_dump -h host -p 5432 -U user database > backups/postgres_backup.sql

# Redis
redis-cli -h host -p 6379 -a password --rdb backups/redis_backup.rdb
```

## 安全配置

- 禁用默认账号与弱密码
- 仅开放必要端口
- 生产环境强制 TLS（数据库侧与 API 侧分别配置）

## 故障排查

- 连接失败：检查 `DATABASE_URL` / `REDIS_URL` 配置
- 端口占用：确认防火墙与进程占用情况
- 权限问题：检查数据库用户权限与 schema 授权

---

如需更详细的 Docker 说明，请参考 `docs/datebase/database-docker-deployment.md`。
