# Scripts 运维脚本目录

本目录包含了项目运行、开发、测试、部署所需的所有自动化脚本。

## 📋 目录结构

```
scripts/
├── README.md                    # 本文档
├── db-*.{ps1,sh}               # 数据库管理脚本
├── dev-*.sh                    # 开发环境管理脚本
├── start-backend.ps1           # 后端服务启动脚本
├── test-*.{ps1,sh}            # 测试相关脚本
├── test_*.ps1                  # API 测试脚本
├── view-logs.ps1              # 日志查看脚本
└── prod-deploy.sh             # 生产部署脚本
```

---

## 🗄️ 数据库管理脚本

### 1. `db-init-migrate.ps1` (Windows - 核心脚本)

企业级数据库管理一站式解决方案，支持 PostgreSQL、Redis、InfluxDB。

**功能特性：**
- ✅ 数据库初始化
- ✅ 数据库迁移管理
- ✅ 创建新迁移
- ✅ 数据导入
- ✅ 备份与恢复
- ✅ 健康检查
- ✅ 状态查看
- ✅ 数据清理

**使用方法：**

```powershell
# 初始化所有数据库
.\scripts\db-init-migrate.ps1 -Init

# 运行数据库迁移
.\scripts\db-init-migrate.ps1 -Migrate

# 创建新迁移
.\scripts\db-init-migrate.ps1 -CreateMigration "add_user_table"

# 导入初始数据
.\scripts\db-init-migrate.ps1 -ImportData

# 备份数据库
.\scripts\db-init-migrate.ps1 -Backup

# 恢复数据库
.\scripts\db-init-migrate.ps1 -Restore

# 查看迁移状态
.\scripts\db-init-migrate.ps1 -Status

# 健康检查
.\scripts\db-init-migrate.ps1 -HealthCheck

# 清理测试数据
.\scripts\db-init-migrate.ps1 -Clean

# 查看帮助
.\scripts\db-init-migrate.ps1 -Help
```

---

### 2. `db-init.sh` (Linux/Mac)

数据库初始化脚本(Shell 版本)。

**使用方法：**
```bash
./scripts/db-init.sh
```

---

### 3. `db-migrate.sh` (Linux/Mac)

运行数据库迁移。

**使用方法：**
```bash
./scripts/db-migrate.sh
```

---

### 4. `db-backup.sh` (Linux/Mac)

数据库备份脚本，支持自动备份和归档。

**使用方法：**
```bash
./scripts/db-backup.sh
```

---

### 5. `db-health-check.ps1` / `db-health-check.sh`

数据库健康检查和监控。

**使用方法：**
```powershell
# Windows
.\scripts\db-health-check.ps1

# Linux/Mac
./scripts/db-health-check.sh
```

---

### 6. `db-query.ps1` (Windows)

数据库查询工具，支持快捷查询和 SQL 执行。

**使用方法：**
```powershell
.\scripts\db-query.ps1
```

---

## 🚀 服务启动脚本

### 7. `start-backend.ps1` (Windows - 推荐)

后端服务启动脚本，支持虚拟环境自动管理和依赖安装。

**功能特性：**
- ✅ 自动创建和激活虚拟环境
- ✅ 自动安装和更新依赖
- ✅ 开发模式热重载
- ✅ 生产模式优化
- ✅ 自动数据库迁移
- ✅ 日志输出到文件

**使用方法：**

```powershell
# 开发模式启动(默认，带热重载)
.\scripts\start-backend.ps1 -Dev

# 开发模式 + 运行迁移
.\scripts\start-backend.ps1 -Dev -Migrate

# 开发模式 + 跳过依赖安装(加快启动)
.\scripts\start-backend.ps1 -Dev -NoDeps

# 生产模式启动
.\scripts\start-backend.ps1 -Prod

# 指定端口
.\scripts\start-backend.ps1 -Dev -Port 8080

# 强制重装所有依赖
.\scripts\start-backend.ps1 -Dev -ForceDeps

# 启用调试日志
.\scripts\start-backend.ps1 -Dev -Debug

# 查看帮助
.\scripts\start-backend.ps1 -Help
```

**日志位置：**
- 开发模式：`logs/backend/app-dev.log`
- 生产模式：`logs/backend/app-prod.log`

---

### 8. `dev-start.sh` (Linux/Mac - 一键启动)

开发环境一键启动脚本，启动完整的开发环境栈。

**启动内容：**
- PostgreSQL 数据库
- Redis 缓存
- InfluxDB 时序数据库
- FastAPI 后端服务
- Next.js 前端服务

**使用方法：**
```bash
./scripts/dev-start.sh
```

---

### 9. `dev-stop.sh` (Linux/Mac)

停止开发环境所有服务。

**使用方法：**
```bash
./scripts/dev-stop.sh
```

---

## 🧪 测试脚本

### 10. `run-all-tests.ps1` (Windows)

运行所有测试套件(单元测试、集成测试)。

**使用方法：**
```powershell
.\scripts\run-all-tests.ps1
```

---

### 11. `test-all.sh` (Linux/Mac)

运行所有测试(Shell 版本)。

**使用方法：**
```bash
./scripts/test-all.sh
```

---

### 12. `test-logs.ps1` (Windows)

测试日志查看和分析工具。

**使用方法：**
```powershell
.\scripts\test-logs.ps1
```

---

### 13. `test_new_endpoints.ps1` (Windows)

测试新增的系统设置 API 端点。

**测试内容：**
- ✅ GET /settings/system/categories - 获取配置分类
- ✅ GET /settings/system/info - 获取系统信息
- ✅ GET /settings/system/backup - 获取备份列表
- ✅ POST /settings/system/settings/bulk - 批量更新配置

**使用方法：**
```powershell
# 确保后端服务已启动
.\scripts\test_new_endpoints.ps1
```

**注意事项：**
- 脚本包含测试用的 JWT token
- 需要后端服务运行在 `http://localhost:8000`
- 仅用于开发和测试环境

---

### 14. `test_security_config.ps1` (Windows)

测试安全配置 API 端点。

**测试内容：**
- ✅ 获取安全配置列表
- ✅ 显示配置详情(key、描述、值)

**使用方法：**
```powershell
# 确保后端服务已启动
.\scripts\test_security_config.ps1
```

---

## 📊 运维监控脚本

### 15. `view-logs.ps1` (Windows)

应用日志查看和过滤工具，支持实时日志监控。

**使用方法：**
```powershell
# 查看后端日志
.\scripts\view-logs.ps1

# 实时监控日志
.\scripts\view-logs.ps1 -Follow

# 过滤错误日志
.\scripts\view-logs.ps1 -Level ERROR
```

---

## 🚢 部署脚本

### 16. `prod-deploy.sh` (Linux/Mac)

生产环境部署脚本。

**使用方法：**
```bash
./scripts/prod-deploy.sh
```

---

## 📝 脚本命名规范

| 前缀 | 用途 | 示例 |
|------|------|------|
| `db-*` | 数据库相关操作 | `db-init-migrate.ps1` |
| `dev-*` | 开发环境管理 | `dev-start.sh` |
| `test-*` | 测试相关操作 | `test-all.sh` |
| `start-*` | 服务启动脚本 | `start-backend.ps1` |
| `view-*` | 查看/监控脚本 | `view-logs.ps1` |
| `prod-*` | 生产环境操作 | `prod-deploy.sh` |

---

## 🔧 环境要求

### Windows:
- PowerShell 5.1+ 或 PowerShell Core 7+
- Python 3.11+ (使用 uv 管理)
- Docker Desktop (数据库容器)

### Linux/Mac:
- Bash 4.0+
- Python 3.11+
- Docker Engine (数据库容器)

---

## 💡 最佳实践

### 1. 开发环境快速启动

**Windows:**
```powershell
# 终端 1: 启动数据库和后端
.\scripts\db-init-migrate.ps1 -Init -Migrate
.\scripts\start-backend.ps1 -Dev

# 终端 2: 启动前端
cd frontend
pnpm dev
```

**Linux/Mac:**
```bash
# 一键启动所有服务
./scripts/dev-start.sh
```

### 2. 数据库迁移工作流

```powershell
# 1. 创建新迁移
.\scripts\db-init-migrate.ps1 -CreateMigration "add_new_feature"

# 2. 编辑迁移文件
# backend/migrations/versions/xxx_add_new_feature.py

# 3. 运行迁移
.\scripts\db-init-migrate.ps1 -Migrate

# 4. 检查状态
.\scripts\db-init-migrate.ps1 -Status
```

### 3. 测试数据管理

```powershell
# 开发阶段: 初始化测试数据
cd backend
.\.venv\Scripts\Activate.ps1
cd ..
python scripts/init_test_data.py init

# 测试完成: 清理数据
python scripts/init_test_data.py clear

# 重新开始: 重置数据
python scripts/init_test_data.py reset
```

### 4. 日志查看技巧

```powershell
# 查看最新日志
.\scripts\view-logs.ps1

# 实时监控(类似 tail -f)
.\scripts\view-logs.ps1 -Follow

# 只看错误
.\scripts\view-logs.ps1 -Level ERROR

# 搜索关键词
.\scripts\view-logs.ps1 -Filter "数据库连接"
```

---

## 🚨 常见问题

### Q1: Python 脚本提示找不到模块？
**A:** 确保已激活 backend 虚拟环境：
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
```

### Q2: PowerShell 脚本无法执行？
**A:** 检查执行策略：
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Q3: Shell 脚本没有执行权限？
**A:** 添加执行权限：
```bash
chmod +x scripts/*.sh
```

### Q4: 数据库连接失败？
**A:** 检查 Docker 容器是否运行：
```bash
docker ps | grep inspect
```

---

## 📚 相关文档

- [项目文档](../docs/README.md)
- [后端 API 文档](../docs/backend/api/)
- [数据库设计文档](../docs/database-deployment.md)
- [开发环境配置](../docs/dev-setup-guide.md)

---

## 🤝 贡献指南

添加新脚本时，请遵循以下规范：

1. **命名规范**: 使用有意义的前缀和描述性名称
2. **注释完整**: 脚本开头包含用途说明和使用示例
3. **错误处理**: 添加适当的错误检查和提示
4. **文档更新**: 在本 README 中添加相应说明
5. **跨平台**: 尽可能提供 PowerShell 和 Shell 双版本

---

**最后更新**: 2025-11-14
**维护者**: Izumi0527
