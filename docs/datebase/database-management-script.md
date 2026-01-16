# 数据库迁移脚本使用文档（Go 版）

## 概述

`db-init-migrate-go.ps1` 用于执行 Go 后端的数据库迁移（AutoMigrate + TimescaleDB 初始化）。
旧版 `legacy/scripts/database/db-init-migrate.ps1` 为 Python 后端遗留脚本，不再使用。

## 快速开始

```powershell
# 查看帮助
.\scripts\database\db-init-migrate-go.ps1 -Help

# 执行迁移
.\scripts\database\db-init-migrate-go.ps1
```

## 使用说明

- 脚本默认读取根目录 `.env.development` / `.env`。
- 数据库服务需先启动（推荐使用 `docker-compose`）。

```powershell
# 启动数据库服务
.\scripts\database\db-manage.ps1 start

# 迁移数据库
.\scripts\database\db-init-migrate-go.ps1
```

## 相关脚本

- 数据库管理：`scripts/database/db-manage.ps1`
- 数据库健康检查：`scripts/database/db-health-check.ps1`
