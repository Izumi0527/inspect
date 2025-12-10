# Docker开发环境数据库部署完整指南

## 概述

本文档提供企业级网络设备巡检系统在Docker开发环境中三种数据库的完整部署方案，包括PostgreSQL、Redis、InfluxDB的详细配置、部署命令、健康检查和备份策略。

## 目录

- [系统架构](#系统架构)
- [环境配置](#环境配置)
- [一键部署](#一键部署)
- [独立部署](#独立部署)
- [健康检查](#健康检查)
- [数据备份](#数据备份)
- [故障排查](#故障排查)
- [性能优化](#性能优化)

## 系统架构

### 三层数据库架构

```mermaid
graph TB
    A[企业级网络设备巡检系统] --> B[PostgreSQL<br/>主数据库<br/>端口:5433]
    A --> C[Redis<br/>缓存层<br/>端口:6380]
    A --> D[InfluxDB<br/>时序数据库<br/>端口:8087]
    
    B --> E[用户管理<br/>设备信息<br/>巡检记录]
    C --> F[会话缓存<br/>热点数据<br/>任务队列]
    D --> G[监控指标<br/>性能数据<br/>告警历史]
```

### 数据库配置对照表

| 数据库 | 版本 | 容器名 | 内部端口 | 外部端口 | 用户名 | 密码 | 数据库名 |
|--------|------|--------|----------|----------|--------|------|----------|
| **PostgreSQL** | 16-alpine | inspect-postgres-dev | 5432 | 5433 | inspect_dev | dev_password_2024 | inspect_system_dev |
| **Redis** | 7-alpine | inspect-redis-dev | 6379 | 6380 | - | dev_redis_2024 | - |
| **InfluxDB** | 2.7-alpine | inspect-influxdb-dev | 8086 | 8087 | dev_admin | dev_admin_2024 | - |

## 环境配置

### 前置条件检查

```bash
# 检查Docker安装
docker --version
docker-compose --version

# 检查系统资源
free -h    # 内存 (建议>4GB)
df -h      # 磁盘空间 (建议>10GB)

# 检查端口占用
netstat -tuln | grep -E ':(5433|6380|8087)'
```

### 环境变量配置

项目使用统一的环境配置文件 `.env.development`:

```bash
# 数据库配置 (开发环境端口)
DATABASE_URL=postgresql+asyncpg://inspect_dev:dev_password_2024@localhost:5433/inspect_system_dev
REDIS_URL=redis://:dev_redis_2024@localhost:6380/0
INFLUXDB_URL=http://localhost:8087
INFLUXDB_TOKEN=dev_token_2024
INFLUXDB_ORG=inspect-dev-org
INFLUXDB_BUCKET=monitoring-dev
```

## 一键部署

### 🚀 快速启动所有数据库

```bash
# 方法1: 使用项目脚本 (推荐)
./scripts/dev-start.sh

# 方法2: 使用docker-compose
docker-compose -f docker-compose.dev.yml up -d postgres-dev redis-dev influxdb-dev

# 方法3: 仅启动数据库服务
docker-compose -f docker-compose.dev.yml up -d postgres-dev redis-dev influxdb-dev
```

### 验证部署状态

```bash
# 查看服务状态
docker-compose -f docker-compose.dev.yml ps

# 查看容器日志
docker-compose -f docker-compose.dev.yml logs -f

# 运行健康检查
./scripts/db-health-check.sh
```

## 独立部署

### 1️⃣ PostgreSQL 独立部署

#### Docker Compose方式
```bash
# 启动PostgreSQL
docker-compose -f docker-compose.dev.yml up -d postgres-dev

# 查看日志
docker-compose -f docker-compose.dev.yml logs -f postgres-dev
```

#### Docker Run方式
```bash
# 启动容器
docker run -d \
  --name inspect-postgres-dev \
  -e POSTGRES_DB=inspect_system_dev \
  -e POSTGRES_USER=inspect_dev \
  -e POSTGRES_PASSWORD=dev_password_2024 \
  -p 5433:5432 \
  -v postgres_dev_data:/var/lib/postgresql/data \
  -v ./database/init.sql:/docker-entrypoint-initdb.d/init.sql:ro \
  --restart unless-stopped \
  postgres:16-alpine
```

#### 连接测试
```bash
# 容器内连接测试
docker exec -it inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev

# 宿主机连接测试  
psql -h localhost -p 5433 -U inspect_dev -d inspect_system_dev

# 查看数据库信息
docker exec -it inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "\l"
```

### 2️⃣ Redis 独立部署

#### Docker Compose方式
```bash
# 启动Redis
docker-compose -f docker-compose.dev.yml up -d redis-dev

# 查看日志
docker-compose -f docker-compose.dev.yml logs -f redis-dev
```

#### Docker Run方式
```bash
# 启动容器
docker run -d \
  --name inspect-redis-dev \
  -p 6380:6379 \
  -v redis_dev_data:/data \
  --restart unless-stopped \
  redis:7-alpine redis-server --requirepass dev_redis_2024
```

#### 连接测试
```bash
# 容器内连接测试
docker exec -it inspect-redis-dev redis-cli -a dev_redis_2024

# 宿主机连接测试
redis-cli -h localhost -p 6380 -a dev_redis_2024

# 基本操作测试
docker exec -it inspect-redis-dev redis-cli -a dev_redis_2024 ping
docker exec -it inspect-redis-dev redis-cli -a dev_redis_2024 set test_key "hello"
docker exec -it inspect-redis-dev redis-cli -a dev_redis_2024 get test_key
```

### 3️⃣ InfluxDB 独立部署

#### Docker Compose方式
```bash
# 启动InfluxDB
docker-compose -f docker-compose.dev.yml up -d influxdb-dev

# 查看日志
docker-compose -f docker-compose.dev.yml logs -f influxdb-dev
```

#### Docker Run方式
```bash
# 启动容器
docker run -d \
  --name inspect-influxdb-dev \
  -e DOCKER_INFLUXDB_INIT_MODE=setup \
  -e DOCKER_INFLUXDB_INIT_USERNAME=dev_admin \
  -e DOCKER_INFLUXDB_INIT_PASSWORD=dev_admin_2024 \
  -e DOCKER_INFLUXDB_INIT_ORG=inspect_dev \
  -e DOCKER_INFLUXDB_INIT_BUCKET=device_metrics_dev \
  -e DOCKER_INFLUXDB_INIT_ADMIN_TOKEN=dev_token_2024 \
  -p 8087:8086 \
  -v influxdb_dev_data:/var/lib/influxdb2 \
  --restart unless-stopped \
  influxdb:2.7-alpine
```

#### 连接测试
```bash
# HTTP API测试
curl -H "Authorization: Token dev_token_2024" http://localhost:8087/health

# 查看组织信息
curl -H "Authorization: Token dev_token_2024" http://localhost:8087/api/v2/orgs

# 查看存储桶
curl -H "Authorization: Token dev_token_2024" http://localhost:8087/api/v2/buckets

# Web界面访问
echo "InfluxDB Web界面: http://localhost:8087"
```

## 健康检查

### 自动健康检查

Docker Compose配置已包含自动健康检查：

```yaml
# PostgreSQL 健康检查
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U inspect_dev -d inspect_system_dev"]
  interval: 10s
  timeout: 5s
  retries: 5
  start_period: 30s

# Redis 健康检查
healthcheck:
  test: ["CMD", "redis-cli", "-a", "dev_redis_2024", "ping"]
  interval: 10s
  timeout: 3s
  retries: 5
  start_period: 30s

# InfluxDB 健康检查
healthcheck:
  test: ["CMD", "curl", "-f", "-H", "Authorization: Token dev_token_2024", "http://localhost:8086/health"]
  interval: 30s
  timeout: 10s
  retries: 5
  start_period: 60s
```

### 手动健康检查

```bash
# 运行完整健康检查脚本
./scripts/db-health-check.sh

# 查看容器健康状态
docker ps --format "table {{.Names}}\t{{.Status}}"

# 检查特定服务健康状态
docker inspect inspect-postgres-dev --format='{{.State.Health.Status}}'
docker inspect inspect-redis-dev --format='{{.State.Health.Status}}'
docker inspect inspect-influxdb-dev --format='{{.State.Health.Status}}'
```

## 数据备份

### 一键备份所有数据库

```bash
# 备份所有数据库
./scripts/db-backup.sh

# 只备份PostgreSQL
./scripts/db-backup.sh --postgresql

# 只备份Redis
./scripts/db-backup.sh --redis

# 只备份InfluxDB
./scripts/db-backup.sh --influxdb

# 清理7天前的备份
./scripts/db-backup.sh --cleanup 7
```

### 手动备份方法

#### PostgreSQL 手动备份
```bash
# SQL格式备份
docker exec inspect-postgres-dev pg_dump -U inspect_dev -d inspect_system_dev > backup.sql

# 压缩备份
docker exec inspect-postgres-dev pg_dump -U inspect_dev -d inspect_system_dev | gzip > backup.sql.gz

# Custom格式备份 (更快恢复)
docker exec inspect-postgres-dev pg_dump -U inspect_dev -d inspect_system_dev -Fc > backup.custom
```

#### Redis 手动备份
```bash
# 触发后台保存
docker exec inspect-redis-dev redis-cli -a dev_redis_2024 BGSAVE

# 复制RDB文件
docker cp inspect-redis-dev:/data/dump.rdb ./redis-backup.rdb
```

#### InfluxDB 手动备份
```bash
# 使用influx CLI备份
docker exec inspect-influxdb-dev influx backup \
  --host http://localhost:8086 \
  --token dev_token_2024 \
  --org inspect_dev \
  --bucket device_metrics_dev \
  /tmp/influx-backup

# 从容器复制备份
docker cp inspect-influxdb-dev:/tmp/influx-backup ./influxdb-backup/
```

### 数据恢复

#### PostgreSQL 数据恢复
```bash
# 从SQL备份恢复
docker exec -i inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev < backup.sql

# 从压缩备份恢复
gunzip -c backup.sql.gz | docker exec -i inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev

# 从Custom备份恢复
docker exec -i inspect-postgres-dev pg_restore -U inspect_dev -d inspect_system_dev -v backup.custom
```

#### Redis 数据恢复
```bash
# 停止Redis服务
docker-compose -f docker-compose.dev.yml stop redis-dev

# 复制备份文件到容器
docker cp ./redis-backup.rdb inspect-redis-dev:/data/dump.rdb

# 重启Redis服务
docker-compose -f docker-compose.dev.yml start redis-dev
```

#### InfluxDB 数据恢复
```bash
# 复制备份到容器
docker cp ./influxdb-backup/ inspect-influxdb-dev:/tmp/

# 恢复数据
docker exec inspect-influxdb-dev influx restore \
  --host http://localhost:8086 \
  --token dev_token_2024 \
  --org inspect_dev \
  --bucket device_metrics_dev \
  /tmp/influxdb-backup/
```

## 故障排查

### 常见问题及解决方案

#### 1. 端口冲突

**症状**: 容器启动失败，提示端口已被占用

```bash
# 检查端口占用
netstat -tuln | grep -E ':(5433|6380|8087)'
lsof -i :5433

# 解决方案
# 方法1: 停止占用端口的服务
sudo kill -9 $(lsof -t -i:5433)

# 方法2: 修改docker-compose.dev.yml中的端口映射
ports:
  - "5434:5432"  # 修改外部端口
```

#### 2. 容器启动失败

**症状**: docker-compose up 失败

```bash
# 查看详细错误日志
docker-compose -f docker-compose.dev.yml logs <service-name>

# 检查容器状态
docker ps -a

# 重新构建并启动
docker-compose -f docker-compose.dev.yml down
docker-compose -f docker-compose.dev.yml up --build -d
```

#### 3. 数据库连接失败

**症状**: 应用无法连接到数据库

```bash
# PostgreSQL连接测试
docker exec -it inspect-postgres-dev pg_isready -U inspect_dev

# Redis连接测试  
docker exec -it inspect-redis-dev redis-cli -a dev_redis_2024 ping

# InfluxDB连接测试
curl -H "Authorization: Token dev_token_2024" http://localhost:8087/health

# 检查网络连接
docker network ls
docker network inspect inspect_dev_network
```

#### 4. 数据持久化问题

**症状**: 容器重启后数据丢失

```bash
# 检查数据卷
docker volume ls
docker volume inspect postgres_dev_data

# 确认挂载配置
docker inspect inspect-postgres-dev | grep -A 10 "Mounts"
```

### 日志分析

```bash
# 查看所有服务日志
docker-compose -f docker-compose.dev.yml logs -f

# 查看特定时间段日志
docker-compose -f docker-compose.dev.yml logs --since="1h" postgres-dev

# 保存日志到文件
docker-compose -f docker-compose.dev.yml logs > database-logs.txt
```

### 性能监控

```bash
# 查看资源使用情况
docker stats

# 查看特定容器资源使用
docker stats inspect-postgres-dev inspect-redis-dev inspect-influxdb-dev

# PostgreSQL性能查询
docker exec -it inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "
SELECT schemaname, tablename, n_tup_ins, n_tup_upd, n_tup_del 
FROM pg_stat_user_tables ORDER BY n_tup_ins DESC;"

# Redis内存使用情况
docker exec inspect-redis-dev redis-cli -a dev_redis_2024 INFO memory
```

## 性能优化

### PostgreSQL 优化

```bash
# 优化PostgreSQL配置
cat >> postgresql.conf << EOF
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
maintenance_work_mem = 64MB
EOF
```

### Redis 优化

```bash
# 优化Redis配置
cat >> redis.conf << EOF
maxmemory 512mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
EOF
```

### InfluxDB 优化

```bash
# 设置数据保留策略
curl -X POST "http://localhost:8087/api/v2/buckets" \
  -H "Authorization: Token dev_token_2024" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "device_metrics_dev",
    "retentionRules": [
      {
        "type": "expire",
        "everySeconds": 2592000
      }
    ]
  }'
```

## 总结

本文档提供了企业级网络设备巡检系统Docker开发环境中三种数据库的完整部署方案。通过遵循本指南，您可以：

- ✅ 快速部署和配置所有数据库服务
- ✅ 实施健康检查和监控机制
- ✅ 建立可靠的数据备份和恢复流程
- ✅ 快速诊断和解决常见问题
- ✅ 优化数据库性能和资源使用

---

**文档版本**: v2.0  
**最后更新**: 2024-09-03  
**维护团队**: 系统架构团队