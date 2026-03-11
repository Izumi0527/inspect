# 数据库管理脚本完整指南

## 📋 目录

- [快速开始](#-快速开始)
- [脚本清单](#-脚本清单)
- [详细使用说明](#-详细使用说明)
- [脚本架构](#-脚本架构)
- [配置信息](#-配置信息)
- [常见使用场景](#-常见使用场景)
- [故障排查](#-故障排查)
- [最佳实践](#-最佳实践)

---

## 🚀 快速开始

### 统一管理工具（推荐）

```powershell
# 启动数据库
.\db-manage.ps1 start

# 查看状态
.\db-manage.ps1 status

# 初始化数据库
.\db-manage.ps1 init

# 备份数据库
.\db-manage.ps1 backup

# 查看日志
.\db-manage.ps1 logs

# 停止数据库
.\db-manage.ps1 stop
```

### 首次部署流程
 
```powershell
# 1. 启动数据库容器
.\db-manage.ps1 start
 
# 2. 等待服务就绪（约10秒）
Start-Sleep -Seconds 10
 
# 3. 初始化数据库（导入基础 SQL 与内置模板）
.\db-manage.ps1 init

# 4. 初始化默认管理员账号与权限（用于系统登录）
.\db-seed-admin.ps1
 
# 5. 验证状态
.\db-manage.ps1 status
```

### 默认登录账号（开发环境）

- 用户名：`admin`
- 密码：`admin123`
- 邮箱：`admin@admin.com`
- 角色：`admin`（等同超级管理员；`superadmin` 会映射为 `admin`）

---

## � 脚本清单

| 脚本 | 职责 | 代码量 | 使用场景 |
|------|------|--------|----------|
| `db-manage.ps1` | 统一管理入口 | ~430行 | 日常数据库管理操作 |
| `db-init-complete.ps1` | 专业初始化工具 | ~270行 | 数据库初始化和重置 |
| `db-seed-admin.ps1` | 登录账号/权限种子 | ~120行 | 初始化默认管理员账号与 RBAC |
| `db-query.ps1` | 数据库查询工具 | - | 查询表结构、数据导出 |

---

## 📖 详细使用说明

### 1. db-manage.ps1 - 统一管理工具 ⭐

**定位**: 日常数据库管理的瑞士军刀

#### 基本语法

```powershell
.\db-manage.ps1 <操作> [-Service <服务>] [-BackupPath <路径>]
```

#### 可用操作

| 操作 | 说明 | 示例 |
|------|------|------|
| `start` | 启动服务 | `.\db-manage.ps1 start` |
| `stop` | 停止服务 | `.\db-manage.ps1 stop` |
| `status` | 查看状态 | `.\db-manage.ps1 status` |
| `logs` | 查看日志 | `.\db-manage.ps1 logs` |
| `backup` | 备份数据 | `.\db-manage.ps1 backup` |
| `reset` | 重置数据库 | `.\db-manage.ps1 reset` |
| `init` | 初始化数据库 | `.\db-manage.ps1 init` |

#### 可用服务

| 服务 | 说明 |
|------|------|
| `all` | 所有服务（默认） |
| `postgres` | PostgreSQL 数据库 |
| `redis` | Redis 缓存 |

#### 使用示例

```powershell
# 启动所有服务
.\db-manage.ps1 start

# 只启动 PostgreSQL
.\db-manage.ps1 start -Service postgres

# 备份到指定路径
.\db-manage.ps1 backup -BackupPath "backups/manual"

# 查看 PostgreSQL 日志
.\db-manage.ps1 logs -Service postgres

# 重置数据库（危险操作，会提示确认）
.\db-manage.ps1 reset
```

#### 启动后显示信息

```
📊 服务访问地址:
  🗄️ PostgreSQL: localhost:15500
    - 用户名: inspect_dev
    - 密码: dev_password_2024
    - 数据库: inspect_system_dev
  🔴 Redis: localhost:16379
    - 密码: dev_redis_2024
  🔧 pgAdmin: http://localhost:5050
  🔧 Redis Commander: http://localhost:8081
```

---

### 2. db-init-complete.ps1 - 专业初始化工具

**定位**: 数据库初始化的专家

#### 功能特点

- ✅ 自动检测 Docker/本地 psql 环境
- ✅ 支持多种初始化模式
- ✅ 详细的验证和错误处理
- ✅ 可独立使用或被 db-manage.ps1 调用

#### 初始化内容
 
1. **基础配置**
   - 数据库扩展与基础结构（TimescaleDB/uuid 等）
   - TimescaleDB 时序数据库配置
   - 数据压缩和保留策略
   - 网络带宽单位迁移 (bps → Mbps)
 
2. **内置模板**
   - 18个厂商设备模板（6厂商 × 3设备类型）
   - Cisco、Huawei、H3C、Juniper、Arista、Fortinet
   - 路由器、交换机、防火墙模板

3. **测试数据种子**

4. **登录账号/权限种子**
   - 通过 `db-seed-admin.ps1` 初始化默认管理员账号与 RBAC（roles/permissions）

#### 参数选项

| 参数 | 说明 |
|------|------|
| `-InitOnly` | 仅执行基础初始化（不包含模板） |
| `-TemplatesOnly` | 仅执行模板初始化 |
| `-Force` | 强制执行，跳过确认提示 |
| `-Help` | 显示帮助信息 |

#### 使用示例

```powershell
# 完整初始化（交互式确认）
.\db-init-complete.ps1

# 只初始化基础配置
.\db-init-complete.ps1 -InitOnly

# 只导入模板
.\db-init-complete.ps1 -TemplatesOnly

# 强制执行（用于自动化脚本）
.\db-init-complete.ps1 -Force

# 查看帮助
.\db-init-complete.ps1 -Help
```

---

### 3. db-query.ps1 - 数据库查询工具

**功能**: 强大的数据库查询和导出工具

#### 参数选项

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `-Table` | 指定表名 | - |
| `-Limit` | 限制行数 | 10 |
| `-Format` | 输出格式 | Console |
| `-Output` | 输出文件路径 | - |
| `-CustomSQL` | 执行自定义 SQL | - |
| `-ShowSchema` | 只显示表结构 | - |
| `-ShowData` | 只显示数据 | - |
| `-ShowStats` | 显示统计信息 | - |
| `-Pattern` | 表名过滤模式 | - |

#### 输出格式

- `Console` - 控制台表格输出
- `CSV` - CSV 文件
- `JSON` - JSON 文件
- `HTML` - HTML 报告

#### 使用示例

```powershell
# 查询所有表
.\db-query.ps1

# 查询指定表
.\db-query.ps1 -Table users -Limit 20

# 只显示表结构
.\db-query.ps1 -ShowSchema

# 导出为 JSON
.\db-query.ps1 -Format JSON -Output "db_info.json"

# 执行自定义 SQL
.\db-query.ps1 -CustomSQL "SELECT COUNT(*) FROM devices"

# 查询包含 "device" 的表
.\db-query.ps1 -Pattern "*device*"

# 导出 HTML 报告
.\db-query.ps1 -Format HTML -Output "report.html"
```

---

## 🎯 脚本架构

### 设计理念：职责分离

```
┌─────────────────────────────────────────────────────────┐
│                    db-manage.ps1                        │
│              (统一管理入口 - 简单易用)                   │
│                                                         │
│  • start   - 启动服务                                   │
│  • stop    - 停止服务                                   │
│  • status  - 查看状态                                   │
│  • logs    - 查看日志                                   │
│  • backup  - 备份数据                                   │
│  • reset   - 重置数据库                                 │
│  • init    ─────────┐                                   │
│                     │                                   │
└─────────────────────┼───────────────────────────────────┘
                      │ 调用
                      ▼
┌─────────────────────────────────────────────────────────┐
│              db-init-complete.ps1                       │
│           (专业初始化工具 - 功能强大)                    │
│                                                         │
│  • 自动检测 Docker/本地 psql                            │
│  • 灵活的初始化选项                                     │
│    - InitOnly: 仅基础初始化                             │
│    - TemplatesOnly: 仅模板初始化                        │
│    - 默认: 完整初始化                                   │
│  • 详细的验证和反馈                                     │
│  • 独立的 SQL 执行引擎                                  │
└─────────────────────────────────────────────────────────┘
```

### 为什么保留两个脚本？

1. **单一职责原则** - 每个脚本专注于自己的领域
2. **独立使用场景** - CI/CD、高级选项、日常管理
3. **代码可维护性** - 避免单文件过大（合并后 700+ 行）
4. **灵活性扩展性** - 独立修改，互不影响

### 重叠度分析

| 功能 | db-manage.ps1 | db-init-complete.ps1 | 重叠度 |
|------|---------------|----------------------|--------|
| 初始化逻辑 | ❌ 无 | ✅ 完整实现 | 0% |
| SQL 执行 | ❌ 无 | ✅ Invoke-Sql | 0% |
| 环境检测 | ❌ 无 | ✅ Docker/psql | 0% |
| 初始化入口 | ✅ 调用者 | ✅ 被调用者 | 100% 依赖 |

**结论**: 两个脚本是**互补关系**，不是重复关系。

---

## 🔧 配置信息

### PostgreSQL (TimescaleDB)

```
主机: localhost
端口: 15500
数据库: inspect_system_dev
用户名: inspect_dev
密码: dev_password_2024

连接字符串:
postgresql://inspect_dev:dev_password_2024@localhost:15500/inspect_system_dev
```

**测试连接：**
```powershell
# Docker 容器内测试
docker exec inspect-postgres-dev pg_isready -U inspect_dev

# 进入 psql
docker exec -it inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev

# 从宿主机连接
psql -h localhost -p 15500 -U inspect_dev -d inspect_system_dev
```

### Redis

```
主机: localhost
端口: 16379
密码: dev_redis_2024

连接字符串:
redis://:dev_redis_2024@localhost:16379/0
```

**测试连接：**
```powershell
# Ping 测试
docker exec inspect-redis-dev redis-cli -a dev_redis_2024 ping

# 进入 redis-cli
docker exec -it inspect-redis-dev redis-cli -a dev_redis_2024

# 从宿主机连接
redis-cli -h localhost -p 16379 -a dev_redis_2024
```

### 管理工具

| 工具 | 地址 | 凭据 |
|------|------|------|
| pgAdmin | http://localhost:5050 | admin@inspect.dev / dev_admin_2024 |
| Redis Commander | http://localhost:8081 | 无需登录 |

---

## 📝 常见使用场景

### 场景 1: 每日开发工作流

```powershell
# 1. 启动数据库服务
.\db-manage.ps1 start

# 2. 查看服务状态确认正常
.\db-manage.ps1 status

# 3. 开发工作...

# 4. 工作结束后停止服务（可选）
.\db-manage.ps1 stop
```

### 场景 2: 数据库问题排查

```powershell
# 1. 查看服务状态
.\db-manage.ps1 status

# 2. 查看日志找出问题
.\db-manage.ps1 logs -Service postgres

# 3. 如果需要，重启服务
.\db-manage.ps1 stop
.\db-manage.ps1 start
```

### 场景 3: 定期备份

```powershell
# 创建每日备份
.\db-manage.ps1 backup -BackupPath "backups\daily"

# 创建每周备份
.\db-manage.ps1 backup -BackupPath "backups\weekly"
```

**备份文件命名格式：**
- PostgreSQL: `postgres_backup_YYYYMMDD_HHMMSS.sql`
- Redis: `redis_backup_YYYYMMDD_HHMMSS.rdb`

### 场景 4: 重置开发环境

```powershell
# 1. 备份当前数据（如需要）
.\db-manage.ps1 backup -BackupPath "backups\before_reset"

# 2. 重置数据库
.\db-manage.ps1 reset

# 3. 重新初始化
.\db-manage.ps1 init
```

⚠️ **警告：** `reset` 操作会：
1. 停止所有数据库服务
2. 删除所有数据卷（数据将永久丢失）
3. 重新启动服务（使用初始配置）

### 场景 5: 新环境设置

```powershell
# 1. 启动数据库服务
.\db-manage.ps1 start

# 2. 等待服务就绪（约10秒）
Start-Sleep -Seconds 10

# 3. 初始化数据库
.\db-manage.ps1 init

# 4. 验证状态
.\db-manage.ps1 status
```

### 场景 6: 高级初始化

```powershell
# 仅初始化基础配置（不包含模板）
.\db-init-complete.ps1 -InitOnly

# 仅添加模板（假设基础已初始化）
.\db-init-complete.ps1 -TemplatesOnly

# 完整初始化（交互式确认）
.\db-init-complete.ps1

# 自动化脚本中使用（跳过确认）
.\db-init-complete.ps1 -Force
```

### 场景 7: 数据查询和分析

```powershell
# 查看所有表
.\db-query.ps1

# 查询特定表数据
.\db-query.ps1 -Table devices -Limit 50

# 导出数据库报告
.\db-query.ps1 -Format HTML -Output "report.html"

# 执行自定义查询
.\db-query.ps1 -CustomSQL "SELECT vendor, COUNT(*) FROM devices GROUP BY vendor"
```

### 场景 8: CI/CD 集成

```yaml
# GitHub Actions 示例
- name: Setup Database
  run: |
    .\scripts\database\db-manage.ps1 start
    Start-Sleep -Seconds 10
    .\scripts\database\db-init-complete.ps1 -Force -InitOnly

# 或使用统一入口
- name: Initialize Database
  run: |
    .\scripts\database\db-manage.ps1 init
```

---

## 🐛 故障排查

### 问题 1: 服务无法启动

```powershell
# 检查 Docker 是否运行
docker ps

# 查看详细错误日志
.\db-manage.ps1 logs

# 检查端口占用
netstat -ano | findstr "15500 16379"

# 尝试重置服务
.\db-manage.ps1 reset
```

### 问题 2: 端口冲突

```powershell
# 检查端口占用
netstat -ano | findstr "15500 16379"

# 查找占用进程
Get-NetTCPConnection -LocalPort 15500 | Select-Object OwningProcess

# 停止占用端口的进程
taskkill /PID <进程ID> /F

# 或修改 docker-compose.dev.yml 中的端口映射
```

### 问题 3: 连接失败

```powershell
# 检查服务状态
.\db-manage.ps1 status

# 测试 PostgreSQL 连接
docker exec inspect-postgres-dev pg_isready -U inspect_dev

# 测试 Redis 连接
docker exec inspect-redis-dev redis-cli -a dev_redis_2024 ping

# 查看容器日志
docker logs inspect-postgres-dev
docker logs inspect-redis-dev
```

### 问题 4: 备份失败

```powershell
# 确认容器正在运行
.\db-manage.ps1 status

# 检查备份目录权限
Test-Path backups

# 手动创建备份目录
New-Item -ItemType Directory -Path backups -Force

# 查看容器日志
docker logs inspect-postgres-dev
```

### 问题 5: 初始化失败

```powershell
# 检查 SQL 文件是否存在
Test-Path database\database-init-complete.sql
Test-Path database\builtin-templates-complete.sql

# 查看详细错误信息
.\db-init-complete.ps1 -Force

# 检查数据库连接
docker exec inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "SELECT 1;"
```

### 问题 6: 数据问题

```powershell
# 查看数据库信息
.\db-query.ps1

# 查看特定表
.\db-query.ps1 -Table inspection_templates

# 从备份恢复
.\db-manage.ps1 backup  # 先备份当前数据
# 然后手动恢复备份文件
```

---

## 💡 最佳实践

### 1. 定期备份

```powershell
# 每日备份
.\db-manage.ps1 backup -BackupPath "backups\daily"

# 每周备份
.\db-manage.ps1 backup -BackupPath "backups\weekly"

# 重要操作前备份
.\db-manage.ps1 backup -BackupPath "backups\before_operation"
```

### 2. 状态监控

```powershell
# 定期检查服务状态
.\db-manage.ps1 status

# 查看容器健康状态
docker ps --filter "name=inspect-" --format "{{.Names}}: {{.Status}}"
```

### 3. 日志管理

```powershell
# 查看最近日志
.\db-manage.ps1 logs

# 查看特定服务日志
.\db-manage.ps1 logs -Service postgres

# 持续监控日志
docker logs -f inspect-postgres-dev
```

### 4. 数据分析

```powershell
# 定期查看数据库状态
.\db-query.ps1 -ShowStats

# 导出数据报告
.\db-query.ps1 -Format HTML -Output "reports\db_report_$(Get-Date -Format 'yyyyMMdd').html"
```

### 5. 安全配置

- ⚠️ 生产环境务必修改默认密码
- ⚠️ 限制数据库访问权限
- ⚠️ 启用 SSL/TLS 连接
- ⚠️ 定期更新数据库版本
- ⚠️ 配置防火墙规则

### 6. 性能优化

```powershell
# 查看数据库统计信息
.\db-query.ps1 -CustomSQL "SELECT * FROM pg_stat_database WHERE datname = 'inspect_system_dev';"

# 查看表大小
.\db-query.ps1 -CustomSQL "SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size FROM pg_tables WHERE schemaname = 'public' ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"
```

---

## ⚡ 快捷命令别名（可选）

在 PowerShell 配置文件中添加别名以简化命令：

```powershell
# 编辑配置文件
notepad $PROFILE

# 添加以下内容：
function dbm { .\scripts\database\db-manage.ps1 @args }
function dbs { .\scripts\database\db-manage.ps1 status }
function dbl { .\scripts\database\db-manage.ps1 logs @args }
function dbb { .\scripts\database\db-manage.ps1 backup }
function dbq { .\scripts\database\db-query.ps1 @args }

# 使用示例：
# dbm start      # 启动服务
# dbs            # 查看状态
# dbl -Service postgres  # 查看日志
# dbb            # 备份数据
# dbq -Table users  # 查询表
```

---

## 📚 相关文档

- [Docker Compose 配置](../../docker-compose.dev.yml)
- [快速端口参考](../../docs/QUICK_PORT_REFERENCE.md)
- [环境变量配置](../../.env.example)
- [数据库部署文档](../../docs/datebase/database-deployment.md)

---

## 🔗 快速链接

```powershell
# 查看所有数据库脚本
Get-ChildItem scripts\database\*.ps1

# 查看数据库文档
Get-ChildItem docs\datebase\*.md

# 查看备份文件
Get-ChildItem backups\

# 查看日志文件
Get-ChildItem logs\backend-go\
```

---

## 📞 获取帮助

如遇问题：

1. **查看脚本内置帮助**
   ```powershell
   .\db-manage.ps1 -?
   .\db-init-complete.ps1 -Help
   ```

2. **运行状态检查**
   ```powershell
   .\db-manage.ps1 status
   ```

3. **查看日志**
   ```powershell
   .\db-manage.ps1 logs
   ```

4. **查看本文档**
   - 详细使用说明
   - 常见场景示例
   - 故障排查指南

---

**最后更新**: 2026-01-29  
**版本**: 2.0.0  
**维护者**: 技术团队
