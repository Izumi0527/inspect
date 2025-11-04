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

### 整体架构

企业级网络设备巡检系统采用**三层数据库架构**，确保高可用性、高性能和数据安全：

```mermaid
graph TB
    A[应用层] --> B[PostgreSQL<br/>主数据库]
    A --> C[Redis<br/>缓存层]
    A --> D[InfluxDB<br/>时序数据库]
    
    B --> E[用户管理<br/>设备信息<br/>巡检记录]
    C --> F[会话缓存<br/>热点数据<br/>任务队列]
    D --> G[监控指标<br/>性能数据<br/>告警历史]
```

### 各数据库职责

| 数据库 | 版本 | 主要职责 | 数据类型 | 端口配置 |
|--------|------|----------|----------|----------|
| **PostgreSQL** | 16-alpine | 核心业务数据存储 | 关系型数据 | 5432/5433 |
| **Redis** | 7-alpine | 缓存和会话管理 | 键值对数据 | 6379/6380 |
| **InfluxDB** | 2.7-alpine | 时序数据存储 | 时间序列数据 | 8086/8087 |

### 数据流向图

```mermaid
sequenceDiagram
    participant U as 用户
    participant A as 应用层
    participant R as Redis
    participant P as PostgreSQL  
    participant I as InfluxDB

    U->>A: 登录请求
    A->>P: 验证用户信息
    P-->>A: 返回用户数据
    A->>R: 存储会话
    
    U->>A: 查询设备状态
    A->>R: 检查缓存
    alt 缓存未命中
        A->>P: 查询设备信息
        A->>I: 查询监控数据
        A->>R: 更新缓存
    end
    A-->>U: 返回设备状态
```

## 环境配置说明

### 环境对比表

| 配置项 | 开发环境 | 测试环境 | 生产环境 |
|--------|----------|----------|----------|
| **PostgreSQL** | | | |
| 端口 | 5433 | 5432 | 5432 |
| 数据库名 | inspect_system_dev | inspect_db | inspect_db |
| 用户名 | inspect_dev | postgres | postgres |
| 密码 | dev_password_2024 | password | ${POSTGRES_PASSWORD} |
| **Redis** | | | |
| 端口 | 6380 | 6379 | 6379 |
| 密码 | dev_redis_2024 | 无 | ${REDIS_PASSWORD} |
| **InfluxDB** | | | |
| 端口 | 8087 | 8086 | 8086 |
| 组织 | inspect_dev | inspect-org | inspect-org |
| Bucket | device_metrics_dev | device-metrics | device-metrics |
| Token | dev_token_2024 | my-super-secret-auth-token | ${INFLUXDB_TOKEN} |

### 环境变量文件

#### 开发环境 (.env.dev)
```bash
# 开发环境配置
NODE_ENV=development
ENVIRONMENT=development

# 数据库配置
DATABASE_URL=postgresql://inspect_dev:dev_password_2024@localhost:5433/inspect_system_dev
REDIS_URL=redis://:dev_redis_2024@localhost:6380/0
INFLUXDB_URL=http://localhost:8087

# API 配置
NEXT_PUBLIC_API_URL=http://localhost:8001
NEXT_PUBLIC_WS_URL=ws://localhost:8001

# 调试模式
DEBUG=true
LOG_LEVEL=debug
```

#### 生产环境 (.env.prod)
```bash
# 生产环境配置
NODE_ENV=production
ENVIRONMENT=production

# 数据库密码（敏感信息）
POSTGRES_PASSWORD=your_secure_postgres_password
REDIS_PASSWORD=your_secure_redis_password
INFLUXDB_PASSWORD=your_secure_influxdb_password
INFLUXDB_TOKEN=your_secure_influxdb_token

# 应用密钥
SECRET_KEY=your_production_secret_key

# API 配置
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

## 快速启动指南

### 前置条件检查

```bash
# 检查 Docker 安装
docker --version
docker-compose --version

# 检查系统资源
free -h    # 内存
df -h      # 磁盘空间
```

### 一键启动命令

#### 开发环境
```bash
# 标准启动
./scripts/dev-start.sh

# 清理后启动
./scripts/dev-start.sh --clean

# 启动并查看实时日志
./scripts/dev-start.sh --follow-logs
```

#### 测试环境
```bash
# 启动测试环境
docker-compose up -d

# 查看服务状态
docker-compose ps
```

#### 生产环境
```bash
# 部署生产环境
./scripts/prod-deploy.sh

# 或手动部署
docker-compose -f docker-compose.prod.yml up -d
```

### 服务访问地址

#### 开发环境
- 🌐 前端应用: http://localhost:3000
- 🚀 后端API: http://localhost:8001
- 📊 API文档: http://localhost:8001/docs
- 🗄️ PostgreSQL: localhost:5433
- 🔄 Redis: localhost:6380
- 📈 InfluxDB: http://localhost:8087

#### 生产环境
- 🌐 前端应用: https://yourdomain.com
- 🚀 后端API: https://api.yourdomain.com
- 🗄️ 数据库: 内部网络访问
- 🔄 缓存: 内部网络访问
- 📈 时序数据库: 内部网络访问

## 详细部署步骤

### PostgreSQL 部署配置

#### 开发环境配置
```yaml
postgres-dev:
  image: postgres:16-alpine
  container_name: inspect-postgres-dev
  environment:
    POSTGRES_DB: inspect_system_dev
    POSTGRES_USER: inspect_dev
    POSTGRES_PASSWORD: dev_password_2024
  volumes:
    - postgres_dev_data:/var/lib/postgresql/data
    - ./database/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
  ports:
    - "5433:5432"
  networks:
    - inspect_dev_network
  restart: unless-stopped
```

#### 初始化脚本 (database/init.sql)
```sql
-- 创建扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 创建数据库用户
CREATE USER inspect_app WITH PASSWORD 'app_password';
GRANT CONNECT ON DATABASE inspect_system_dev TO inspect_app;

-- 设置时区
SET timezone = 'Asia/Shanghai';
```

#### 数据迁移
```bash
# 运行数据库迁移
./scripts/db-migrate.sh

# 或手动执行
cd backend
alembic upgrade head
```

### Redis 部署配置

#### 开发环境配置
```yaml
redis-dev:
  image: redis:7-alpine
  container_name: inspect-redis-dev
  command: redis-server --requirepass dev_redis_2024
  volumes:
    - redis_dev_data:/data
  ports:
    - "6380:6379"
  networks:
    - inspect_dev_network
  restart: unless-stopped
```

#### Redis 配置文件优化
```bash
# 创建 Redis 配置文件
cat > config/redis/redis.conf << EOF
# 内存优化
maxmemory 256mb
maxmemory-policy allkeys-lru

# 持久化配置
save 900 1
save 300 10
save 60 10000

# 安全配置
requirepass dev_redis_2024
protected-mode yes

# 网络配置
bind 0.0.0.0
port 6379

# 日志配置
loglevel notice
logfile /var/log/redis.log
EOF
```

### InfluxDB 部署配置

#### 开发环境配置
```yaml
influxdb-dev:
  image: influxdb:2.7-alpine
  container_name: inspect-influxdb-dev
  environment:
    DOCKER_INFLUXDB_INIT_MODE: setup
    DOCKER_INFLUXDB_INIT_USERNAME: dev_admin
    DOCKER_INFLUXDB_INIT_PASSWORD: dev_admin_2024
    DOCKER_INFLUXDB_INIT_ORG: inspect_dev
    DOCKER_INFLUXDB_INIT_BUCKET: device_metrics_dev
    DOCKER_INFLUXDB_INIT_ADMIN_TOKEN: dev_token_2024
  volumes:
    - influxdb_dev_data:/var/lib/influxdb2
  ports:
    - "8087:8086"
  networks:
    - inspect_dev_network
  restart: unless-stopped
```

#### 初始化数据结构
```bash
# InfluxDB 数据结构初始化脚本
curl -X POST "http://localhost:8087/api/v2/buckets" \
  -H "Authorization: Token dev_token_2024" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "device_alerts_dev",
    "description": "设备告警数据",
    "orgID": "your-org-id",
    "retentionRules": [
      {
        "type": "expire",
        "everySeconds": 2592000
      }
    ]
  }'
```

## 运维管理

### 健康检查

#### 服务状态检查
```bash
# 检查所有服务状态
docker-compose ps

# 检查特定服务
docker-compose ps postgres
docker-compose ps redis
docker-compose ps influxdb

# 服务健康检查
./scripts/health-check.sh
```

#### 数据库连接测试
```bash
# PostgreSQL 连接测试
docker exec -it inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "SELECT version();"

# Redis 连接测试
docker exec -it inspect-redis-dev redis-cli -a dev_redis_2024 ping

# InfluxDB 连接测试
curl -H "Authorization: Token dev_token_2024" http://localhost:8087/health
```

### 日志查看

#### 实时日志监控
```bash
# 查看所有服务日志
docker-compose -f docker-compose.dev.yml logs -f

# 查看特定服务日志
docker-compose -f docker-compose.dev.yml logs -f postgres-dev
docker-compose -f docker-compose.dev.yml logs -f redis-dev
docker-compose -f docker-compose.dev.yml logs -f influxdb-dev

# 查看最近100行日志
docker-compose -f docker-compose.dev.yml logs --tail=100 postgres-dev
```

#### 日志文件位置
```
logs/
├── backend/
│   ├── app.log
│   └── error.log
├── frontend/
│   └── dev.log
└── databases/
    ├── postgres.log
    ├── redis.log
    └── influxdb.log
```

### 备份策略

#### PostgreSQL 数据备份
```bash
# 创建备份脚本
cat > scripts/backup-postgres.sh << 'EOF'
#!/bin/bash

BACKUP_DIR="./backups/postgres"
DATE=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="inspect_db_backup_${DATE}.sql"

mkdir -p $BACKUP_DIR

docker exec inspect-postgres-dev pg_dump \
  -U postgres \
  -d inspect_db \
  --clean --if-exists \
  > "${BACKUP_DIR}/${BACKUP_FILE}"

echo "数据库备份完成: ${BACKUP_DIR}/${BACKUP_FILE}"

# 删除7天前的备份
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
EOF

chmod +x scripts/backup-postgres.sh
```

#### Redis 数据备份
```bash
# Redis 数据备份
docker exec inspect-redis-dev redis-cli -a dev_redis_2024 BGSAVE

# 复制 RDB 文件
docker cp inspect-redis-dev:/data/dump.rdb ./backups/redis/dump_$(date +%Y%m%d_%H%M%S).rdb
```

#### InfluxDB 数据备份
```bash
# InfluxDB 数据备份
influx backup \
  --host http://localhost:8087 \
  --token dev_token_2024 \
  ./backups/influxdb/backup_$(date +%Y%m%d_%H%M%S)
```

### 性能监控

#### 数据库性能监控
```bash
# PostgreSQL 性能统计
docker exec -it inspect-postgres-dev psql -U postgres -d inspect_db -c "
SELECT 
    schemaname,
    tablename,
    n_tup_ins as inserts,
    n_tup_upd as updates,
    n_tup_del as deletes
FROM pg_stat_user_tables 
ORDER BY n_tup_ins DESC;
"

# Redis 内存使用情况
docker exec inspect-redis-dev redis-cli -a dev_redis_2024 INFO memory

# InfluxDB 存储统计
curl -H "Authorization: Token dev_token_2024" \
  "http://localhost:8087/api/v2/buckets" | jq '.buckets[] | {name, description}'
```

## 安全配置

### 密码管理最佳实践

#### 开发环境安全配置
```bash
# 生成安全密码
openssl rand -base64 32

# 创建密码文件（生产环境）
cat > .env.secrets << 'EOF'
POSTGRES_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)
INFLUXDB_TOKEN=$(openssl rand -base64 32)
SECRET_KEY=$(openssl rand -base64 64)
EOF

# 设置文件权限
chmod 600 .env.secrets
```

#### 网络隔离配置
```yaml
# Docker 网络安全配置
networks:
  inspect_network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
          gateway: 172.20.0.1
  
  # 数据库专用网络
  database_network:
    driver: bridge
    internal: true  # 仅内部访问
```

### SSL/TLS 配置

#### PostgreSQL SSL 配置
```bash
# 生成 SSL 证书
openssl req -new -x509 -days 365 -nodes -text \
  -out server.crt \
  -keyout server.key \
  -subj "/CN=postgres.local"

# 更新 PostgreSQL 配置
cat >> postgresql.conf << 'EOF'
ssl = on
ssl_cert_file = '/var/lib/postgresql/server.crt'
ssl_key_file = '/var/lib/postgresql/server.key'
EOF
```

## 故障排查

### 常见问题及解决方案

#### 1. PostgreSQL 连接失败
**症状**: 应用无法连接到 PostgreSQL
```bash
# 诊断步骤
docker logs inspect-postgres-dev
docker exec -it inspect-postgres-dev pg_isready -U postgres

# 解决方案
docker-compose restart postgres-dev
```

#### 2. Redis 内存不足
**症状**: Redis 返回 OOM 错误
```bash
# 检查内存使用
docker exec inspect-redis-dev redis-cli -a dev_redis_2024 INFO memory

# 解决方案：清理缓存
docker exec inspect-redis-dev redis-cli -a dev_redis_2024 FLUSHDB
```

#### 3. InfluxDB 查询超时
**症状**: 时序数据查询响应慢
```bash
# 检查查询性能
curl -H "Authorization: Token dev_token_2024" \
  "http://localhost:8087/api/v2/query?org=inspect_dev" \
  -d 'from(bucket:"device_metrics_dev") |> range(start:-1h) |> limit(n:10)'

# 解决方案：优化查询或增加资源
```

### 调试命令集合

#### 快速诊断工具
```bash
# 系统资源检查
./scripts/system-check.sh

# 网络连接测试  
./scripts/network-test.sh

# 数据库连接测试
./scripts/db-test.sh

# 服务依赖检查
./scripts/dependency-check.sh
```

#### 紧急恢复流程
```bash
# 1. 停止所有服务
docker-compose -f docker-compose.dev.yml down

# 2. 清理损坏的容器和网络
docker system prune -f

# 3. 从备份恢复数据
./scripts/restore-from-backup.sh

# 4. 重新启动服务
./scripts/dev-start.sh --clean
```

### 监控告警配置

#### Prometheus 监控配置
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'postgres-exporter'
    static_configs:
      - targets: ['localhost:9187']
  
  - job_name: 'redis-exporter'  
    static_configs:
      - targets: ['localhost:9121']

  - job_name: 'influxdb'
    static_configs:
      - targets: ['localhost:8087']
```

## 总结

本文档涵盖了企业级网络设备巡检系统的完整数据库部署和运维方案。通过遵循本文档的配置和操作指南，可以确保：

- ✅ **高可用性**: 三层数据库架构保证服务稳定性
- ✅ **高性能**: Redis 缓存层显著提升响应速度  
- ✅ **数据安全**: 完整的备份恢复和安全配置
- ✅ **易于运维**: 自动化脚本和监控告警机制
- ✅ **环境隔离**: 开发、测试、生产环境独立配置

如有任何问题，请参考故障排查章节或联系系统管理员。

---

*文档版本: v1.0*  
*最后更新: 2025-08-25*  
*维护人员: 系统架构团队*