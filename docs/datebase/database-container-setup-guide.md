# Docker 数据库容器创建指南

## 📋 概述

本指南说明如何创建和配置 Docker 容器中的数据库服务：
- **PostgreSQL 16** with **TimescaleDB 2.15.3** - 时序数据库
- **Redis 7** - 缓存服务

## 🎯 快速开始

### 方式一：一键启动（推荐）

```powershell
# 快速启动数据库容器
.\scripts\database\db-quick-start.ps1
```

### 方式二：完整创建（带验证）

```powershell
# 完整创建流程（推荐首次使用）
.\scripts\database\db-create-containers.ps1

# 清理旧数据并重新创建
.\scripts\database\db-create-containers.ps1 -Clean

# 详细输出模式
.\scripts\database\db-create-containers.ps1 -Verbose

# 强制执行（跳过确认）
.\scripts\database\db-create-containers.ps1 -Force
```

### 方式三：手动创建

```powershell
# 1. 拉取镜像
docker-compose -f docker-compose.yml -f docker-compose.dev.yml pull postgres redis

# 2. 创建并启动容器
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis

# 3. 查看容器状态
docker-compose -f docker-compose.yml -f docker-compose.dev.yml ps

# 4. 查看日志
docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f postgres redis
```

## 📦 容器配置详情

### PostgreSQL (TimescaleDB)

| 配置项 | 值 |
|--------|-----|
| 镜像 | timescale/timescaledb:2.15.3-pg16 |
| 容器名 | inspect-postgres-dev |
| 内部端口 | 5432 |
| 外部端口 | 15500 |
| 数据库名 | inspect_system_dev |
| 用户名 | inspect_dev |
| 密码 | dev_password_2024 |
| 数据卷 | postgres_data |
| 网络 | inspect_network |

**连接字符串：**
```
postgresql://inspect_dev:dev_password_2024@localhost:15500/inspect_system_dev
```

**扩展：**
- ✅ TimescaleDB - 时序数据库扩展
- ✅ uuid-ossp - UUID 生成
- ✅ pg_stat_statements - 查询统计

### Redis

| 配置项 | 值 |
|--------|-----|
| 镜像 | redis:7-alpine |
| 容器名 | inspect-redis-dev |
| 内部端口 | 6379 |
| 外部端口 | 16379 |
| 密码 | dev_redis_2024 |
| 数据卷 | redis_data |
| 持久化 | AOF (appendonly yes) |
| 网络 | inspect_network |

**连接字符串：**
```
redis://:dev_redis_2024@localhost:16379/0
```

## 🔧 数据库初始化

容器启动时会自动执行以下初始化脚本：

1. **database-init-complete.sql** - 基础数据库结构
   - 创建扩展（TimescaleDB, uuid-ossp, pg_stat_statements）
   - 创建用户和权限
   - 创建所有表结构
   - 创建索引和约束
   - 配置 TimescaleDB 超表

2. **builtin-templates-complete.sql** - 内置模板数据
   - 巡检模板
   - 检查项配置
   - 默认设置

## 📊 验证安装

### 检查容器状态

```powershell
# 查看容器运行状态
docker-compose -f docker-compose.yml -f docker-compose.dev.yml ps

# 预期输出：
# NAME                    STATUS              PORTS
# inspect-postgres-dev    Up                  0.0.0.0:15500->5432/tcp
# inspect-redis-dev       Up                  0.0.0.0:16379->6379/tcp
```

### 测试 PostgreSQL 连接

```powershell
# 方式 1: 使用 pg_isready
docker exec inspect-postgres-dev pg_isready -U inspect_dev -d inspect_system_dev

# 方式 2: 使用 psql
docker exec -it inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev

# 方式 3: 从宿主机连接（需要安装 psql 客户端）
psql -h localhost -p 15500 -U inspect_dev -d inspect_system_dev
```

### 测试 Redis 连接

```powershell
# 方式 1: Ping 测试
docker exec inspect-redis-dev redis-cli -a dev_redis_2024 ping

# 方式 2: 进入 Redis CLI
docker exec -it inspect-redis-dev redis-cli -a dev_redis_2024

# 方式 3: 从宿主机连接（需要安装 redis-cli）
redis-cli -h localhost -p 16379 -a dev_redis_2024
```

### 验证 TimescaleDB 扩展

```powershell
# 检查 TimescaleDB 版本
docker exec inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'timescaledb';"

# 预期输出：
#   extname   | extversion
# ------------+------------
#  timescaledb | 2.15.3
```

### 验证数据库表

```powershell
# 列出所有表
docker exec inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "\dt"

# 检查关键表
docker exec inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"
```

## 🗄️ 数据持久化

### 数据卷位置

```powershell
# 查看数据卷
docker volume ls | findstr inspect

# 预期输出：
# local     inspect_postgres_data
# local     inspect_redis_data

# 查看数据卷详情
docker volume inspect inspect_postgres_data
docker volume inspect inspect_redis_data
```

### 备份数据

```powershell
# PostgreSQL 备份
docker exec inspect-postgres-dev pg_dump -U inspect_dev inspect_system_dev > backups/postgres/backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql

# Redis 备份（触发 BGSAVE）
docker exec inspect-redis-dev redis-cli -a dev_redis_2024 BGSAVE

# 复制 Redis RDB 文件
docker cp inspect-redis-dev:/data/dump.rdb backups/redis/dump_$(Get-Date -Format 'yyyyMMdd_HHmmss').rdb
```

### 恢复数据

```powershell
# PostgreSQL 恢复
docker exec -i inspect-postgres-dev psql -U inspect_dev inspect_system_dev < backups/postgres/backup.sql

# Redis 恢复
docker cp backups/redis/dump.rdb inspect-redis-dev:/data/dump.rdb
docker-compose -f docker-compose.yml -f docker-compose.dev.yml restart redis
```

## 🔍 常用管理命令

### 容器管理

```powershell
# 启动容器
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis

# 停止容器
docker-compose -f docker-compose.yml -f docker-compose.dev.yml stop postgres redis

# 重启容器
docker-compose -f docker-compose.yml -f docker-compose.dev.yml restart postgres redis

# 删除容器（保留数据）
docker-compose -f docker-compose.yml -f docker-compose.dev.yml down

# 删除容器和数据卷
docker-compose -f docker-compose.yml -f docker-compose.dev.yml down -v
```

### 日志查看

```powershell
# 查看实时日志
docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f postgres redis

# 查看最近 100 行日志
docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs --tail=100 postgres redis

# 查看特定容器日志
docker logs inspect-postgres-dev
docker logs inspect-redis-dev
```

### 进入容器

```powershell
# 进入 PostgreSQL 容器
docker exec -it inspect-postgres-dev bash

# 进入 Redis 容器
docker exec -it inspect-redis-dev sh

# 直接进入 psql
docker exec -it inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev

# 直接进入 redis-cli
docker exec -it inspect-redis-dev redis-cli -a dev_redis_2024
```

## 🚨 故障排查

### 问题 1: 容器无法启动

```powershell
# 查看详细错误
docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs postgres redis

# 检查端口占用
netstat -ano | findstr "15500 16379"

# 检查 Docker 资源
docker system df
docker system prune  # 清理未使用的资源
```

### 问题 2: 端口冲突

```powershell
# 查找占用进程
Get-Process -Id (Get-NetTCPConnection -LocalPort 15500).OwningProcess
Get-Process -Id (Get-NetTCPConnection -LocalPort 16379).OwningProcess

# 停止占用进程或修改端口配置
# 编辑 docker-compose.dev.yml 修改端口映射
```

### 问题 3: 数据库连接失败

```powershell
# 检查容器健康状态
docker inspect inspect-postgres-dev | findstr Health
docker inspect inspect-redis-dev | findstr Health

# 检查网络连接
docker network inspect inspect_network

# 重启容器
docker-compose -f docker-compose.yml -f docker-compose.dev.yml restart postgres redis
```

### 问题 4: TimescaleDB 扩展未加载

```powershell
# 手动创建扩展
docker exec inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"

# 检查扩展状态
docker exec inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "SELECT * FROM pg_extension;"
```

### 问题 5: 数据丢失

```powershell
# 检查数据卷是否存在
docker volume ls | findstr inspect

# 如果数据卷被删除，从备份恢复
docker exec -i inspect-postgres-dev psql -U inspect_dev inspect_system_dev < backups/postgres/latest_backup.sql
```

## 🔐 安全配置

### 生产环境建议

1. **修改默认密码**
   ```yaml
   # docker-compose.prod.yml
   environment:
     POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}  # 使用环境变量
     REDIS_PASSWORD: ${REDIS_PASSWORD}
   ```

2. **限制网络访问**
   ```yaml
   # 只允许内部网络访问
   networks:
     - inspect_network
   # 不暴露端口到宿主机
   # ports:
   #   - "15500:5432"  # 注释掉
   ```

3. **启用 SSL/TLS**
   ```yaml
   # PostgreSQL SSL 配置
   command: postgres -c ssl=on -c ssl_cert_file=/etc/ssl/certs/server.crt
   ```

4. **定期备份**
   ```powershell
   # 设置定时任务
   # 每天凌晨 2 点备份
   ```

## 📚 相关文档

- [Docker 部署文档](./database-docker-deployment.md)
- [端口变更指南](./database-port-change-guide.md)
- [数据库管理脚本](../../scripts/database/db-manage.ps1)
- [健康检查脚本](../../scripts/database/db-health-check.ps1)

## 🎓 学习资源

### PostgreSQL & TimescaleDB
- [PostgreSQL 官方文档](https://www.postgresql.org/docs/)
- [TimescaleDB 文档](https://docs.timescale.com/)
- [TimescaleDB 最佳实践](https://docs.timescale.com/timescaledb/latest/how-to-guides/)

### Redis
- [Redis 官方文档](https://redis.io/documentation)
- [Redis 持久化](https://redis.io/topics/persistence)
- [Redis 最佳实践](https://redis.io/topics/best-practices)

### Docker
- [Docker Compose 文档](https://docs.docker.com/compose/)
- [Docker 网络](https://docs.docker.com/network/)
- [Docker 数据卷](https://docs.docker.com/storage/volumes/)

## ✅ 检查清单

创建容器前：
- [ ] Docker 服务已启动
- [ ] 端口 15500 和 16379 可用
- [ ] 初始化脚本文件存在
- [ ] 有足够的磁盘空间

创建容器后：
- [ ] 容器状态为 Up
- [ ] PostgreSQL 连接成功
- [ ] Redis 连接成功
- [ ] TimescaleDB 扩展已加载
- [ ] 数据库表已创建
- [ ] 数据卷已创建

## 📞 获取帮助

如遇问题：
1. 查看容器日志
2. 检查本文档的故障排查部分
3. 查看相关文档
4. 联系技术支持

---

**最后更新**: 2026-01-27  
**维护者**: DevOps Team
