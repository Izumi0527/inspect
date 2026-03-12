# UltraThink 脚本目录结构

本目录包含了 UltraThink 项目的所有 PowerShell 脚本，按功能分类组织。

## 📁 目录结构

```
scripts/
├── development/        # 开发服务脚本
│   ├── setup-dev-env.ps1      # 一键开发环境设置
│   ├── dev-start.ps1          # 一键启动开发环境
│   └── README.md              # 开发脚本说明
│
├── database/          # 数据库管理脚本
│   ├── db-manage.ps1          # 数据库服务管理
│   ├── db-init-complete.ps1   # 数据库完整初始化（基础配置/模板/种子）
│   └── README.md              # 数据库脚本说明
│
├── tests/             # 测试与维护脚本
│   ├── run-tests.ps1          # 统一测试运行器
│   ├── quality-check.ps1      # 代码质量检查
│   ├── clean-cache.ps1        # 清理项目缓存
│   ├── view-logs.ps1          # 日志查看工具
│   └── README.md              # 说明文档
│
└── README.md          # 本说明文件
```

> Python 后端相关脚本已迁移至 `legacy/scripts/`，仅保留历史参考。

## 🚀 快速开始

### 1. 环境设置
```powershell
# 一键设置完整开发环境
.\scripts\development\setup-dev-env.ps1
```

### 2. 启动开发服务
```powershell
# 一键启动所有服务
.\scripts\development\dev-start.ps1

# 仅启动前端服务
cd frontend
pnpm dev

# 仅启动后端服务
cd backend-go
go run ./cmd/api
```

### 3. 数据库管理
```powershell
# 启动数据库服务
.\scripts\database\db-manage.ps1 start

# 初始化数据库（执行完整初始化脚本）
.\scripts\database\db-manage.ps1 init

# 初始化系统登录用户/权限（开发环境默认：admin/admin123/admin@admin.com/superadmin）
.\scripts\database\db-manage.ps1 seed-admin -Username admin -Password admin123 -Email admin@admin.com -Role superadmin

# 查看数据库状态
.\scripts\database\db-manage.ps1 status
```

## 🛠️ 脚本使用方式

本仓库不再提供统一的“脚本管理器”，建议直接运行脚本文件，或查看脚本内置帮助：

```powershell
# 查看脚本帮助（推荐）
pwsh -NoProfile -File .\scripts\development\dev-start.ps1 -Help
pwsh -NoProfile -File .\scripts\tests\view-logs.ps1 -Help

# 直接运行脚本
.\scripts\development\dev-start.ps1
.\scripts\tests\run-tests.ps1 -Target backend
```

## 📋 脚本分类说明

### Setup (环境设置)
- **setup-dev-env.ps1**: 一键设置完整开发环境，包括前端、后端和数据库

### Development (开发服务)
- **dev-start.ps1**: 一键启动所有开发服务，包括数据库、后端和前端
- **setup-dev-env.ps1**: 一键开发环境设置（新环境/重装依赖时使用）
- **dev-start.ps1 -Diagnose**: 开发环境诊断（已合并到 dev-start）

### Database (数据库管理)
- **db-manage.ps1**: 数据库服务的启动、停止、重启等管理操作
- **db-init-complete.ps1**: 完整数据库初始化工具（可被 db-manage.ps1 init 调用）

### Tests (测试与维护)
- **run-tests.ps1**: 统一的测试运行器，支持前端、后端、单元测试等
- **quality-check.ps1**: 代码质量检查，包括格式化、语法检查等
- **clean-cache.ps1**: 清理项目中的各种缓存文件
- **view-logs.ps1**: 查看/过滤 logs 目录下日志

## 💡 使用建议

1. **新手开发者**: 从 `setup-dev-env.ps1` 开始，一键设置完整环境
2. **日常开发**: 使用 `dev-start.ps1` 快速启动开发环境
3. **问题排查**: 使用 `dev-start.ps1 -Diagnose` 和 `view-logs.ps1` 进行诊断
4. **代码提交前**: 运行 `run-tests.ps1` 和 `quality-check.ps1` 确保代码质量

## 🔧 自定义和扩展

所有脚本都支持参数自定义，使用 `-Help` 参数查看具体用法：

```powershell
.\scripts\development\setup-dev-env.ps1 -Help
```

如需添加新脚本，请按照现有分类放置，并同步更新 `scripts/README.md` 与对应子目录的 `README.md`（如 `scripts/tests/README.md`）。



