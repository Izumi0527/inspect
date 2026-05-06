# Docker 数据库端口变更指南

## 📋 变更概述

本文档说明如何变更 Docker 容器中 PostgreSQL 和 Redis 的端口映射。

### 当前端口配置

| 服务 | 容器内部端口 | 宿主机端口 | 变更前端口 |
|------|-------------|-----------|-----------|
| PostgreSQL | 5432 | **15500** | 5433 |
| Redis | 6379 | **16380** | 6380 |

## 🔧 端口变更步骤

### 1. 停止现有容器

```powershell
# 停止所有服务
docker-compose -f docker-compose.dev.yml down

# 或者只停止数据库服务
docker-compose -f docker-compose.dev.yml stop postgres redis
```

### 2. 修改配置文件

需要修改以下文件中的端口配置：

#### Docker Compose 配置
- `docker-compose.dev.yml` - 开发环境端口映射

```yaml
services:
  postgres:
    ports:
      - "15500:5432"  # 宿主机:容器
  
  redis:
    ports:
      - "16380:6379"  # 宿主机:容器
```

#### 环境变量配置
- `.env.development` - 开发环境变量
- `.env.example` - 示例配置

```bash
DATABASE_URL=postgresql://inspect_dev:dev_password_2024@localhost:15500/inspect_system_dev
REDIS_URL=redis://:dev_redis_2024@localhost:16380/0
```

### 3. 启动容器

```powershell
# 启动所有服务
docker-compose -f docker-compose.dev.yml up -d

# 或者只启动数据库服务
docker-compose -f docker-compose.dev.yml up -d postgres redis
```

### 4. 验证端口变更

```powershell
# 检查容器状态
docker-compose -f docker-compose.dev.yml ps

# 检查端口监听
netstat -an | findstr "15500 16380"

# 测试 PostgreSQL 连接
docker exec inspect-postgres-dev pg_isready -U inspect_dev

# 测试 Redis 连接
docker exec inspect-redis-dev redis-cli -a dev_redis_2024 ping
```

## 📝 完整变更命令

```powershell
# ===== 完整端口变更流程 =====

# 1. 停止服务
Write-Host "停止现有服务..." -ForegroundColor Yellow
docker-compose -f docker-compose.dev.yml down

# 2. 备份数据（可选但推荐）
Write-Host "备份数据库..." -ForegroundColor Yellow
# PostgreSQL 备份
docker-compose -f docker-compose.dev.yml up -d postgres
Start-Sleep -Seconds 5
docker exec inspect-postgres-dev pg_dump -U inspect_dev inspect_system_dev > backups/postgres/backup_before_port_change.sql
docker-compose -f docker-compose.dev.yml stop postgres

# 3. 清理旧容器（如果需要）
Write-Host "清理旧容器..." -ForegroundColor Yellow
docker-compose -f docker-compose.dev.yml rm -f postgres redis

# 4. 启动服务（使用新端口）
Write-Host "启动服务（新端口）..." -ForegroundColor Green
docker-compose -f docker-compose.dev.yml up -d

# 5. 等待服务就绪
Write-Host "等待服务就绪..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# 6. 验证连接
Write-Host "验证数据库连接..." -ForegroundColor Green

# PostgreSQL
$pgTest = docker exec inspect-postgres-dev pg_isready -U inspect_dev
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ PostgreSQL 连接成功 (端口 15500)" -ForegroundColor Green
} else {
    Write-Host "❌ PostgreSQL 连接失败" -ForegroundColor Red
}

# Redis
$redisTest = docker exec inspect-redis-dev redis-cli -a dev_redis_2024 ping
if ($redisTest -eq "PONG") {
    Write-Host "✅ Redis 连接成功 (端口 16380)" -ForegroundColor Green
} else {
    Write-Host "❌ Redis 连接失败" -ForegroundColor Red
}

# 7. 显示服务信息
Write-Host "`n📊 服务信息:" -ForegroundColor Cyan
docker-compose -f docker-compose.dev.yml ps

Write-Host "`n🔌 端口映射:" -ForegroundColor Cyan
Write-Host "  PostgreSQL: localhost:15500 -> container:5432" -ForegroundColor White
Write-Host "  Redis:      localhost:16380 -> container:6379" -ForegroundColor White
```

## 🔍 连接测试命令

### PostgreSQL 连接测试

```powershell
# 使用 psql 客户端
psql -h localhost -p 15500 -U inspect_dev -d inspect_system_dev

# 使用 Docker 内部连接
docker exec -it inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev

# 使用 pg_isready 检查
pg_isready -h localhost -p 15500 -U inspect_dev
```

### Redis 连接测试

```powershell
# 使用 redis-cli 客户端
redis-cli -h localhost -p 16380 -a dev_redis_2024

# 使用 Docker 内部连接
docker exec -it inspect-redis-dev redis-cli -a dev_redis_2024

# Ping 测试
redis-cli -h localhost -p 16380 -a dev_redis_2024 ping
```

## 🚨 故障排查

### 端口已被占用

```powershell
# 检查端口占用
netstat -ano | findstr "15500"
netstat -ano | findstr "16380"

# 查找占用进程
Get-Process -Id (Get-NetTCPConnection -LocalPort 15500).OwningProcess
Get-Process -Id (Get-NetTCPConnection -LocalPort 16380).OwningProcess

# 停止占用进程（谨慎操作）
Stop-Process -Id <PID> -Force
```

### 容器无法启动

```powershell
# 查看容器日志
docker-compose -f docker-compose.dev.yml logs postgres
docker-compose -f docker-compose.dev.yml logs redis

# 查看详细错误
docker logs inspect-postgres-dev
docker logs inspect-redis-dev
```

### 连接被拒绝

```powershell
# 检查容器状态
docker ps -a | findstr "inspect-postgres\|inspect-redis"

# 检查网络连接
docker network inspect inspect_network

# 重启容器
docker-compose -f docker-compose.dev.yml restart postgres redis
```

### 数据丢失

```powershell
# 恢复 PostgreSQL 备份
docker exec -i inspect-postgres-dev psql -U inspect_dev inspect_system_dev < backups/postgres/backup_before_port_change.sql

# 恢复 Redis 备份（如果有 RDB 文件）
docker cp backups/redis/dump.rdb inspect-redis-dev:/data/
docker-compose -f docker-compose.dev.yml restart redis
```

## 📚 相关文件清单

端口变更涉及以下文件：

### 配置文件
- ✅ `docker-compose.dev.yml` - Docker 端口映射
- ✅ `.env.development` - 开发环境变量
- ✅ `.env.example` - 示例配置

### 脚本文件
- ✅ `scripts/db-manage.ps1` - 数据库管理
- ✅ `scripts/db-manage.ps1 init` - 数据库初始化（完整）
- ✅ `scripts/development/dev-start.ps1` - 开发启动
- ✅ `scripts/development/setup-dev-env.ps1` - 环境设置
- ✅ `scripts/tests/run-tests.ps1` - 测试运行

### 文档文件
- ✅ `docs/datebase/database-docker-deployment.md` - Docker 部署文档
- ✅ `docs/development/development-environment-guide.md` - 开发环境指南
- ✅ `discuss/README.md` - 讨论文档

## 🎯 快速参考

### 常用命令

```powershell
# 重启数据库服务
docker-compose -f docker-compose.dev.yml restart postgres redis

# 查看服务状态
docker-compose -f docker-compose.dev.yml ps

# 查看实时日志
docker-compose -f docker-compose.dev.yml logs -f postgres redis

# 进入容器
docker exec -it inspect-postgres-dev bash
docker exec -it inspect-redis-dev sh
```

### 连接字符串

```bash
# PostgreSQL
postgresql://inspect_dev:dev_password_2024@localhost:15500/inspect_system_dev

# Redis
redis://:dev_redis_2024@localhost:16380/0
```

## ✅ 变更检查清单

- [ ] 停止现有容器
- [ ] 备份数据库数据
- [ ] 修改 docker-compose.dev.yml
- [ ] 修改 .env.development
- [ ] 修改 .env.example
- [ ] 更新所有脚本文件
- [ ] 更新文档文件
- [ ] 启动容器
- [ ] 验证 PostgreSQL 连接
- [ ] 验证 Redis 连接
- [ ] 测试应用程序连接
- [ ] 更新团队文档

## 📞 支持

如遇问题，请检查：
1. Docker 服务是否正常运行
2. 端口是否被其他程序占用
3. 防火墙设置是否阻止连接
4. 环境变量是否正确配置
