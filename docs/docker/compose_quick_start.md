# Docker Compose 快速启动指南

## 📦 文件结构

```
docker-compose.dev.yml   # 开发环境（完整配置）
docker-compose.prod.yml  # 生产环境（完整配置）
```

## 🚀 开发环境

### 基础启动
```bash
# 启动核心服务（数据库、后端、前端）
docker-compose -f docker-compose.dev.yml up -d

# 查看状态
docker-compose -f docker-compose.dev.yml ps

# 查看日志
docker-compose -f docker-compose.dev.yml logs -f
```

### 启动管理工具
```bash
# 启动 pgAdmin 和 Redis Commander
docker-compose -f docker-compose.dev.yml --profile tools up -d
```

### 访问地址
- 前端: http://localhost:33000（可通过 FRONTEND_HOST_PORT 调整）
- 后端: http://localhost:8000（可通过 BACKEND_HOST_PORT 调整）
- pgAdmin: http://localhost:5050
- Redis Commander: http://localhost:8081

### 停止服务
```bash
# 停止所有服务
docker-compose -f docker-compose.dev.yml down

# 停止并删除数据（谨慎）
docker-compose -f docker-compose.dev.yml down -v
```

## 🏭 生产环境

### 环境准备
```bash
# 设置必需的环境变量
export POSTGRES_PASSWORD="strong_password"
export REDIS_PASSWORD="strong_password"
export SECRET_KEY="$(openssl rand -base64 64)"
export JWT_SECRET_KEY="$(openssl rand -base64 64)"
```

### 基础启动
```bash
# 启动核心服务
docker-compose -f docker-compose.prod.yml up -d
```

### 完整启动（包含 Nginx 和监控）
```bash
# 设置 Grafana 密码
export GRAFANA_ADMIN_PASSWORD="strong_password"

# 启动所有服务
docker-compose -f docker-compose.prod.yml \
  --profile with-nginx \
  --profile monitoring \
  up -d
```

## 🔧 常用命令

```bash
# 重启单个服务
docker-compose -f docker-compose.dev.yml restart backend

# 查看特定服务日志
docker-compose -f docker-compose.dev.yml logs -f backend

# 进入容器
docker-compose -f docker-compose.dev.yml exec backend sh

# 查看资源使用
docker stats

# 清理未使用的资源
docker system prune -a
```

## 📊 服务列表

### 开发环境
| 服务 | 端口 | Profile | 说明 |
|------|------|---------|------|
| postgres | 15500 | default | TimescaleDB |
| redis | 16380 | default | Redis 缓存 |
| backend | 8000 | default | Go 后端（可通过 BACKEND_HOST_PORT 调整） |
| frontend | 33000 | default | Next.js 前端（可通过 FRONTEND_HOST_PORT 调整） |
| pgadmin | 5050 | tools | 数据库管理 |
| redis-commander | 8081 | tools | Redis 管理 |

### 生产环境
| 服务 | 端口 | Profile | 说明 |
|------|------|---------|------|
| postgres | - | default | TimescaleDB |
| redis | - | default | Redis 缓存 |
| backend | - | default | Go 后端 |
| frontend | - | default | Next.js 前端 |
| nginx | 80, 443 | with-nginx | 反向代理 |
| prometheus | 9090 | monitoring | 监控 |
| grafana | 3001 | monitoring | 可视化 |

## 🔐 默认凭据（开发环境）

**PostgreSQL:**
- 主机: localhost:15500
- 数据库: inspect_system_dev
- 用户: inspect_dev
- 密码: dev_password_2024

**Redis:**
- 主机: localhost:16380
- 密码: dev_redis_2024

**pgAdmin:**
- 邮箱: admin@inspect.dev
- 密码: dev_admin_2024

## 📚 详细文档

- [完整迁移指南](docker_compose_migration.md)
- [环境变量配置](../env/env_migration_notice.md)
- [端口参考](../env/quick_port_reference.md)

---

**提示**: 生产环境必须修改所有默认密码和密钥！
