# 数据库初始化和迁移脚本使用文档

## 概述

`db-init-migrate.ps1` 是企业级网络设备巡检系统的数据库管理脚本，支持 PostgreSQL、Redis、InfluxDB 三种数据库的完整生命周期管理。

## 主要功能

- 🔧 **数据库初始化**: 创建和配置所有数据库
- 📦 **迁移管理**: 执行和管理数据库schema变更
- 💾 **数据导入**: 导入初始数据、示例数据和测试数据集
- 🗄️ **备份与恢复**: 完整的数据库备份和恢复功能
- 🏥 **健康检查**: 数据库连接状态和性能监控

## 快速开始

### 1. 基本使用

```powershell
# 查看帮助信息
.\scripts\db-init-migrate.ps1 -Help

# 初始化所有数据库
.\scripts\db-init-migrate.ps1 -Init

# 运行数据库迁移
.\scripts\db-init-migrate.ps1 -Migrate

# 健康检查
.\scripts\db-init-migrate.ps1 -HealthCheck
```

### 2. 常用场景

#### 开发环境首次搭建
```powershell
# 1. 确保数据库服务已启动
.\scripts\dev-start.ps1

# 2. 初始化数据库
.\scripts\db-init-migrate.ps1 -Init

# 3. 导入示例数据
.\scripts\db-init-migrate.ps1 -ImportData
```

#### 数据库迁移
```powershell
# 创建新迁移
.\scripts\db-init-migrate.ps1 -CreateMigration "添加新功能表"

# 查看迁移状态
.\scripts\db-init-migrate.ps1 -Status

# 执行迁移
.\scripts\db-init-migrate.ps1 -Migrate
```

#### 数据备份
```powershell
# 备份所有数据库
.\scripts\db-init-migrate.ps1 -Backup

# 查看可用备份
.\scripts\db-init-migrate.ps1 -Restore
```

## 命令参数详解

| 参数 | 描述 | 示例 |
|------|------|------|
| `-Init` | 初始化所有数据库 | `.\db-init-migrate.ps1 -Init` |
| `-Migrate` | 运行迁移到最新版本 | `.\db-init-migrate.ps1 -Migrate` |
| `-CreateMigration <名称>` | 创建新的迁移文件 | `.\db-init-migrate.ps1 -CreateMigration "添加用户表"` |
| `-ImportData` | 导入数据（交互式选择） | `.\db-init-migrate.ps1 -ImportData` |
| `-Backup` | 备份所有数据库 | `.\db-init-migrate.ps1 -Backup` |
| `-Restore` | 恢复数据库（交互式） | `.\db-init-migrate.ps1 -Restore` |
| `-Status` | 显示迁移状态 | `.\db-init-migrate.ps1 -Status` |
| `-Clean` | 清理并重置数据库 | `.\db-init-migrate.ps1 -Clean` |
| `-HealthCheck` | 运行健康检查 | `.\db-init-migrate.ps1 -HealthCheck` |
| `-Help` | 显示帮助信息 | `.\db-init-migrate.ps1 -Help` |

## 数据导入选项

脚本支持多种数据导入方式：

1. **跳过数据导入** - 仅创建空数据库结构
2. **基础初始数据** - 导入系统必需的默认数据
3. **示例数据** - 导入少量示例数据用于演示
4. **完整测试数据集** - 导入大量测试数据用于开发测试
5. **InfluxDB 监控数据** - 导入时序监控数据
6. **所有数据** - 导入完整的数据集

## 文件结构

```
scripts/
├── db-init-migrate.ps1     # 主脚本文件
├── db-health-check.ps1     # 健康检查脚本
├── dev-start.ps1           # 开发环境启动
└── dev-start-cn.ps1        # 中文版启动脚本

logs/
└── database/
    └── init-migrate.log    # 脚本执行日志

backups/
├── postgres/               # PostgreSQL 备份
├── redis/                  # Redis 备份
└── influxdb/              # InfluxDB 备份
```

## 故障排查

### 常见问题

1. **Docker 服务未启动**
   ```
   错误: PostgreSQL 容器未运行
   解决: 执行 .\scripts\dev-start.ps1 启动服务
   ```

2. **Python 环境问题**
   ```
   错误: 虚拟环境不存在
   解决: 脚本会自动创建，或手动执行 cd backend && uv venv
   ```

3. **数据库连接失败**
   ```
   错误: PostgreSQL 连接失败
   解决: 检查数据库服务状态和配置文件
   ```

### 日志查看
```powershell
# 查看详细日志
Get-Content logs\database\init-migrate.log -Tail 50

# 查看 Docker 服务日志
docker-compose -f docker-compose.dev.yml logs
```

## 高级用法

### 自定义配置

脚本会自动读取 `.env.development` 或 `.env` 文件中的数据库配置：

```env
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5433/database
REDIS_URL=redis://:password@localhost:6380/0
```

### 批量操作

```powershell
# 完整的数据库重建流程
.\scripts\db-init-migrate.ps1 -Clean
.\scripts\db-init-migrate.ps1 -Init
.\scripts\db-init-migrate.ps1 -ImportData
.\scripts\db-init-migrate.ps1 -HealthCheck
```

## 最佳实践

1. **开发环境**: 定期备份，使用示例数据
2. **测试环境**: 使用完整测试数据集
3. **生产环境**: 仅导入必要的初始数据
4. **迁移管理**: 先在开发环境测试迁移脚本
5. **备份策略**: 定期自动备份，保留7天历史

## 安全注意事项

- 脚本包含数据库清理功能，使用时需要确认
- 备份文件包含敏感数据，注意存储安全
- 生产环境使用前请充分测试
- 恢复操作会覆盖现有数据，请谨慎操作

---

如需更多帮助，请查看项目文档或联系开发团队。