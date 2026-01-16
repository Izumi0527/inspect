# UltraThink 脚本目录结构

本目录包含了 UltraThink 项目的所有 PowerShell 脚本，按功能分类组织。

## 📁 目录结构

```
scripts/
├── setup/              # 环境设置脚本
│   ├── setup-dev-env.ps1      # 一键开发环境设置
│   ├── frontend-setup.ps1     # 前端环境设置
│   └── backend-setup.ps1      # 后端环境设置
│
├── development/        # 开发服务脚本
│   ├── dev-start.ps1          # 一键启动开发环境
│   ├── start-frontend.ps1     # 启动前端服务
│   └── start-backend-go.ps1   # 启动后端服务（Go）
│
├── database/          # 数据库管理脚本
│   ├── db-manage.ps1          # 数据库服务管理
│   ├── db-init-migrate-go.ps1    # 数据库初始化和迁移
│   ├── db-health-check.ps1    # 数据库健康检查
│   └── db-query.ps1           # 数据库查询工具
│
├── testing/           # 测试工具脚本
│   ├── run-tests.ps1          # 统一测试运行器
│   ├── run-all-tests.ps1      # 运行所有测试
│   ├── quality-check.ps1      # 代码质量检查
│   └── device-probe-verify.ps1 # 设备探测联调验证
│
├── maintenance/       # 维护工具脚本
│   ├── clean-cache.ps1        # 清理项目缓存
│   ├── view-logs.ps1          # 日志查看工具
│   └── test-logs.ps1          # 日志功能测试
│
├── management/        # 管理工具脚本
│   └── scripts-manager.ps1    # 脚本管理工具
│
└── README.md          # 本说明文件
```

> Python 后端相关脚本已迁移至 `legacy/scripts/`，仅保留历史参考。

## 🚀 快速开始

### 1. 环境设置
```powershell
# 一键设置完整开发环境
.\scripts\setup\setup-dev-env.ps1

# 仅设置前端环境
.\scripts\setup\frontend-setup.ps1 setup

# 仅设置后端环境
.\scripts\setup\backend-setup.ps1 setup
```

### 2. 启动开发服务
```powershell
# 一键启动所有服务
.\scripts\development\dev-start.ps1

# 仅启动前端服务
.\scripts\development\start-frontend.ps1

# 仅启动后端服务
.\scripts\development\start-backend-go.ps1
```

### 3. 数据库管理
```powershell
# 启动数据库服务
.\scripts\database\db-manage.ps1 start

# 初始化数据库
.\scripts\database\db-init-migrate-go.ps1

# 健康检查
.\scripts\database\db-health-check.ps1
```

## 🛠️ 脚本管理工具

使用脚本管理工具可以方便地查看和运行所有脚本：

```powershell
# 查看所有可用脚本
.\scripts\management\scripts-manager.ps1 list

# 运行指定脚本
.\scripts\management\scripts-manager.ps1 run -Script "setup-dev-env.ps1"

# 查看脚本帮助
.\scripts\management\scripts-manager.ps1 help -Script "dev-start.ps1"
```

## 📋 脚本分类说明

### Setup (环境设置)
- **setup-dev-env.ps1**: 一键设置完整开发环境，包括前端、后端和数据库
- **frontend-setup.ps1**: 专门用于前端环境设置，包括 Node.js 依赖安装
- **backend-setup.ps1**: 专门用于后端环境设置，包括 Go 依赖与迁移

### Development (开发服务)
- **dev-start.ps1**: 一键启动所有开发服务，包括数据库、后端和前端
- **start-frontend.ps1**: 启动前端开发服务器
- **start-backend-go.ps1**: 启动后端 API 服务器（Go）
- Python 旧版启动脚本已迁移至 `legacy/scripts/development/start-backend.ps1`（仅保留参考）

### Database (数据库管理)
- **db-manage.ps1**: 数据库服务的启动、停止、重启等管理操作
- **db-init-migrate-go.ps1**: 数据库初始化、迁移、备份等操作
- **db-health-check.ps1**: 检查数据库服务健康状态
- **db-query.ps1**: 数据库查询和管理工具

### Testing (测试工具)
- **run-tests.ps1**: 统一的测试运行器，支持前端、后端、单元测试等
- **run-all-tests.ps1**: 运行完整的测试套件
- **quality-check.ps1**: 代码质量检查，包括格式化、语法检查等
- **device-probe-verify.ps1**: 设备探测联调验证（ICMP/SNMP）

### Maintenance (维护工具)
- **clean-cache.ps1**: 清理项目中的各种缓存文件
- **view-logs.ps1**: 实时查看和过滤日志文件
- **test-logs.ps1**: 测试日志系统功能

### Management (管理工具)
- **scripts-manager.ps1**: 脚本管理工具，提供统一的脚本查看和执行界面

## 💡 使用建议

1. **新手开发者**: 从 `setup-dev-env.ps1` 开始，一键设置完整环境
2. **日常开发**: 使用 `dev-start.ps1` 快速启动开发环境
3. **问题排查**: 使用 `db-health-check.ps1` 和 `view-logs.ps1` 进行诊断
4. **代码提交前**: 运行 `run-tests.ps1` 和 `quality-check.ps1` 确保代码质量

## 🔧 自定义和扩展

所有脚本都支持参数自定义，使用 `-Help` 参数查看具体用法：

```powershell
.\scripts\setup\setup-dev-env.ps1 -Help
```

如需添加新脚本，请按照现有分类放置，并更新 `scripts-manager.ps1` 中的配置。



