# 数据库 SQL 整合状态报告

更新时间：2026-05-06

## 结论

当前项目的数据库初始化链路已经收敛为两个核心 SQL 文件：

- `database/database-init-complete.sql`
- `database/builtin-templates-complete.sql`

这两个文件由 `docker-compose.dev.yml` 和 `docker-compose.prod.yml` 挂载到 PostgreSQL 容器的初始化目录中。`database/` 目录现在只保留数据库初始化所需的源码文件，不再承载历史完成报告和独立验证脚本。

数据库整合状态验证已合并到脚本目录：

```powershell
.\scripts\database\db-manage.ps1 verify
```

也可以直接调用底层初始化脚本的静态验证模式：

```powershell
.\scripts\database\db-init-complete.ps1 -VerifyOnly
```

## 目录职责

### `database/`

用于存放数据库容器初始化时直接读取的 SQL 文件。

当前应保留：

- `database-init-complete.sql`：基础初始化脚本，包含 PostgreSQL 扩展、TimescaleDB 配置、时序表、保留策略、压缩策略、带宽单位迁移和必要种子数据。
- `builtin-templates-complete.sql`：内置巡检模板脚本，包含 6 个厂商、3 类设备形态的 18 个默认模板。

不再放置：

- 历史完成报告。
- 独立整合验证脚本。
- 已过时的 legacy 文件说明。

### `scripts/database/`

用于存放数据库管理和验证脚本。

当前相关入口：

- `db-manage.ps1 init`：执行完整数据库初始化。
- `db-manage.ps1 verify`：验证整合后的 SQL 文件、文档归档和 Docker 引用。
- `db-init-complete.ps1 -VerifyOnly`：仅执行静态验证，不连接数据库。
- `db-init-complete.ps1 -InitOnly`：仅执行基础初始化。
- `db-init-complete.ps1 -TemplatesOnly`：仅执行模板初始化。

### `docs/datebase/`

用于存放数据库相关文档。当前仓库已有目录名为 `datebase`，本报告沿用现有归类，避免本次改动同时引入目录重命名。

本文件替代旧的 `database/COMPLETION_REPORT.md`，用于记录当前真实状态，而不是历史整合过程。

## 当前初始化内容

### 基础初始化脚本

`database/database-init-complete.sql` 负责：

- 创建必要 PostgreSQL 扩展：
  - `uuid-ossp`
  - `pg_stat_statements`
  - `timescaledb`
- 配置 TimescaleDB 时序能力。
- 创建或补充时序表：
  - `interface_metrics`
  - `device_status_history`
  - `system_metrics`
  - `user_activity_logs`
- 配置 hypertable、压缩策略和保留策略。
- 执行带宽单位迁移。
- 写入必要的巡检模板、告警规则和测试种子数据。

### 内置模板脚本

`database/builtin-templates-complete.sql` 负责写入默认巡检模板。

当前模板覆盖：

- Cisco
- Huawei
- H3C
- Juniper
- Arista
- Fortinet

每个厂商包含路由器、交换机、防火墙三类标准巡检模板，共 18 个模板插入语句。

## Docker 初始化链路

开发环境：

```yaml
- ./database/database-init-complete.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
- ./database/builtin-templates-complete.sql:/docker-entrypoint-initdb.d/02-templates.sql:ro
```

生产环境：

```yaml
- ./database/database-init-complete.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
- ./database/builtin-templates-complete.sql:/docker-entrypoint-initdb.d/02-templates.sql:ro
```

注意：PostgreSQL 官方初始化目录只会在数据目录首次创建时执行脚本。已有数据卷不会因为 SQL 文件更新而自动重跑初始化。

## 验证范围

`db-manage.ps1 verify` 当前执行静态验证，不连接数据库，不修改数据。

验证内容包括：

- 核心 SQL 文件存在。
- 旧报告和旧验证脚本已经移出 `database/`。
- 基础 SQL 包含扩展、TimescaleDB、压缩策略、保留策略和带宽单位迁移。
- 模板 SQL 包含 18 个默认模板。
- 6 个厂商模板覆盖数量正确。
- `db-manage.ps1` 提供统一 `verify` 入口。
- 开发和生产 Docker Compose 均引用两个整合 SQL 文件。
- 本报告已归档到 `docs/datebase/`。

## 与旧报告的差异

旧报告描述的是 2025-01-23 的整合完成状态，其中提到一些当前仓库不再存在的文件或目录，例如：

- `database/legacy/`
- `database/MIGRATION_GUIDE.md`
- `database/CONSOLIDATION_SUMMARY.md`
- `database/README-inspection-templates.md`
- `database/verify-consolidation.ps1`

当前仓库已经不再按上述结构组织数据库资料。因此，本报告以当前实际文件结构、脚本入口和 Docker 引用为准。

## 维护建议

- 修改数据库初始化结构时，应同步检查：
  - `database/database-init-complete.sql`
  - `database/builtin-templates-complete.sql`
  - `docker-compose.dev.yml`
  - `docker-compose.prod.yml`
  - `scripts/database/db-init-complete.ps1`
  - `scripts/database/db-manage.ps1`
- 修改内置模板时，应运行：

```powershell
.\scripts\database\db-manage.ps1 verify
```

- 需要验证真实数据库初始化效果时，再运行：

```powershell
.\scripts\database\db-manage.ps1 init
```

该命令会连接数据库并执行 SQL，请在确认目标环境后再运行。
