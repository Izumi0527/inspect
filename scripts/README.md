# Scripts 运维脚本目录

本目录包含了项目运行、开发、测试、部署所需的所有自动化脚本。

## 📋 目录结构

```
scripts/
├── README.md                    # 本文档
├── setup-dev-env.ps1           # 一键开发环境设置脚本
├── scripts-manager.ps1         # 脚本管理工具
├── db-*.ps1                    # 数据库管理脚本
├── dev-start.ps1               # 开发环境快速启动脚本
├── *-setup.ps1                # 环境设置脚本
├── start-backend.ps1           # 后端服务启动脚本
├── test-*.ps1                  # 测试相关脚本
├── quality-check.ps1           # 代码质量检查脚本
├── clean-cache.ps1             # 缓存清理脚本
├── view-logs.ps1               # 日志查看脚本
└── run-*.ps1                   # 测试运行脚本
```

---

## 🚀 核心管理脚本

### 1. `setup-dev-env.ps1` (Windows - 一键环境设置)

企业级网络设备巡检系统一键开发环境设置脚本，自动化设置完整的开发环境。

**功能特性：**
- ✅ 自动检查前置条件
- ✅ 创建环境配置文件
- ✅ 设置数据库环境
- ✅ 设置后端Python环境
- ✅ 设置前端Node.js环境
- ✅ 运行测试验证

**使用方法：**
```powershell
# 完整环境设置
.\scripts\setup-dev-env.ps1

# 跳过前置条件检查
.\scripts\setup-dev-env.ps1 -SkipPrerequisites

# 跳过数据库环境设置
.\scripts\setup-dev-env.ps1 -SkipDatabase

# 跳过测试验证
.\scripts\setup-dev-env.ps1 -SkipTests
```

---

### 2. `scripts-manager.ps1` (Windows - 脚本管理工具)

统一管理所有项目脚本的工具，提供脚本列表、帮助、运行、检查等功能。

**功能特性：**
- ✅ 脚本列表和分类显示
- ✅ 详细帮助信息
- ✅ 脚本状态检查
- ✅ 脚本运行管理
- ✅ 脚本更新和清理

**使用方法：**
```powershell
# 列出所有脚本
.\scripts\scripts-manager.ps1 list

# 查看脚本帮助
.\scripts\scripts-manager.ps1 help -Script setup-dev-env

# 运行脚本
.\scripts\scripts-manager.ps1 run -Script setup-dev-env

# 检查脚本状态
.\scripts\scripts-manager.ps1 check

# 更新脚本
.\scripts\scripts-manager.ps1 update

# 清理脚本
.\scripts\scripts-manager.ps1 clean
```

---

## 🗄️ 数据库管理脚本

### 3. `db-manage.ps1` (Windows - 数据库管理工具)

统一的数据库操作脚本，支持PostgreSQL、Redis、InfluxDB的管理。

**功能特性：**
- ✅ 启动/停止数据库服务
- ✅ 重置数据库
- ✅ 备份数据库
- ✅ 查看服务状态
- ✅ 显示服务日志

**使用方法：**
```powershell
# 启动所有数据库服务
.\scripts\db-manage.ps1 start

# 停止所有数据库服务
.\scripts\db-manage.ps1 stop

# 重置数据库
.\scripts\db-manage.ps1 reset

# 备份数据库
.\scripts\db-manage.ps1 backup

# 查看服务状态
.\scripts\db-manage.ps1 status

# 查看服务日志
.\scripts\db-manage.ps1 logs

# 仅操作指定服务
.\scripts\db-manage.ps1 start -Service postgres
```

---

### 4. `db-init-migrate.ps1` (Windows - 数据库初始化)

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

### 5. `db-health-check.ps1` (Windows - 数据库健康检查)

数据库健康检查脚本，检查数据库服务状态和连接。

**使用方法：**
```powershell
.\scripts\db-health-check.ps1
```

---

### 6. `db-query.ps1` (Windows - 数据库查询工具)

数据库查询工具，支持快捷查询和SQL执行。

**使用方法：**
```powershell
.\scripts\db-query.ps1
```

---

### 7. `db-init.sh` (Linux/Mac)

数据库初始化脚本(Shell 版本)。

**使用方法：**
```bash
./scripts/db-init.sh
```

---

### 8. `db-migrate.sh` (Linux/Mac)

运行数据库迁移。

**使用方法：**
```bash
./scripts/db-migrate.sh
```

---

### 9. `db-backup.sh` (Linux/Mac)

数据库备份脚本，支持自动备份和归档。

**使用方法：**
```bash
./scripts/db-backup.sh
```

---

## 🛠️ 环境设置脚本

### 10. `frontend-setup.ps1` (Windows - 前端环境设置)

专门用于设置和管理前端开发环境的脚本。

**功能特性：**
- ✅ 前端依赖安装
- ✅ 环境配置创建
- ✅ 开发工具设置
- ✅ 开发服务器启动
- ✅ 生产构建

**使用方法：**
```powershell
# 完整前端环境设置
.\scripts\frontend-setup.ps1 setup

# 安装依赖
.\scripts\frontend-setup.ps1 install

# 启动开发服务器
.\scripts\frontend-setup.ps1 dev

# 构建生产版本
.\scripts\frontend-setup.ps1 build

# 清理项目
.\scripts\frontend-setup.ps1 clean

# 项目分析
.\scripts\frontend-setup.ps1 analyze
```

---

### 11. `backend-setup.ps1` (Windows - 后端环境设置)

专门用于设置和管理后端开发环境的脚本。

**功能特性：**
- ✅ Python环境管理
- ✅ 虚拟环境创建
- ✅ 依赖包安装
- ✅ 数据库迁移
- ✅ 开发服务器启动

**使用方法：**
```powershell
# 完整后端环境设置
.\scripts\backend-setup.ps1 setup

# 安���依赖
.\scripts\backend-setup.ps1 install

# 启动开发服务器
.\scripts\backend-setup.ps1 dev

# 运行数据库迁移
.\scripts\backend-setup.ps1 migrate

# 启动Python Shell
.\scripts\backend-setup.ps1 shell

# 清理项目
.\scripts\backend-setup.ps1 clean

# 健康检查
.\scripts\backend-setup.ps1 check
```

---

## 🚀 服务启动脚本

### 12. `dev-start.ps1` (Windows - 开发环境快速启动)

快速启动开发环境的所有必要服务，包括数据库、后端和前端服务。

**功能特性：**
- ✅ 数据库服务启动
- ✅ 后端服务启动
- ✅ 前端服务启动
- ✅ 健康检查
- ✅ 服务信息显示

**使用方法：**
```powershell
# 启动所有开发服务
.\scripts\dev-start.ps1

# 仅启动数据库服务
.\scripts\dev-start.ps1 -Services database

# 仅启动后端服务
.\scripts\dev-start.ps1 -Services backend

# 仅启动前端服务
.\scripts\dev-start.ps1 -Services frontend

# 启动并等待指定时间
.\scripts\dev-start.ps1 -Wait 30

# 跳过健康检查
.\scripts\dev-start.ps1 -SkipHealthCheck
```

---

### 13. `start-backend.ps1` (Windows - 后端服务启动)

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

### 14. `dev-start.sh` (Linux/Mac - 一键启动)

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

### 15. `dev-stop.sh` (Linux/Mac)

停止开发环境所有服务。

**使用方法：**
```bash
./scripts/dev-stop.sh
```

---

## 🧪 测试脚本

### 16. `run-tests.ps1` (Windows - 统一测试运行)

统一测试运行脚本，执行前端和后端的所有测试。

**功能特性：**
- ✅ 前端单元测试
- ✅ 后端单元测试
- ✅ 集成测试
- ✅ E2E测试
- ✅ 测试覆盖率报告
- ✅ 并行测试执行

**使用方法：**
```powershell
# 运行所有测试
.\scripts\run-tests.ps1

# 仅运行后端测试
.\scripts\run-tests.ps1 -Target backend

# 仅运行前端测试
.\scripts\run-tests.ps1 -Target frontend

# 运行单元测试
.\scripts\run-tests.ps1 -Type unit

# 生成覆盖率报告
.\scripts\run-tests.ps1 -Coverage

# 监听模式
.\scripts\run-tests.ps1 -Watch

# 并行运行
.\scripts\run-tests.ps1 -Parallel

# 详细输出
.\scripts\run-tests.ps1 -Verbose
```

---

### 17. `run-all-tests.ps1` (Windows)

运行所有测试套件(单元测试、集成测试)。

**使用方法：**
```powershell
.\scripts\run-all-tests.ps1
```

---

### 18. `quality-check.ps1` (Windows - 代码质量检查)

代码质量检查脚本，统一的代码质量检查工具。

**功能特性：**
- ✅ 代码格式化检查
- ✅ 语法检查
- ✅ 类型检查
- ✅ 代码风格检查
- ✅ 安全检查
- ✅ 自动修复

**使用方法：**
```powershell
# 检查所有代码
.\scripts\quality-check.ps1

# 仅检查后端代码
.\scripts\quality-check.ps1 -Target backend

# 仅检查前端代码
.\scripts\quality-check.ps1 -Target frontend

# 自动修复问题
.\scripts\quality-check.ps1 -Fix

# 严格模式
.\scripts\quality-check.ps1 -Strict

# 跳过测试
.\scripts\quality-check.ps1 -SkipTests
```

---

### 19. `test-all.sh` (Linux/Mac)

运行所有测试(Shell 版本)。

**使用方法：**
```bash
./scripts/test-all.sh
```

---

### 20. `test-logs.ps1` (Windows)

测试日志查看和分析工具。

**使用方法：**
```powershell
.\scripts\test-logs.ps1
```

---

### 21. `test_new_endpoints.ps1` (Windows)

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

### 22. `test_security_config.ps1` (Windows)

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

## 🧹 缓存清理脚本

### 23. `clean-cache.ps1` (Windows - 缓存清理工具)

项目缓存清理脚本，支持清理各种类型的缓存和临时文件。

**功能特性：**
- ✅ Python缓存清理
- ✅ Node.js缓存清理
- ✅ Docker缓存清理
- ✅ 项目特定文件清理
- ✅ 交互式选择
- ✅ 预览模式

**清理内容：**
- 📄 运行时配置文件 (`context.json`)
- 🎨 前端临时文件 (ESLint报告、TypeScript构建信息、测试覆盖率)
- 🐍 后端临时文件 (Python覆盖率、运行时数据)
- 🔐 认证文件警告 (不自动删除)

**使用方法：**
```powershell
# 交互式选择清理
.\scripts\clean-cache.ps1

# 清理所有缓存
.\scripts\clean-cache.ps1 -All

# 仅清理Python缓存
.\scripts\clean-cache.ps1 -Python

# 仅清理前端缓存
.\scripts\clean-cache.ps1 -Frontend

# 仅清理Docker缓存
.\scripts\clean-cache.ps1 -Docker

# 仅清理项目特定文件（推荐）
.\scripts\clean-cache.ps1 -ProjectFiles

# 预览将要删除的内容
.\scripts\clean-cache.ps1 -ProjectFiles -WhatIf

# 强制清理（跳过确认）
.\scripts\clean-cache.ps1 -ProjectFiles -Force

# 详细输出
.\scripts\clean-cache.ps1 -ProjectFiles -Verbose
```

**组合用法：**
```powershell
# 清理前端相关（前端缓存 + 项目文件）
.\scripts\clean-cache.ps1 -Frontend -ProjectFiles

# 清理Python相关（Python缓存 + 项目文件）
.\scripts\clean-cache.ps1 -Python -ProjectFiles
```

**安全保护机制：**
- ✅ 自动排除 `*.example.json` 示例文件
- ✅ 对认证文件仅警告不删除
- ✅ 支持 `-WhatIf` 预览模式
- ✅ 默认需要用户确认
- ✅ 详细的删除日志

**清理效果预估：**
| 类别 | 文件数量 | 总大小 |
|------|---------|--------|
| ESLint 报告 | 2 个 | ~1.15 MB |
| TypeScript 构建 | 1 个 | ~320 KB |
| Python 覆盖率 | 1 个 | ~52 KB |
| 运行时配置 | 2 个 | ~24 KB |
| **总计** | **~6 个** | **~1.55 MB** |

---

## 📊 运维监控脚本

### 24. `view-logs.ps1` (Windows)

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

### 25. `prod-deploy.sh` (Linux/Mac)

生产环境部署脚本。

**使用方法：**
```bash
./scripts/prod-deploy.sh
```

---

## 📝 脚本命名规范

| 前缀 | 用途 | 示例 |
|------|------|------|
| `setup-*` | 环境设置脚本 | `setup-dev-env.ps1` |
| `scripts-*` | 脚本管理工具 | `scripts-manager.ps1` |
| `db-*` | 数据库相关操作 | `db-manage.ps1` |
| `*-setup` | 专项环境设置 | `frontend-setup.ps1` |
| `dev-*` | 开发环境管理 | `dev-start.ps1` |
| `start-*` | 服务启动脚本 | `start-backend.ps1` |
| `run-*` | 测试运行脚本 | `run-tests.ps1` |
| `test-*` | 测试相关操作 | `test-logs.ps1` |
| `quality-*` | 代码质量检查 | `quality-check.ps1` |
| `clean-*` | 清理工具脚本 | `clean-cache.ps1` |
| `view-*` | 查看/监控脚本 | `view-logs.ps1` |
| `prod-*` | 生产环境操作 | `prod-deploy.sh` |

---

## 🔧 环境要求

### Windows:
- PowerShell 5.1+ 或 PowerShell Core 7+
- Python 3.12.9 (使用 uv 管理)
- Node.js 20+ (使用 pnpm 管理)
- Docker Desktop (数据库容器)
- Git 版本控制

### Linux/Mac:
- Bash 4.0+
- Python 3.12.9
- Node.js 20+
- Docker Engine (数据库容器)
- Git 版本控制

---

## 💡 最佳实践

### 1. 开发环境快速启动

**Windows (推荐):**
```powershell
# 方式1: 一键环境设置 (首次使用)
.\scripts\setup-dev-env.ps1

# 方式2: 快速启动开发环境
.\scripts\dev-start.ps1

# 方式3: 分步启动
.\scripts\db-manage.ps1 start
.\scripts\start-backend.ps1 -Dev
# 新终端: cd frontend && pnpm dev
```

**Linux/Mac:**
```bash
# 一键启动所有服务
./scripts/dev-start.sh
```

### 2. 脚本管理工作流

```powershell
# 1. 查看所有可用脚本
.\scripts\scripts-manager.ps1 list

# 2. 查看脚本帮助
.\scripts\scripts-manager.ps1 help -Script setup-dev-env

# 3. 检查脚本状态
.\scripts\scripts-manager.ps1 check

# 4. 运行脚本
.\scripts\scripts-manager.ps1 run -Script setup-dev-env
```

### 3. 数据库管理工作流

```powershell
# 1. 启动数据库服务
.\scripts\db-manage.ps1 start

# 2. 检查服务状态
.\scripts\db-manage.ps1 status

# 3. 备份数据库
.\scripts\db-manage.ps1 backup

# 4. 重置数据库 (开发环境)
.\scripts\db-manage.ps1 reset
```

### 4. 测试和质量检查工作流

```powershell
# 1. 运行代码质量检查
.\scripts\quality-check.ps1

# 2. 自动修复代码问题
.\scripts\quality-check.ps1 -Fix

# 3. 运行所有测试
.\scripts\run-tests.ps1

# 4. 生成测试覆盖率报告
.\scripts\run-tests.ps1 -Coverage
```

### 5. 缓存清理工作流

```powershell
# 1. 预览将要清理的文件
.\scripts\clean-cache.ps1 -ProjectFiles -WhatIf

# 2. 清理项目特定文件 (推荐)
.\scripts\clean-cache.ps1 -ProjectFiles

# 3. 清理所有缓存 (深度清理)
.\scripts\clean-cache.ps1 -All

# 4. 交互式选择清理
.\scripts\clean-cache.ps1
```

### 6. 日志查看技巧

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

### Q1: 脚本执行失败或找不到命令？
**A:** 使用脚本管理工具检查状态：
```powershell
.\scripts\scripts-manager.ps1 check
```

### Q2: Python 脚本提示找不到模块？
**A:** 使用后端设置脚本重新配置环境：
```powershell
.\scripts\backend-setup.ps1 setup
```

### Q3: PowerShell 脚本无法执行？
**A:** 检查执行策略：
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Q4: Shell 脚本没有执行权限？
**A:** 添加执行权限：
```bash
chmod +x scripts/*.sh
```

### Q5: 数据库连接失败？
**A:** 检查 Docker 容器是否运行：
```bash
docker ps | grep inspect
```

### Q6: 前端依赖安装失败？
**A:** 使用前端设置脚本重新安装：
```powershell
.\scripts\frontend-setup.ps1 setup
```

### Q7: 缓存文件占用空间过大？
**A:** 使用缓存清理脚本定期清理：
```powershell
.\scripts\clean-cache.ps1 -All
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

**最后更新**: 2025-12-10
**维护者**: 技术团队
