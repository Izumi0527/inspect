# Docker Compose 配置迁移指南

## 📋 变更概述

已将三个 Docker Compose 文件合并为两个独立的完整配置文件，简化了部署流程。

## 🔄 文件变更

### 删除的文件
- ❌ `docker-compose.yml` - 基础配置（已合并）

### 新的文件结构
- ✅ `docker-compose.dev.yml` - 完整的开发环境配置
- ✅ `docker-compose.prod.yml` - 完整的生产环境配置

## 🎯 设计理念

### 为什么采用独立配置？

**之前的方式（基础 + 覆盖）：**
```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

**问题：**
- 需要记住多个文件的组合
- 配置分散在多个文件中，难以理解全貌
- 开发和生产环境差异大，共享基础配置意义不大

**现在的方式（独立完整配置）：**
```bash
# 开发环境
docker-compose -f docker-compose.dev.yml up -d

# 生产环境
docker-compose -f docker-compose.prod.yml up -d
```

**优点：**
- ✅ 单文件包含完整配置，一目了然
- ✅ 命令更简洁，减少出错
- ✅ 环境隔离更清晰
- ✅ 符合 Docker Compose 最佳实践

## 📚 使用指南

### 开发环境

#### 基础服务启动
```bash
# 启动核心服务（数据库、后端、前端）
docker-compose -f docker-compose.dev.yml up -d

# 查看服务状态
docker-compose -f docker-compose.dev.yml ps

# 查看日志
docker-compose -f docker-compose.dev.yml logs -f backend
```

#### 启动管理工具
```bash
# 启动 pgAdmin 和 Redis Commander
docker-compose -f docker-compose.dev.yml --profile tools up -d

# 访问地址：
# pgAdmin: http://localhost:5050
# Redis Commander: http://localhost:8081
```

#### 停止服务
```bash
# 停止所有服务
docker-compose -f docker-compose.dev.yml down

# 停止并删除数据卷（谨慎使用）
docker-compose -f docker-compose.dev.yml down -v
```

### 生产环境

#### 环境准备

1. **配置环境变量**

创建 `.env` 文件或设置环境变量：
```bash
# 必需的环境变量
export POSTGRES_PASSWORD="strong_postgres_password"
export REDIS_PASSWORD="strong_redis_password"
export SECRET_KEY="your-super-secret-key"
export JWT_SECRET_KEY="your-jwt-secret-key"
export GRAFANA_ADMIN_PASSWORD="strong_grafana_password"

# 可选的环境变量
export POSTGRES_DB="inspect_system"
export POSTGRES_USER="inspect_user"
export NEXT_PUBLIC_API_URL="https://api.yourdomain.com"
export NEXT_PUBLIC_WS_URL="wss://api.yourdomain.com"
export CORS_ORIGINS='["https://yourdomain.com"]'
```

2. **生成强密钥**
```bash
# 生成 SECRET_KEY
openssl rand -base64 64

# 生成 JWT_SECRET_KEY
openssl rand -base64 64
```

#### 基础服务启动
```bash
# 启动核心服务（数据库、后端、前端）
docker-compose -f docker-compose.prod.yml up -d

# 查看服务状态
docker-compose -f docker-compose.prod.yml ps

# 查看日志
docker-compose -f docker-compose.prod.yml logs -f
```

#### 启动 Nginx 反向代理
```bash
# 启动包含 Nginx 的完整服务
docker-compose -f docker-compose.prod.yml --profile with-nginx up -d
```

#### 启动监控服务
```bash
# 启动 Prometheus 和 Grafana
docker-compose -f docker-compose.prod.yml --profile monitoring up -d

# 访问地址：
# Prometheus: http://localhost:9090
# Grafana: http://localhost:3001
```

#### 启动所有服务
```bash
# 启动所有服务（包括 Nginx 和监控）
docker-compose -f docker-compose.prod.yml --profile with-nginx --profile monitoring up -d
```

## 🔧 配置详解

### 开发环境配置 (docker-compose.dev.yml)

#### 服务列表
| 服务 | 容器名 | 端口映射 | 说明 |
|------|--------|----------|------|
| postgres | inspect-postgres-dev | 15500:5432 | TimescaleDB 数据库 |
| redis | inspect-redis-dev | 16380:6379 | Redis 缓存 |
| backend | inspect-backend-dev | 8000:8000 | Go 后端服务（开发默认；可通过 BACKEND_HOST_PORT 覆盖） |
| frontend | inspect-frontend-dev | 3000:3000 | Next.js 前端 |
| pgadmin | inspect-pgadmin-dev | 5050:80 | 数据库管理工具 (profile: tools) |
| redis-commander | inspect-redis-commander-dev | 8081:8081 | Redis 管理工具 (profile: tools) |

#### 特性
- ✅ 热重载支持（代码修改自动生效）
- ✅ 详细的调试日志
- ✅ 开发工具集成
- ✅ 无资源限制
- ✅ 使用固定的开发凭据

#### 默认凭据
```
PostgreSQL:
  - 数据库: inspect_system_dev
  - 用户名: inspect_dev
  - 密码: dev_password_2024
  - 端口: 15500

Redis:
  - 密码: dev_redis_2024
  - 端口: 16380

pgAdmin:
  - 邮箱: admin@inspect.dev
  - 密码: dev_admin_2024
```

### 生产环境配置 (docker-compose.prod.yml)

#### 服务列表
| 服务 | 容器名 | 端口映射 | Profile | 说明 |
|------|--------|----------|---------|------|
| postgres | inspect-postgres-prod | - | default | TimescaleDB 数据库 |
| redis | inspect-redis-prod | - | default | Redis 缓存 |
| backend | inspect-backend-prod | - | default | Go 后端服务 |
| frontend | inspect-frontend-prod | - | default | Next.js 前端 |
| nginx | inspect-nginx-prod | 80:80, 443:443 | with-nginx | 反向代理 |
| prometheus | inspect-prometheus-prod | 9090:9090 | monitoring | 监控服务 |
| grafana | inspect-grafana-prod | 3001:3000 | monitoring | 可视化面板 |

#### 特性
- ✅ 资源限制（CPU、内存）
- ✅ 安全加固（强密码、环境变量）
- ✅ 生产级日志（JSON 格式）
- ✅ 健康检查
- ✅ 自动重启
- ✅ 数据备份支持
- ✅ 监控和告警

#### 必需的环境变量
```bash
POSTGRES_PASSWORD      # PostgreSQL 密码
REDIS_PASSWORD         # Redis 密码
SECRET_KEY             # 应用密钥
JWT_SECRET_KEY         # JWT 签名密钥
GRAFANA_ADMIN_PASSWORD # Grafana 管理员密码（如启用监控）
```

## 🎭 Profile 功能说明

Docker Compose Profiles 允许选择性启动服务组。

### 开发环境 Profiles

**tools** - 管理工具
```bash
# 启动管理工具
docker-compose -f docker-compose.dev.yml --profile tools up -d

# 包含的服务：
# - pgAdmin (数据库管理)
# - Redis Commander (缓存管理)
```

### 生产环境 Profiles

**with-nginx** - Nginx 反向代理
```bash
# 启动包含 Nginx 的服务
docker-compose -f docker-compose.prod.yml --profile with-nginx up -d
```

**monitoring** - 监控服务
```bash
# 启动监控服务
docker-compose -f docker-compose.prod.yml --profile monitoring up -d

# 包含的服务：
# - Prometheus (指标收集)
# - Grafana (可视化)
```

**组合使用**
```bash
# 启动所有服务
docker-compose -f docker-compose.prod.yml \
  --profile with-nginx \
  --profile monitoring \
  up -d
```

## 🔐 安全最佳实践

### 开发环境
1. ✅ 使用固定的开发凭据（已配置）
2. ✅ 不暴露到公网
3. ✅ 定期更新依赖

### 生产环境
1. ⚠️ **必须修改所有默认密码**
2. ⚠️ **使用强随机密钥**
3. ⚠️ **配置 SSL/TLS 证书**
4. ⚠️ **限制网络访问**
5. ⚠️ **启用防火墙规则**
6. ⚠️ **定期备份数据**
7. ⚠️ **监控系统日志**
8. ⚠️ **定期更新镜像**

### 密钥管理建议

**不推荐：** 在 docker-compose 文件中硬编码密码
```yaml
environment:
  POSTGRES_PASSWORD: "hardcoded_password"  # ❌ 不安全
```

**推荐方式 1：** 使用 .env 文件
```yaml
environment:
  POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}  # ✅ 从环境变量读取
```

**推荐方式 2：** 使用 Docker Secrets（Swarm 模式）
```yaml
secrets:
  - postgres_password
environment:
  POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password
```

**推荐方式 3：** 使用外部密钥管理服务
- AWS Secrets Manager
- HashiCorp Vault
- Azure Key Vault

## 📊 资源配置

### 开发环境
- 无资源限制
- 适合本地开发和测试

### 生产环境

#### PostgreSQL
```yaml
limits:
  memory: 2G
  cpus: '1.0'
reservations:
  memory: 1G
  cpus: '0.5'
```

#### Redis
```yaml
limits:
  memory: 512M
  cpus: '0.5'
reservations:
  memory: 256M
  cpus: '0.25'
```

#### Backend
```yaml
limits:
  memory: 2G
  cpus: '1.0'
reservations:
  memory: 1G
  cpus: '0.5'
```

#### Frontend
```yaml
limits:
  memory: 512M
  cpus: '0.5'
reservations:
  memory: 256M
  cpus: '0.25'
```

## 🔄 迁移步骤

### 从旧配置迁移

如果你之前使用的是三文件配置：

1. **停止现有服务**
```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml down
```

2. **备份数据（可选）**
```bash
# 备份 PostgreSQL
docker exec inspect-postgres-dev pg_dump -U inspect_dev inspect_system_dev > backup.sql

# 备份 Redis
docker exec inspect-redis-dev redis-cli -a dev_redis_2024 --rdb /data/dump.rdb
```

3. **使用新配置启动**
```bash
# 开发环境
docker-compose -f docker-compose.dev.yml up -d

# 生产环境
docker-compose -f docker-compose.prod.yml up -d
```

4. **验证服务**
```bash
# 检查服务状态
docker-compose -f docker-compose.dev.yml ps

# 检查健康状态
docker-compose -f docker-compose.dev.yml ps --format json | jq '.[].Health'

# 测试连接
curl http://localhost:8001/health
```

## 🐛 故障排查

### 常见问题

#### 1. 环境变量未设置
```
Error: POSTGRES_PASSWORD environment variable is required
```

**解决方案：**
```bash
# 设置环境变量
export POSTGRES_PASSWORD="your_password"

# 或创建 .env 文件
echo "POSTGRES_PASSWORD=your_password" > .env
```

#### 2. 端口冲突
```
Error: port is already allocated
```

**解决方案：**
```bash
# 检查端口占用
netstat -ano | findstr "15500"

# 停止占用端口的服务
docker-compose -f docker-compose.dev.yml down

# 或修改端口映射
```

#### 3. 数据卷权限问题
```
Error: permission denied
```

**解决方案：**
```bash
# 检查数据卷
docker volume ls

# 删除并重建（会丢失数据）
docker-compose -f docker-compose.dev.yml down -v
docker-compose -f docker-compose.dev.yml up -d
```

#### 4. 服务无法启动
```bash
# 查看详细日志
docker-compose -f docker-compose.dev.yml logs backend

# 查看容器状态
docker inspect inspect-backend-dev

# 进入容器调试
docker exec -it inspect-backend-dev sh
```

## 📝 快速参考

### 常用命令

```bash
# ===== 开发环境 =====
# 启动核心服务
docker-compose -f docker-compose.dev.yml up -d

# 启动包含管理工具
docker-compose -f docker-compose.dev.yml --profile tools up -d

# 重启单个服务
docker-compose -f docker-compose.dev.yml restart backend

# 查看日志
docker-compose -f docker-compose.dev.yml logs -f backend

# 停止服务
docker-compose -f docker-compose.dev.yml down

# ===== 生产环境 =====
# 启动核心服务
docker-compose -f docker-compose.prod.yml up -d

# 启动完整服务（包括 Nginx 和监控）
docker-compose -f docker-compose.prod.yml \
  --profile with-nginx \
  --profile monitoring \
  up -d

# 滚动更新
docker-compose -f docker-compose.prod.yml up -d --no-deps --build backend

# 查看资源使用
docker stats

# 备份数据
docker-compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U inspect_user inspect_system > backup_$(date +%Y%m%d).sql
```

## 📚 相关文档

- [环境变量迁移指南](../env/env_migration_notice.md)
- [快速端口参考](../env/quick_port_reference.md)
- [开发环境指南](../development/development-environment-guide.md)
- [数据库部署文档](../datebase/database-deployment.md)

## 🎉 总结

### 主要改进
1. ✅ 简化了命令行操作
2. ✅ 提高了配置可读性
3. ✅ 增强了环境隔离
4. ✅ 添加了 Profile 支持
5. ✅ 改进了安全配置
6. ✅ 优化了资源管理

### 向后兼容性
- ✅ 数据卷名称保持不变
- ✅ 网络配置保持不变
- ✅ 服务名称保持不变
- ✅ 端口映射保持不变

---

**迁移日期**: 2026-01-27  
**影响范围**: Docker Compose 配置文件  
**向后兼容**: 是（数据和网络配置保持不变）
