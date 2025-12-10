# 🚀 PowerShell 脚本快速开始指南

## 📋 概述

本指南帮助您快速上手使用企业级网络设备巡检系统的 PowerShell 脚本工具集。

## ⚡ 快速开始

### 1️⃣ 首次使用 - 一键环境设置

```powershell
# 运行一键环境设置脚本
.\scripts\setup-dev-env.ps1
```

这个脚本会自动：
- ✅ 检查前置条件（Git、Docker、Node.js、Python、uv、pnpm）
- ✅ 创建环境配置文件
- ✅ 设置数据库环境
- ✅ 设置后端 Python 3.12.9 环境
- ✅ 设置前端 Node.js 环境
- ✅ 运行测试验证

### 2️⃣ 日常开发 - 快速启动

```powershell
# 启动开发环境
.\scripts\dev-start.ps1
```

这个脚本会启动：
- 🗄️ 数据库服务（PostgreSQL、Redis、InfluxDB）
- 🐍 后端开发服务器
- 🎨 前端开发服务器

### 3️⃣ 脚本管理 - 查看所有可用脚本

```powershell
# 查看所有脚本
.\scripts\scripts-manager.ps1 list

# 查看脚本帮助
.\scripts\scripts-manager.ps1 help -Script setup-dev-env

# 检查脚本状态
.\scripts\scripts-manager.ps1 check
```

## 🛠️ 常用脚本速查

### 环境管理
```powershell
# 一键环境设置
.\scripts\setup-dev-env.ps1

# 前端环境设置
.\scripts\frontend-setup.ps1 setup

# 后端环境设置
.\scripts\backend-setup.ps1 setup
```

### 服务管理
```powershell
# 启动开发环境
.\scripts\dev-start.ps1

# 启动后端服务
.\scripts\start-backend.ps1 -Dev

# 数据库管理
.\scripts\db-manage.ps1 start
.\scripts\db-manage.ps1 stop
.\scripts\db-manage.ps1 status
```

### 测试和质量
```powershell
# 代码质量检查
.\scripts\quality-check.ps1

# 运行所有测试
.\scripts\run-tests.ps1

# 生成测试覆盖率
.\scripts\run-tests.ps1 -Coverage
```

### 缓存清理
```powershell
# 清理项目特定文件（推荐）
.\scripts\clean-cache.ps1 -ProjectFiles

# 清理所有缓存
.\scripts\clean-cache.ps1 -All

# 预览清理内容
.\scripts\clean-cache.ps1 -ProjectFiles -WhatIf
```

### 日志查看
```powershell
# 查看应用日志
.\scripts\view-logs.ps1

# 实时监控日志
.\scripts\view-logs.ps1 -Follow

# 测试日志功能
.\scripts\test-logs.ps1
```

## 🎯 典型工作流程

### 新开发者入门流程
```powershell
# 1. 一键环境设置
.\scripts\setup-dev-env.ps1

# 2. 启动开发环境
.\scripts\dev-start.ps1

# 3. 开始开发...

# 4. 代码质量检查
.\scripts\quality-check.ps1 -Fix

# 5. 运行测试
.\scripts\run-tests.ps1
```

### 日常开发流程
```powershell
# 1. 启动开发环境
.\scripts\dev-start.ps1

# 2. 开发代码...

# 3. 质量检查和测试
.\scripts\quality-check.ps1
.\scripts\run-tests.ps1

# 4. 清理缓存（可选）
.\scripts\clean-cache.ps1 -ProjectFiles
```

### 问题排查流程
```powershell
# 1. 检查脚本状态
.\scripts\scripts-manager.ps1 check

# 2. 查看服务状态
.\scripts\db-manage.ps1 status

# 3. 查看日志
.\scripts\view-logs.ps1

# 4. 重置环境（如果需要）
.\scripts\db-manage.ps1 reset
.\scripts\setup-dev-env.ps1
```

## 🚨 常见问题快速解决

### 问题：脚本无法执行
```powershell
# 解决方案：设置执行策略
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 问题：Python 环境问题
```powershell
# 解决方案：重新设置后端环境
.\scripts\backend-setup.ps1 setup
```

### 问题：前端依赖问题
```powershell
# 解决方案：重新设置前端环境
.\scripts\frontend-setup.ps1 setup
```

### 问题：数据库连接失败
```powershell
# 解决方案：重启数据库服务
.\scripts\db-manage.ps1 stop
.\scripts\db-manage.ps1 start
```

### 问题：缓存文件过多
```powershell
# 解决方案：清理缓存
.\scripts\clean-cache.ps1 -All
```

## 📊 服务访问地址

启动开发环境后，可以通过以下地址访问各种服务：

### Web 服务
- 🎨 **前端应用**: http://localhost:3000
- 🐍 **后端 API**: http://localhost:8000
- 📚 **API 文档**: http://localhost:8000/docs
- 📊 **API 调试**: http://localhost:8000/redoc

### 数据库服务
- 🐘 **PostgreSQL**: localhost:5433
- 🔴 **Redis**: localhost:6380
- 📈 **InfluxDB**: http://localhost:8087

### 管理工具
- 🔧 **pgAdmin**: http://localhost:5050
- 🔧 **Redis Commander**: http://localhost:8081

## 💡 最佳实践提示

1. **首次使用**：建议先运行 `.\scripts\setup-dev-env.ps1` 进行完整环境设置
2. **日常开发**：使用 `.\scripts\dev-start.ps1` 快速启动开发环境
3. **代码提交前**：运行 `.\scripts\quality-check.ps1` 和 `.\scripts\run-tests.ps1`
4. **定期清理**：使用 `.\scripts\clean-cache.ps1 -ProjectFiles` 清理临时文件
5. **问题排查**：使用 `.\scripts\scripts-manager.ps1 check` 检查脚本状态

## 📚 更多信息

- 📖 **详细文档**: [scripts/README.md](./README.md)
- 🎯 **完成报告**: [scripts/POWERSHELL_SCRIPTS_COMPLETION_REPORT.md](./POWERSHELL_SCRIPTS_COMPLETION_REPORT.md)
- 📋 **项目文档**: [docs/README.md](../docs/README.md)

---

**快速指南版本**: v1.0.0  
**更新时间**: 2025-12-10  
**适用脚本**: PowerShell 脚本工具集 v1.0.0