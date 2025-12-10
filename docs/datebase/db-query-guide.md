# PostgreSQL 数据库查询脚本使用指南

## 概述

`db-query.ps1` 是一个功能强大的 PowerShell 脚本，专为查询运行在 Docker 容器中的 PostgreSQL 数据库而设计。该脚本支持多种查询模式和输出格式，是数据库管理和分析的理想工具。

## 系统要求

- Windows PowerShell 5.1 或更高版本
- Docker Desktop 已安装并运行
- PostgreSQL 容器正在运行（容器名：`inspect-postgres-dev`）

## 快速开始

### 1. 基础查询
```powershell
# 查询所有表的基本信息
.\scripts\db-query.ps1
```

### 2. 查询特定表
```powershell
# 查询 users 表，显示前 20 行数据
.\scripts\db-query.ps1 -Table users -Limit 20
```

### 3. 只显示表结构
```powershell
# 只显示所有表的结构信息，不显示数据
.\scripts\db-query.ps1 -ShowSchema
```

## 参数详解

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `-Table` | 字符串 | "" | 指定要查询的表名 |
| `-Limit` | 整数 | 10 | 限制查询的数据行数 |
| `-Format` | 枚举 | "Console" | 输出格式：Console/CSV/JSON/HTML |
| `-Output` | 字符串 | "" | 输出文件路径 |
| `-CustomSQL` | 字符串 | "" | 执行自定义 SQL 查询 |
| `-ShowSchema` | 开关 | False | 只显示表结构信息 |
| `-ShowData` | 开关 | False | 只显示表数据 |
| `-ShowStats` | 开关 | False | 显示表统计信息 |
| `-Pattern` | 字符串 | "*" | 表名过滤模式（支持通配符） |
| `-Help` | 开关 | False | 显示帮助信息 |

## 使用示例

### 基础查询示例

```powershell
# 1. 查看所有表的概览
.\scripts\db-query.ps1

# 2. 查询特定表的详细信息
.\scripts\db-query.ps1 -Table users

# 3. 查询多个表（使用模式匹配）
.\scripts\db-query.ps1 -Pattern "*device*"

# 4. 限制显示的数据行数
.\scripts\db-query.ps1 -Table devices -Limit 5
```

### 结构和数据分离查询

```powershell
# 只显示表结构
.\scripts\db-query.ps1 -ShowSchema

# 只显示数据，不显示结构
.\scripts\db-query.ps1 -ShowData -Limit 50

# 显示统计信息
.\scripts\db-query.ps1 -ShowStats
```

### 文件导出示例

```powershell
# 导出为 CSV 格式
.\scripts\db-query.ps1 -Format CSV -Output "database_report.csv"

# 导出为 JSON 格式
.\scripts\db-query.ps1 -Format JSON -Output "database_report.json"

# 导出为 HTML 格式
.\scripts\db-query.ps1 -Format HTML -Output "database_report.html"

# 导出特定表的信息
.\scripts\db-query.ps1 -Table users -Format HTML -Output "users_table.html"
```

### 自定义 SQL 查询

```powershell
# 执行简单的计数查询
.\scripts\db-query.ps1 -CustomSQL "SELECT COUNT(*) FROM users"

# 执行复杂的联查
.\scripts\db-query.ps1 -CustomSQL "SELECT u.username, COUNT(d.id) as device_count FROM users u LEFT JOIN devices d ON u.id = d.created_by GROUP BY u.id, u.username"

# 执行聚合查询
.\scripts\db-query.ps1 -CustomSQL "SELECT device_type, COUNT(*) as count, AVG(CASE WHEN status = 'online' THEN 1 ELSE 0 END) * 100 as online_rate FROM devices GROUP BY device_type"
```

## 输出格式说明

### 控制台输出（Console）
- 彩色格式化显示
- 表格形式展示数据
- 实时显示执行进度
- 包含完整的统计信息

### CSV 输出
- 标准 CSV 格式，支持 Excel 打开
- UTF-8 编码，支持中文
- 包含表概览和列结构信息

### JSON 输出
- 结构化 JSON 格式
- 包含数据库信息、表详情、统计信息
- 适合程序化处理

### HTML 输出
- 美观的网页报告
- 响应式设计，支持移动设备
- 包含图表和统计数据
- 适合分享和展示

## 输出信息详解

### 数据表概览
- **表名**：数据库表的名称
- **列数**：表中列的总数
- **行数**：表中记录的总数
- **表大小**：表占用的磁盘空间

### 表结构信息
- **列名**：字段名称
- **数据类型**：PostgreSQL 数据类型
- **可空**：是否允许 NULL 值
- **主键**：是否为主键字段
- **默认值**：字段的默认值

### 统计信息
- **总行数**：表中记录总数
- **表大小**：包含索引的总大小
- **数据大小**：纯数据占用空间
- **索引大小**：索引占用空间

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
$tables = (.\scripts\db-query.ps1 -CustomSQL "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'" | Where-Object { $_ -ne "" })

foreach ($table in $tables) {
    .\scripts\db-query.ps1 -Table $table -Format CSV -Output "export_$table.csv"
}
```

### 定期数据库健康检查
```powershell
# 创建定期执行的健康检查报告
$date = Get-Date -Format "yyyyMMdd"
.\scripts\db-query.ps1 -ShowStats -Format HTML -Output "health_report_$date.html"
```

### 数据库迁移前后对比
```powershell
# 迁移前
.\scripts\db-query.ps1 -ShowSchema -Format JSON -Output "schema_before.json"

# 迁移后
.\scripts\db-query.ps1 -ShowSchema -Format JSON -Output "schema_after.json"

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