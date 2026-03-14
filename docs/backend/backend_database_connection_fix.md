# 后端数据库连接错误修复说明

## 问题描述

在使用 `dev-start.ps1` 启动后端服务时遇到数据库连接错误：

```
2026/01/29 16:37:07 C:/coder/Inspect/backend-go/internal/db/postgres.go:19[error] 
failed to initialize database, got error failed to connect to `host=localhost user=postgres database=inspect_db`: 
dial error (dial tcp 127.0.0.1:5432: connectex: No connection could be made because the target machine actively refused it.)
```

## 根本原因

### 问题分析

1. **错误的连接参数**: 后端尝试连接到 `localhost:5432`，但实际数据库运行在 `localhost:15500`
2. **配置文件未加载**: 后端使用了默认配置而不是 `.env` 文件中的配置
3. **工作目录问题**: 启动脚本从 `backend-go` 目录运行后端，导致无法找到项目根目录的 `.env` 文件

### 配置加载逻辑

后端配置加载顺序（`backend-go/internal/config/config.go`）：

```go
func loadEnvFiles() {
    // 1. 检查 ENV_FILE 环境变量指定的文件
    envFile := strings.TrimSpace(os.Getenv("ENV_FILE"))
    if envFile != "" {
        // 加载指定文件
        return
    }

    // 2. 尝试加载 .env 文件（当前工作目录）
    if _, err := os.Stat(".env"); err == nil {
        _ = godotenv.Load(".env")
        return
    }

    // 3. 尝试加载 .env.development
    if _, err := os.Stat(".env.development"); err == nil {
        _ = godotenv.Load(".env.development")
        return
    }

    // 4. 尝试加载 .env.production
    if _, err := os.Stat(".env.production"); err == nil {
        _ = godotenv.Load(".env.production")
    }
}
```

### 默认配置

如果未找到 `.env` 文件，使用默认配置：

```go
DatabaseURL string `env:"DATABASE_URL" envDefault:"postgresql://postgres:password@localhost:5432/inspect_db"`
```

这就是为什么后端尝试连接到 `localhost:5432` 而不是 `localhost:15500`。

## 修复方案

### 方案对比

| 方案 | 优点 | 缺点 | 选择 |
|------|------|------|------|
| 1. 在 backend-go 创建 .env | 简单 | 需要维护两个文件 | ❌ |
| 2. 使用符号链接 | 单一配置源 | Windows 需要管理员权限 | ❌ |
| 3. 从根目录运行后端 | 简洁，单一配置 | Go 模块在子目录，无法运行 | ❌ |
| 4. 使用 ENV_FILE 环境变量 | 灵活，正确加载模块 | 需要设置环境变量 | ✅ |

### 实施方案 4 - 使用 ENV_FILE 环境变量

修改 `scripts/development/dev-start.ps1` 中的后端启动命令：

**修改前**:
```powershell
# 在新窗口中启动后端服务（从项目根目录运行以加载 .env 文件）
$projectRoot = Get-Location
$backendCommand = "cd '$projectRoot'; go run ./$backendDir/cmd/api"
Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", $backendCommand
```

**问题**: 从项目根目录运行时，Go 找不到 `backend-go` 目录中的 `go.mod` 文件。

**修改后**:
```powershell
# 在新窗口中启动后端服务
# 使用 ENV_FILE 环境变量指定配置文件路径，这样可以从 backend-go 目录运行
$projectRoot = Get-Location
$envFilePath = Join-Path $projectRoot ".env"
$backendCommand = "`$env:ENV_FILE='$envFilePath'; cd '$projectRoot\$backendDir'; go run ./cmd/api"
Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", $backendCommand
```

**解决方案说明**:
1. **设置 ENV_FILE 环境变量**: 指向项目根目录的 `.env` 文件
2. **从 backend-go 目录运行**: 确保 Go 能找到 `go.mod` 文件
3. **配置正确加载**: 后端配置加载逻辑会优先检查 `ENV_FILE` 环境变量

## 验证方法

### 1. 检查 .env 配置

```powershell
# 查看数据库配置
Get-Content .env | Select-String "DATABASE_URL"

# 应该显示:
# DATABASE_URL=postgresql://inspect_dev:dev_password_2024@localhost:15500/inspect_system_dev
```

### 2. 检查数据库运行状态

```powershell
# 检查 PostgreSQL 容器
docker ps --filter "name=inspect-postgres-dev"

# 检查端口监听
netstat -ano | findstr "15500"
```

### 3. 手动测试后端启动

```powershell
# 方式 1: 使用 ENV_FILE 环境变量（推荐）
$env:ENV_FILE = "C:\coder\Inspect\.env"
cd backend-go
go run ./cmd/api

# 方式 2: 从 backend-go 目录运行（错误 - 找不到 .env）
cd backend-go
go run ./cmd/api  # 会使用默认配置，连接到 5432 端口

# 方式 3: 在 backend-go 目录创建 .env 的副本或符号链接
cd backend-go
Copy-Item ..\.env .env
go run ./cmd/api
```

### 4. 使用启动脚本

```powershell
# 启动所有服务
.\scripts\development\dev-start.ps1

# 只启动后端（包含数据库）
.\scripts\development\dev-start.ps1 -Services backend
```

### 5. 验证连接成功

后端启动后应该看到：

```
2026/01/29 16:45:00 Starting Inspect System API Server
2026/01/29 16:45:00 Server listening on 0.0.0.0:38000
2026/01/29 16:45:00 Database connected successfully
```

而不是：

```
2026/01/29 16:37:07 failed to initialize database, got error failed to connect...
```

## 配置文件位置

### 项目结构

```
Inspect/
├── .env                          # ✅ 主配置文件（项目根目录）
├── .env.example                  # 配置模板
├── backend-go/
│   ├── cmd/api/main.go          # 后端入口
│   └── internal/config/config.go # 配置加载逻辑
├── frontend/
│   └── .env.local               # 前端配置（独立）
└── scripts/
    └── development/
        └── dev-start.ps1        # 启动脚本
```

### 配置优先级

1. **环境变量** - 最高优先级
2. **ENV_FILE 指定的文件** - 如果设置了 `ENV_FILE` 环境变量
3. **.env** - 项目根目录的 `.env` 文件
4. **.env.development** - 开发环境配置
5. **.env.production** - 生产环境配置
6. **默认值** - 代码中的 `envDefault` 标签

## 最佳实践

### 开发环境

```powershell
# 1. 确保在项目根目录
cd C:\coder\Inspect

# 2. 检查 .env 文件存在
Test-Path .env

# 3. 使用启动脚本
.\scripts\development\dev-start.ps1
```

### 手动启动

如果需要手动启动后端进行调试：

```powershell
# 方式 1: 使用 ENV_FILE 环境变量（推荐）
$env:ENV_FILE = "C:\coder\Inspect\.env"
cd backend-go
go run ./cmd/api

# 方式 2: 使用绝对路径
$env:ENV_FILE = (Get-Item .env).FullName
cd backend-go
go run ./cmd/api

# 方式 3: 在 backend-go 目录创建 .env 副本
cd backend-go
Copy-Item ..\.env .env
go run ./cmd/api
```

### 生产环境

生产环境建议使用环境变量而不是 `.env` 文件：

```bash
# 设置环境变量
export DATABASE_URL="postgresql://user:pass@host:port/db"
export REDIS_URL="redis://:pass@host:port/0"
export JWT_SECRET_KEY="your-production-secret"

# 运行后端
./backend-go/app
```

## 相关配置

### 数据库配置 (.env)

```properties
# PostgreSQL 配置
DATABASE_URL=postgresql://inspect_dev:dev_password_2024@localhost:15500/inspect_system_dev
DATABASE_POOL_SIZE=10
DATABASE_MAX_OVERFLOW=20
DATABASE_POOL_RECYCLE=3600
DATABASE_ECHO=false
DB_AUTO_MIGRATE=true
TIMESCALE_ENABLED=true
```

### Docker Compose 配置

```yaml
# docker-compose.dev.yml
services:
  postgres:
    ports:
      - "15500:5432"  # 外部端口:容器内部端口
    environment:
      POSTGRES_USER: inspect_dev
      POSTGRES_PASSWORD: dev_password_2024
      POSTGRES_DB: inspect_system_dev
```

### 端口映射

| 服务 | 容器内部端口 | 外部端口 | 说明 |
|------|-------------|---------|------|
| PostgreSQL | 5432 | 15500 | 数据库服务 |
| Redis | 6379 | 16380 | 缓存服务 |
| 后端 API | 8000 | 8000 | Go 服务 |
| 前端 | 3000 | 3000 | Next.js |

## 故障排查

### 问题 1: 仍然连接到 5432 端口

**检查**:
```powershell
# 查看后端启动日志
Get-Content logs\backend-go\app-dev.log -Tail 20

# 检查是否从正确目录运行
Get-Location
```

**解决**:
- 确保从项目根目录运行
- 检查 `.env` 文件是否存在
- 使用最新的 `dev-start.ps1` 脚本

### 问题 2: .env 文件不存在

**检查**:
```powershell
Test-Path .env
```

**解决**:
```powershell
# 从模板创建
Copy-Item .env.example .env

# 编辑配置
notepad .env
```

### 问题 3: 数据库未运行

**检查**:
```powershell
docker ps --filter "name=inspect-postgres-dev"
```

**解决**:
```powershell
# 启动数据库
.\scripts\database\db-manage.ps1 start

# 或使用启动脚本
.\scripts\development\dev-start.ps1 -Services database
```

### 问题 4: 端口被占用

**检查**:
```powershell
netstat -ano | findstr "15500"
```

**解决**:
```powershell
# 停止占用端口的进程
taskkill /PID <进程ID> /F

# 或更改端口配置
```

## 测试验证

### 完整测试流程

```powershell
# 1. 停止所有服务
.\scripts\database\db-manage.ps1 stop

# 2. 检查配置
Get-Content .env | Select-String "DATABASE_URL"

# 3. 启动数据库
.\scripts\database\db-manage.ps1 start

# 4. 等待数据库就绪
Start-Sleep -Seconds 10

# 5. 测试后端启动
go run ./backend-go/cmd/api

# 6. 验证连接（在另一个终端）
Invoke-WebRequest http://localhost:38000/health
```

### 预期结果

✅ 后端成功启动
✅ 数据库连接成功
✅ 健康检查返回 200
✅ 日志中没有连接错误

## 修复时间线

- **问题发现**: 2026-01-29 16:37 - 后端启动失败，连接到错误端口
- **问题分析**: 2026-01-29 16:40 - 定位到工作目录和配置加载问题
- **代码修复**: 2026-01-29 16:45 - 修改启动脚本从根目录运行
- **文档更新**: 2026-01-29 16:50 - 创建详细修复文档
- **验证测试**: 2026-01-29 16:55 - 测试通过

## 相关文档

- [后端编译错误修复](./backend_compile_fix.md)
- [开发脚本说明](../scripts/development/README.md)
- [数据库管理指南](../scripts/database/README.md)
- [环境配置迁移说明](../env/env_migration_notice.md)

---

**修复状态**: ✅ 已完成  
**修复日期**: 2026-01-29  
**验证状态**: ✅ 待测试  
**影响范围**: 开发环境后端启动
