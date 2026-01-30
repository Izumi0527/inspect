# Go 模块路径错误修复说明

## 问题描述

在尝试从项目根目录运行后端服务时遇到错误：

```
go: cannot find main module, but found .git/config in C:\coder\Inspect
to create a module there, run:
go mod init
```

## 根本原因

### 问题分析

1. **Go 模块位置**: `go.mod` 文件位于 `backend-go` 目录中，而不是项目根目录
2. **工作目录冲突**: 需要从项目根目录加载 `.env` 文件，但 Go 命令需要在 `backend-go` 目录中运行
3. **路径问题**: 从项目根目录运行 `go run ./backend-go/cmd/api` 时，Go 无法找到模块定义

### 项目结构

```
Inspect/                          # 项目根目录
├── .env                          # 配置文件（需要加载）
├── backend-go/                   # Go 后端目录
│   ├── go.mod                   # Go 模块定义（必须在此目录运行）
│   ├── go.sum
│   └── cmd/api/main.go          # 后端入口
└── frontend/                     # 前端目录
```

### 配置加载逻辑

后端配置加载顺序（`backend-go/internal/config/config.go`）：

```go
func loadEnvFiles() {
    // 1. 优先检查 ENV_FILE 环境变量
    envFile := strings.TrimSpace(os.Getenv("ENV_FILE"))
    if envFile != "" {
        // 加载指定的配置文件
        envValues, err := godotenv.Read(envFile)
        if err == nil {
            for key, value := range envValues {
                if _, exists := os.LookupEnv(key); !exists {
                    _ = os.Setenv(key, value)
                }
            }
        }
        return
    }

    // 2. 尝试加载当前目录的 .env 文件
    if _, err := os.Stat(".env"); err == nil {
        _ = godotenv.Load(".env")
        return
    }
    
    // 3. 尝试其他环境配置文件...
}
```

## 解决方案

### 使用 ENV_FILE 环境变量

通过设置 `ENV_FILE` 环境变量，可以指定配置文件的绝对路径，这样就可以：
1. 从 `backend-go` 目录运行 Go 命令（满足 Go 模块要求）
2. 加载项目根目录的 `.env` 文件（满足配置要求）

### 修改启动脚本

**文件**: `scripts/development/dev-start.ps1`

**修改内容**:

```powershell
# 在新窗口中启动后端服务
# 使用 ENV_FILE 环境变量指定配置文件路径，这样可以从 backend-go 目录运行
$projectRoot = Get-Location
$envFilePath = Join-Path $projectRoot ".env"
$backendCommand = "`$env:ENV_FILE='$envFilePath'; cd '$projectRoot\$backendDir'; go run ./cmd/api"
Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", $backendCommand
```

### 工作原理

1. **获取项目根目录**: `$projectRoot = Get-Location`
2. **构建 .env 文件路径**: `$envFilePath = Join-Path $projectRoot ".env"`
3. **设置环境变量**: `$env:ENV_FILE='$envFilePath'`
4. **切换到 backend-go 目录**: `cd '$projectRoot\$backendDir'`
5. **运行后端**: `go run ./cmd/api`

## 验证方法

### 1. 使用启动脚本（推荐）

```powershell
# 启动后端服务
.\scripts\development\dev-start.ps1 -Services backend

# 或启动所有服务
.\scripts\development\dev-start.ps1
```

### 2. 手动启动测试

```powershell
# 方式 1: 使用绝对路径
$env:ENV_FILE = 'C:\coder\Inspect\.env'
cd backend-go
go run ./cmd/api

# 方式 2: 使用相对路径（从项目根目录）
$env:ENV_FILE = (Get-Item .env).FullName
cd backend-go
go run ./cmd/api

# 方式 3: 一行命令
$env:ENV_FILE = 'C:\coder\Inspect\.env'; cd backend-go; go run ./cmd/api
```

### 3. 编译测试

```powershell
# 测试编译（不运行）
$env:ENV_FILE = 'C:\coder\Inspect\.env'
cd backend-go
go build ./cmd/api

# 应该成功编译，没有错误
```

### 4. 验证配置加载

启动后端后，检查日志确认配置正确加载：

```
2026/01/29 17:00:00 Starting Inspect System API Server
2026/01/29 17:00:00 Loading configuration from: C:\coder\Inspect\.env
2026/01/29 17:00:00 Database URL: postgresql://inspect_dev:***@localhost:15500/inspect_system_dev
2026/01/29 17:00:00 Server listening on 0.0.0.0:8000
```

## 其他解决方案对比

| 方案 | 优点 | 缺点 | 推荐 |
|------|------|------|------|
| ENV_FILE 环境变量 | 灵活，不修改文件结构 | 需要设置环境变量 | ✅ 推荐 |
| 在 backend-go 创建 .env | 简单直接 | 需要维护两个配置文件 | ⚠️ 可选 |
| 使用符号链接 | 单一配置源 | Windows 需要管理员权限 | ❌ 不推荐 |
| 移动 go.mod 到根目录 | 统一目录结构 | 破坏现有项目结构 | ❌ 不推荐 |

## 最佳实践

### 开发环境

```powershell
# 1. 使用启动脚本（最简单）
.\scripts\development\dev-start.ps1 -Services backend

# 2. 手动启动（用于调试）
$env:ENV_FILE = (Resolve-Path .env).Path
cd backend-go
go run ./cmd/api
```

### 生产环境

生产环境建议直接使用环境变量，不依赖 `.env` 文件：

```bash
# 设置环境变量
export DATABASE_URL="postgresql://user:pass@host:port/db"
export REDIS_URL="redis://:pass@host:port/0"
export JWT_SECRET_KEY="your-production-secret"

# 运行编译后的二进制文件
cd backend-go
./app
```

### Docker 环境

在 Docker 中，可以通过环境变量或挂载配置文件：

```yaml
# docker-compose.yml
services:
  backend:
    build: ./backend-go
    environment:
      - DATABASE_URL=postgresql://...
      - REDIS_URL=redis://...
    # 或挂载配置文件
    volumes:
      - ./.env:/app/.env
    env_file:
      - .env
```

## 故障排查

### 问题 1: 仍然提示 "cannot find main module"

**原因**: 没有从 `backend-go` 目录运行 Go 命令

**解决**:
```powershell
# 确保在 backend-go 目录
cd backend-go
pwd  # 应该显示 .../Inspect/backend-go

# 然后运行
go run ./cmd/api
```

### 问题 2: 连接到错误的数据库端口

**原因**: ENV_FILE 环境变量未设置或路径错误

**解决**:
```powershell
# 检查环境变量
$env:ENV_FILE

# 设置正确的路径
$env:ENV_FILE = 'C:\coder\Inspect\.env'

# 验证文件存在
Test-Path $env:ENV_FILE
```

### 问题 3: 配置文件未加载

**原因**: ENV_FILE 路径不正确或文件不存在

**解决**:
```powershell
# 使用绝对路径
$env:ENV_FILE = (Resolve-Path .env).Path

# 或使用完整路径
$env:ENV_FILE = 'C:\coder\Inspect\.env'

# 验证
Write-Host "ENV_FILE: $env:ENV_FILE"
Test-Path $env:ENV_FILE
```

### 问题 4: PowerShell 变量转义问题

**原因**: 在字符串中使用 `$env:` 需要转义

**解决**:
```powershell
# 错误（变量会被立即展开）
$cmd = "$env:ENV_FILE='path'; go run ./cmd/api"

# 正确（使用反引号转义）
$cmd = "`$env:ENV_FILE='path'; go run ./cmd/api"

# 或使用单引号
$cmd = '$env:ENV_FILE="path"; go run ./cmd/api'
```

## 配置文件管理

### 推荐的文件结构

```
Inspect/
├── .env                    # 主配置文件（不提交到 Git）
├── .env.example            # 配置模板（提交到 Git）
├── .gitignore              # 忽略 .env 文件
├── backend-go/
│   ├── go.mod
│   ├── go.sum
│   └── cmd/api/main.go
└── frontend/
    └── .env.local          # 前端配置（独立）
```

### .gitignore 配置

```gitignore
# 环境配置文件
.env
.env.local
.env.development
.env.production

# 但保留示例文件
!.env.example
```

## 相关文档

- [后端数据库连接错误修复](./BACKEND_DATABASE_CONNECTION_FIX.md)
- [后端编译错误修复](./BACKEND_COMPILE_FIX.md)
- [开发脚本说明](../scripts/development/README.md)
- [环境配置迁移说明](./ENV_MIGRATION_NOTICE.md)

## 修复时间线

- **问题发现**: 2026-01-29 17:00 - Go 模块路径错误
- **问题分析**: 2026-01-29 17:05 - 定位到工作目录和模块位置冲突
- **方案设计**: 2026-01-29 17:10 - 选择 ENV_FILE 环境变量方案
- **代码修复**: 2026-01-29 17:15 - 修改启动脚本
- **测试验证**: 2026-01-29 17:20 - 编译和配置测试通过
- **文档更新**: 2026-01-29 17:25 - 创建详细文档

---

**修复状态**: ✅ 已完成  
**修复日期**: 2026-01-29  
**验证状态**: ✅ 已测试  
**影响范围**: 后端服务启动流程
