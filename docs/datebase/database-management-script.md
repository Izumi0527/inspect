# 数据库管理脚本使用文档

## 概述

`scripts/db-manage.ps1` 是当前统一数据库管理入口，用于启动服务、初始化数据库、查看状态和执行静态验证。
旧版 `legacy/scripts/database/db-init-migrate.ps1` 为 Python 后端遗留脚本，不再使用。

## 快速开始

```powershell
# 查看帮助
Get-Help .\scripts\db-manage.ps1 -Detailed

# 执行迁移
.\scripts\db-manage.ps1 init
```

## 使用说明

- 脚本默认读取根目录 `.env.development` / `.env`。
- 数据库服务需先启动（推荐使用 `docker-compose`）。

```powershell
# 启动数据库服务
.\scripts\db-manage.ps1 start

# 迁移数据库
.\scripts\db-manage.ps1 init
```

## 相关脚本

- 数据库管理：`scripts/db-manage.ps1`
- 数据库健康检查：`.\scripts\db-manage.ps1 status`
