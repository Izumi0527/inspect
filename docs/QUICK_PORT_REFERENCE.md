# 快速端口参考

## 📋 服务端口列表

### 核心服务

| 服务 | 端口 | 协议 | 说明 |
|------|------|------|------|
| 前端应用 | 3000 | HTTP | Next.js 开发服务器 |
| 后端 API | 8000 | HTTP/WebSocket | Go API 服务 |
| Syslog 接收 | 5514 | TCP/UDP | 设备 Syslog 上报（UDP+TCP），用于日志中心与告警联动 |
| PostgreSQL | **15500** | TCP | TimescaleDB 数据库 |
| Redis | 16379 | TCP | 缓存服务 |

### 管理工具

| 服务 | 端口 | 协议 | 说明 |
|------|------|------|------|
| pgAdmin | 5050 | HTTP | PostgreSQL 管理工具 |
| Redis Commander | 8081 | HTTP | Redis 管理工具 |

## 🔗 访问地址

### Web 服务

```
前端应用:     http://localhost:3000
后端 API:     http://localhost:8000
健康检查:     http://localhost:8000/health
WebSocket:    ws://localhost:8000
pgAdmin:      http://localhost:5050
Redis管理:    http://localhost:8081
```

### 数据库连接

**PostgreSQL**:
```
主机: localhost
端口: 15500
数据库: inspect_system_dev
用户名: inspect_dev
密码: dev_password_2024

连接字符串:
postgresql://inspect_dev:dev_password_2024@localhost:15500/inspect_system_dev
```

**Redis**:
```
主机: localhost
端口: 16379
密码: dev_redis_2024

连接字符串:
redis://:dev_redis_2024@localhost:16379/0
```

## 🔧 常用命令

### 检查端口占用

```powershell
# Windows
netstat -ano | findstr "3000 8000 5514 15500 16379"

# 查看具体端口
netstat -ano | findstr "15500"
```

### 测试连接

```powershell
# PostgreSQL
docker exec inspect-postgres-dev pg_isready -U inspect_dev -d inspect_system_dev

# 或使用 psql
psql -h localhost -p 15500 -U inspect_dev -d inspect_system_dev

# Redis
docker exec inspect-redis-dev redis-cli -a dev_redis_2024 ping
```

### 结束占用进程

```powershell
# 查找进程
Get-Process -Id (Get-NetTCPConnection -LocalPort 15500).OwningProcess

# 结束进程
taskkill /PID <进程ID> /F
```

## ⚠️ 端口变更历史

### 2026-01-27: PostgreSQL 端口更新

- **旧端口**: 15432
- **新端口**: 15500
- **原因**: 避免 Windows 保留端口范围 (15398-15497)
- **详情**: 参见 [PORT_UPDATE_NOTICE.md](docs/datebase/PORT_UPDATE_NOTICE.md)

## 🚨 故障排查

### 端口被占用

```powershell
# 1. 检查占用
netstat -ano | findstr "15500"

# 2. 查找进程
Get-NetTCPConnection -LocalPort 15500 | Select-Object OwningProcess

# 3. 结束进程
taskkill /PID <进程ID> /F
```

### 容器无法启动

```powershell
# 检查容器状态
docker ps -a | Select-String "postgres|redis"

# 查看容器日志
docker logs inspect-postgres-dev
docker logs inspect-redis-dev

# 重启容器
docker-compose -f docker-compose.yml -f docker-compose.dev.yml restart postgres redis
```

### Windows 端口保留问题

```powershell
# 查看保留端口范围
netsh interface ipv4 show excludedportrange protocol=tcp

# 如果端口在保留范围内，需要更改端口或释放保留
```

## 📚 相关文档

- [开发环境 README](scripts/development/README.md)
- [数据库管理 README](scripts/database/README.md)
- [端口更新通知](docs/datebase/PORT_UPDATE_NOTICE.md)
- [数据库容器设置指南](docs/datebase/database-container-setup-guide.md)

---

**最后更新**: 2026-01-27  
**维护者**: DevOps Team
