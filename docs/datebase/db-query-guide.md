# PostgreSQL 数据库查询指南（db-query.ps1 已移除）

## 概述

本仓库已收口移除 `db-query.ps1` 以减少脚本数量与文档漂移。本指南提供等价的 `psql` / `docker exec` 查询方式，适用于开发环境（容器名：`inspect-postgres-dev`，主机端口：`15500`）。

## 系统要求

- Windows PowerShell 5.1 或更高版本
- Docker Desktop 已安装并运行
- PostgreSQL 容器正在运行（容器名：`inspect-postgres-dev`）

## 快速开始

### 1. 基础查询
```powershell
# 查询所有表的基本信息
docker exec -it inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "\dt"
```

### 2. 查询特定表
```powershell
# 查询 users 表，显示前 20 行数据
docker exec -it inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "SELECT * FROM users LIMIT 20;"
```

### 3. 只显示表结构
```powershell
# 查看表结构（示例：users）
docker exec -it inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "\d+ users"
```

## 常用命令（psql）

> 说明：由于 `db-query.ps1` 已移除，下面给出在 `psql` 中最常用的“等价能力”。

```powershell
# 进入容器交互式 psql（推荐：不依赖本地安装 psql）
docker exec -it inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev

# 常用元命令（在 psql 交互里执行）
#   \dt            查看表
#   \d+ users       查看表结构
#   \x on/off       切换扩展显示
#   \timing on/off  统计耗时
```

## 使用示例

### 基础查询示例

```powershell
# 1. 查看所有表的概览
docker exec -it inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "\dt"

# 2. 查询特定表的详细信息
docker exec -it inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "SELECT * FROM users LIMIT 50;"

# 3. 查询多个表（使用模式匹配）
docker exec -it inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name ILIKE '%device%';"

# 4. 限制显示的数据行数
docker exec -it inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "SELECT * FROM devices LIMIT 5;"
```

### 结构和数据分离查询

```powershell
# 只显示表结构
docker exec -it inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "\d+ users"

# 只显示数据（示例：users 取前 50 行）
docker exec -it inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "SELECT * FROM users LIMIT 50;"

# 显示统计信息
docker exec -it inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "SELECT datname, numbackends, xact_commit, xact_rollback FROM pg_stat_database WHERE datname = 'inspect_system_dev';"
```

### 文件导出示例

```powershell
# 导出为 CSV 格式
docker exec -i inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "\copy (SELECT * FROM users) TO STDOUT WITH CSV HEADER" > users.csv

# 导出为“JSON Lines”（示例：PostgreSQL 直接输出 JSON 文本）
docker exec -it inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "SELECT row_to_json(t) FROM (SELECT * FROM users LIMIT 100) t;" > users.jsonl

# 导出特定表（示例：users）
docker exec -i inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "\copy (SELECT * FROM users) TO STDOUT WITH CSV HEADER" > users_export.csv
```

### 自定义 SQL 查询

```powershell
# 执行简单的计数查询
docker exec -it inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "SELECT COUNT(*) FROM users;"

# 执行复杂的联查
docker exec -it inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "SELECT u.username, COUNT(d.id) as device_count FROM users u LEFT JOIN devices d ON u.id = d.created_by GROUP BY u.id, u.username;"

# 执行聚合查询
docker exec -it inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "SELECT device_type, COUNT(*) as count, AVG(CASE WHEN status = 'online' THEN 1 ELSE 0 END) * 100 as online_rate FROM devices GROUP BY device_type;"
```

## 导出与输出（psql）

- **导出 CSV**：优先使用 `\copy ... TO STDOUT WITH CSV HEADER`，再通过 PowerShell 重定向 `>` 写入文件。
- **导出 JSON**：可用 `row_to_json(...)` 输出 JSON 文本（适合后续程序化处理）。
- **生成 HTML 报告**：建议用 BI/报表工具或应用侧导出（`psql` 本身不提供“美观 HTML 报告”能力）。

## 故障排除

### 常见错误及解决方案

1. **Docker 容器未运行**
   ```
   错误：Docker容器 'inspect-postgres-dev' 未运行或不存在
   解决：启动数据库容器 docker-compose up -d postgres-dev
   ```

2. **数据库连接失败**
   ```
   错误：数据库连接失败
   解决：检查容器状态、端口映射和数据库凭据
   ```

3. **权限不足**
   ```
   错误：SQL查询失败: permission denied
   解决：确保使用的数据库用户有相应权限
   ```

4. **表不存在**
   ```
   错误：relation "table_name" does not exist
   解决：检查表名拼写，使用 -Pattern "*" 查看所有表
   ```

### 性能优化建议

1. **限制数据行数**：使用 `-Limit` 参数限制大表的数据查询量
2. **使用模式过滤**：使用 `-Pattern` 只查询需要的表
3. **分离查询**：使用 `-ShowSchema` 或 `-ShowData` 只获取需要的信息
4. **避免大数据导出**：对于大型数据库，建议分批导出

## 高级用法

### 批量导出所有表
```powershell
# 获取所有表名并逐一导出
$tables = docker exec -i inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -Atc "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
$tables = $tables -split "`n" | Where-Object { $_ -and $_.Trim() -ne "" }

foreach ($table in $tables) {
    $file = "export_$table.csv"
    docker exec -i inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "\copy (SELECT * FROM ""$table"") TO STDOUT WITH CSV HEADER" > $file
}
```

### 定期数据库健康检查
```powershell
# 创建定期执行的健康检查报告
$date = Get-Date -Format "yyyyMMdd"
docker exec -it inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "SELECT datname, numbackends, xact_commit, xact_rollback FROM pg_stat_database WHERE datname = 'inspect_system_dev';" > "health_report_$date.txt"
```

### 数据库迁移前后对比
```powershell
# 迁移前
docker exec -i inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position;" > "schema_before.txt"

# 迁移后
docker exec -i inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -c "SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position;" > "schema_after.txt"

# 对比文件内容
```

## 安全注意事项

1. **密码安全**：脚本中的数据库密码仅用于开发环境，生产环境应使用环境变量
2. **访问控制**：确保只有授权用户能够执行此脚本
3. **数据敏感性**：导出的文件可能包含敏感数据，请妥善保管
4. **SQL 注入**：虽然脚本有基础防护，但仍需谨慎使用 `-CustomSQL` 参数

## 联系支持

如果在使用过程中遇到问题，请：
1. 查看脚本输出的错误信息
2. 检查 Docker 容器和数据库状态
3. 参考本文档的故障排除部分
4. 联系系统管理员获取帮助

---

**版本**：1.0.0
**最后更新**：2024年1月
**作者**：Claude Code Assistant
