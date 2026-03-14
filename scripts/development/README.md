# 开发脚本

## 📋 概述

本目录包含开发环境相关的管理脚本，用于快速启动、管理和维护开发服务。

## 🚀 快速开始

### 一键启动开发环境（推荐）

```powershell
# 启动所有服务（数据库 + 后端 + 前端）
.\dev-start.ps1

# 只启动数据库
.\dev-start.ps1 -Services database

# 只启动后端（包含数据库）
.\dev-start.ps1 -Services backend

# 只启动前端
.\dev-start.ps1 -Services frontend

# 跳过健康检查（加快启动速度）
.\dev-start.ps1 -SkipHealthCheck
```

**智能检测特性**:
- ✅ 自动检测数据库是否已运行，避免重复启动
- ✅ 自动使用正确的 Docker Compose 配置文件
- ✅ 自动处理网络配置问题
- ✅ 提供详细的状态反馈

### 手动启动服务

```powershell
# 1. 启动数据库
.\scripts\database\db-manage.ps1 start

# 2. 启动后端（在 backend-go 目录）
cd backend-go
go run ./cmd/api

# 3. 启动前端（在 frontend 目录）
cd frontend
pnpm dev
```

## 📁 脚本清单

| 脚本 | 功能 | 用途 |
|------|------|------|
| `setup-dev-env.ps1` | 一键开发环境设置脚本 | 初始化开发环境（前端/后端/数据库） |
| `dev-start.ps1` | 统一开发环境启动工具 | 一键启动所有开发服务 |
| `dev-start.ps1 -Diagnose` | 开发环境诊断 | 仅执行检查，不启动服务 |

## 🔧 详细说明

### dev-start.ps1 - 统一启动工具 ⭐

**功能**: 一站式开发环境启动工具

**参数**:
- `-Services` - 指定服务: database, backend, frontend, all (默认)
- `-Wait` - 等待服务启动时间（秒，默认 10）
- `-SkipHealthCheck` - 跳过健康检查
- `-Diagnose` - 仅执行开发环境诊断（不启动服务）

**特性**:
- ✅ 自动检查前置条件（Docker、Go、pnpm）
- ✅ 智能启动服务（数据库、后端、前端）
- ✅ 自动健康检查
- ✅ 在独立窗口中运行后端和前端
- ✅ 显示完整的服务信息和访问地址

**示例**:
```powershell
# 启动所有服务
.\dev-start.ps1

# 只启动数据库和后端
.\dev-start.ps1 -Services backend

# 启动所有服务并等待 30 秒
.\dev-start.ps1 -Wait 30

# 跳过健康检查
.\dev-start.ps1 -SkipHealthCheck

# 仅执行诊断（不启动服务）
.\dev-start.ps1 -Diagnose

# 诊断并输出详细信息（PowerShell 通用参数）
.\dev-start.ps1 -Diagnose -Verbose
```

**服务信息**:
- 🎨 前端应用: http://localhost:3000
- 🔧 后端 API: http://127.0.0.1:38000
- 🐘 PostgreSQL: localhost:15500
- 🔴 Redis: localhost:16380

---

### 后端编译与运行（手动命令）

为减少脚本数量与文档漂移，本项目已将 `build-backend.ps1 / start-backend-compiled.ps1 / manage-go-deps.ps1` 收口移除。后端相关操作建议直接使用 Go 官方命令：

```powershell
# 开发：自动编译并运行
cd backend-go
go run ./cmd/api

# 生产/发布：编译并运行（Windows）
cd backend-go
go build -ldflags=\"-s -w\" -o app.exe ./cmd/api
.\app.exe

# 依赖：安装/整理/校验
cd backend-go
go mod download
go mod tidy
go mod verify
```

更多编译/部署细节见：`docs/backend/backend_build_guide.md`。

---

### 开发环境诊断（已合并到 dev-start.ps1）

原 `diagnose.ps1` 功能已合并到 `dev-start.ps1`，使用方式如下：

```powershell
# 仅执行诊断（不启动服务）
.\dev-start.ps1 -Diagnose

# 诊断并输出详细信息（PowerShell 通用参数）
.\dev-start.ps1 -Diagnose -Verbose
```

## 🔄 开发工作流程

### 首次启动

```powershell
# 1. 运行环境诊断（不启动服务）
.\scripts\development\dev-start.ps1 -Diagnose

# 2. 确保数据库已初始化
.\scripts\database\db-manage.ps1 start
.\scripts\database\db-init-complete.ps1

# 3. 安装/整理 Go 依赖
cd backend-go
go mod download
go mod tidy

# 4. 启动开发环境
.\scripts\development\dev-start.ps1
```

### 日常开发

```powershell
# 方式 1: 一键启动所有服务
.\scripts\development\dev-start.ps1

# 方式 2: 如果数据库已运行，只启动应用
.\scripts\development\dev-start.ps1 -Services backend
# 前端在另一个终端启动
cd frontend
pnpm dev

# 开发工作...

# 停止服务（在各自的窗口中按 Ctrl+C）
```

### 遇到问题时

```powershell
# 1. 运行诊断工具
.\scripts\development\dev-start.ps1 -Diagnose -Verbose

# 2. 检查数据库状态
.\scripts\database\db-manage.ps1 status

# 3. 查看日志
.\scripts\database\db-manage.ps1 logs

# 4. 如果需要，重启数据库
.\scripts\database\db-manage.ps1 stop
.\scripts\database\db-manage.ps1 start
```

### 依赖管理

```powershell
# 添加/更新 Go 依赖（示例）
cd backend-go
go get <package-name>@<version>
go mod tidy

# 验证依赖
go mod verify
```

## 🌐 服务访问地址

### Web 服务

| 服务 | 地址 | 说明 |
|------|------|------|
| 前端应用 | http://localhost:3000 | Next.js 开发服务器 |
| 后端 API | http://127.0.0.1:38000 | Go API 服务 |
| 健康检查 | http://127.0.0.1:38000/health | 后端健康状态 |
| API 文档 | docs/api/openapi.json | OpenAPI 规范 |
| WebSocket | ws://127.0.0.1:38000 | WebSocket 连接 |

### 数据库服务

| 服务 | 地址 | 凭据 |
|------|------|------|
| PostgreSQL | localhost:15500 | 用户: inspect_dev<br>密码: dev_password_2024<br>数据库: inspect_system_dev |
| Redis | localhost:16380 | 密码: dev_redis_2024 |
| pgAdmin | http://localhost:5050 | 数据库管理工具 |
| Redis Commander | http://localhost:8081 | Redis 管理工具 |

## 🛠️ 常用命令

### 数据库管理

```powershell
# 启动数据库
.\scripts\database\db-manage.ps1 start

# 停止数据库
.\scripts\database\db-manage.ps1 stop

# 查看状态
.\scripts\database\db-manage.ps1 status

# 查看日志
.\scripts\database\db-manage.ps1 logs

# 备份数据库
.\scripts\database\db-manage.ps1 backup
```

### 后端开发

```powershell
# 在 backend-go 目录
cd backend-go

# 方式 1: 使用 go run（开发推荐，自动编译）
go run ./cmd/api

# 方式 2: 编译后运行
# 编译
go build -o app.exe ./cmd/api

# 运行
.\app.exe

# 或直接运行
.\backend-go\app.exe

# 运行测试
go test ./...

# 格式化代码
go fmt ./...

# 代码检查
go vet ./...
```

**编译选项**:
```powershell
# 生产版本（优化，体积小）
go build -ldflags=\"-s -w\" -o app.exe ./cmd/api

# 调试版本（包含调试符号）
go build -gcflags=\"all=-N -l\" -o app-debug.exe ./cmd/api

# 交叉编译 Linux 版本
$env:GOOS=\"linux\"; $env:GOARCH=\"amd64\"; go build -o app ./cmd/api
```

### 前端开发

```powershell
# 在 frontend 目录
cd frontend

# 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build

# 运行测试
pnpm test

# 代码检查
pnpm lint
```

## 💡 开发技巧

### 热重载

- **前端**: Next.js 自动支持热重载，修改代码后自动刷新
- **后端**: 使用 `air` 工具实现热重载（可选）

### 调试

```powershell
# 后端调试（使用 Delve）
cd backend-go
dlv debug ./cmd/api

# 前端调试
# 在浏览器中使用开发者工具
```

### 日志查看

```powershell
# 后端日志
Get-Content logs\backend-go\app-dev.log -Wait

# 数据库日志
.\scripts\database\db-manage.ps1 logs
```

## 🚨 故障排查

### 后端数据库连接错误

如果遇到后端启动时的数据库连接错误：

```
failed to connect to `host=localhost user=postgres database=inspect_db`: 
dial error (dial tcp 127.0.0.1:5432: connectex: No connection could be made...)
```

**原因**: 后端服务无法读取项目根目录的 `.env` 文件，使用了默认配置（端口 5432）。

**解决方案**: 已修复，确保使用最新的 `dev-start.ps1` 脚本。脚本现在使用 `ENV_FILE` 环境变量指定配置文件路径。

**验证配置**:
```powershell
# 检查 .env 文件中的数据库配置
Get-Content .env | Select-String "DATABASE_URL"

# 应该显示:
# DATABASE_URL=postgresql://inspect_dev:dev_password_2024@localhost:15500/inspect_system_dev
```

**手动启动测试**:
```powershell
# 方式 1: 使用 ENV_FILE 环境变量（推荐）
$env:ENV_FILE = (Get-Item .env).FullName
cd backend-go
go run ./cmd/api

# 方式 2: 在 backend-go 目录创建 .env 副本
cd backend-go
Copy-Item ..\.env .env
go run ./cmd/api
```

**Go 模块错误**:
如果遇到 `cannot find main module` 错误，说明从错误的目录运行了 Go 命令。`go.mod` 文件在 `backend-go` 目录中，必须从该目录或使用正确的路径运行。

---

### 后端编译错误

如果遇到后端编译错误，例如：

```
internal\http\handlers\inspection.go:600:14: assignment mismatch: 1 variable but readInt returns 2 values
```

**原因**: `readInt` 函数返回两个值 `(int, bool)`，但代码只接收了一个值。

**解决方案**: 已修复，确保使用最新代码。如果仍有问题：

```powershell
# 1. 验证代码是否最新
git pull

# 2. 测试编译
cd backend-go
go build ./cmd/api

# 3. 如果编译失败，检查 inspection.go 第 600 行
# 应该是: deviceID, _ := readInt(req, "device_id", "deviceId")
# 而不是: deviceID := readInt(req, "device_id", "deviceId")
```

**参考文档**: [后端编译错误修复说明](../../docs/backend/backend_compile_fix.md)

---

### Docker Compose 网络错误

如果遇到 `service refers to undefined network` 错误：

```powershell
# 脚本会自动处理，使用当前推荐的开发 Compose 配置
# 如果仍有问题，可手动仅启动数据库：
docker-compose -f docker-compose.dev.yml up -d postgres redis
```

**常见原因**: 使用了旧版配置或本地仍在按“基础 + 覆盖”方式组合启动。

**解决方案**: 统一使用 `docker-compose.dev.yml`（该文件已包含完整网络定义）。

### 数据库已运行但脚本报错

```powershell
# 检查数据库状态
.\scripts\database\db-manage.ps1 status

# 脚本会自动检测并跳过已运行的数据库
# 如果需要重启数据库：
.\scripts\database\db-manage.ps1 stop
.\scripts\database\db-manage.ps1 start
```

**智能检测**: 脚本现在会自动检测 PostgreSQL 和 Redis 容器状态，如果已运行则跳过启动。

### 端口被占用

```powershell
# 查看端口占用
netstat -ano | findstr "3000 38000 15500 16380"

# 结束占用进程
taskkill /PID <进程ID> /F
```

### 服务无法启动

```powershell
# 运行全面诊断
.\scripts\development\dev-start.ps1 -Diagnose -Verbose

# 检查前置条件
docker --version
go version
node --version
pnpm --version

# 检查数据库状态
.\scripts\database\db-manage.ps1 status

# 查看详细日志
.\scripts\database\db-manage.ps1 logs
```

### 依赖问题

```powershell
# Go 依赖问题
cd backend-go
go clean -modcache
go mod download
go mod tidy

# 前端依赖问题
cd frontend
Remove-Item -Recurse -Force node_modules
pnpm install
```

### 数据库连接失败

```powershell
# 重启数据库
.\scripts\database\db-manage.ps1 stop
.\scripts\database\db-manage.ps1 start

# 检查连接
docker exec inspect-postgres-dev pg_isready -U inspect_dev
docker exec inspect-redis-dev redis-cli -a dev_redis_2024 ping
```

### Docker 未运行

```powershell
# 启动 Docker Desktop
# 然后运行诊断
.\scripts\development\dev-start.ps1 -Diagnose
```

## 📚 相关文档

- [数据库管理脚本](../database/README.md)
- [测试脚本](../tests/README.md)
- [后端快速启动指南](../../docs/backend-go-quickstart.md)
- [API 文档](../../docs/api/readme.md)
- [开发环境指南](../../docs/development/development-environment-guide.md)

## 🔗 快速链接

### 文档

- [API 参考](../../docs/api/quick_reference.md)
- [WebSocket 协议](../../docs/api/websocket-contract.md)
- [数据库快速启动](../../DATABASE_QUICK_START.md)
- [端口参考](../../docs/env/quick_port_reference.md)

### 配置文件

- 后端配置: `.env` / `.env.development`
- 前端配置: `frontend/.env.local`
- 数据库配置: `docker-compose.dev.yml`

## 💻 开发环境要求

### 必需工具

- **Docker Desktop** - 容器运行环境
- **Go 1.22+** - 后端运行时
- **Node.js 18+** - 前端运行时
- **pnpm** - 前端包管理器

### 可选工具

- **Git** - 版本控制
- **VS Code** - 推荐编辑器
- **Postman** - API 测试
- **pgAdmin** - 数据库管理
- **Redis Commander** - Redis 管理

## 📝 最佳实践

1. **使用统一启动脚本**: 优先使用 `dev-start.ps1` 启动开发环境
2. **定期更新依赖**: 使用 `go get -u ./...` 并执行 `go mod tidy` 保持依赖最新
3. **代码提交前测试**: 运行测试确保代码质量
4. **查看日志**: 遇到问题先查看日志文件
5. **保持环境整洁**: 定期清理未使用的容器和镜像

## 🔄 版本历史与改进

### v1.1.0 (2026-01-27)

**新增功能**:
- ✅ 智能数据库检测功能 - 自动检测并跳过已运行的数据库
- ✅ 诊断模式（dev-start.ps1 -Diagnose）- 全面的环境诊断

**修复问题**:
- ✅ Docker Compose 网络配置问题 - 使用单文件完整配置
- ✅ 后端启动脚本依赖问题 - 直接使用 go run
- ✅ 错误处理和回退机制 - 完善的错误处理

**改进效果**:
- ✅ 更详细的状态反馈
- ✅ 更好的用户体验
- ✅ 更快的启动速度（智能跳过）
- ✅ 完善的文档

### 核心改进说明

#### 1. Docker Compose 配置修复

**问题**: 运行时出现 `service refers to undefined network inspect_network` 错误

**原因**: 使用了旧版启动方式或本地仍在引用已删除的 `docker-compose.yml`

**解决方案**:
```powershell
# 推荐用法（单文件完整配置）
docker-compose -f docker-compose.dev.yml up -d
```

#### 2. 智能数据库检测

**功能**: 自动检测 PostgreSQL 和 Redis 容器状态

**效果**:
- 数据库已运行时自动跳过启动
- 显示清晰的运行状态
- 避免重复启动错误
- 加快启动速度

**使用示例**:
```powershell
# 数据库已运行时
PS> .\dev-start.ps1

🗄️ 启动数据库服务...
✅ 数据库服务已在运行中，跳过启动
  - PostgreSQL: inspect-postgres-dev
  - Redis: inspect-redis-dev
```

#### 3. 诊断工具

**dev-start.ps1 -Diagnose** - 全面诊断工具:
- 检查必需工具（Docker、Go、Node.js、pnpm）
- 检查 Docker 服务状态
- 检查数据库容器状态
- 检查配置文件完整性
- 检查端口占用情况
- 提供智能建议

**db-manage.ps1 status** - 快速数据库检测:
- 检查容器运行状态
- 显示容器健康状态与端口

## 📊 测试验证

### 测试场景

| 场景 | 状态 | 说明 |
|------|------|------|
| 数据库未运行时启动 | ✅ 通过 | 正确启动数据库 |
| 数据库已运行时启动 | ✅ 通过 | 智能跳过启动 |
| 只启动数据库 | ✅ 通过 | 正确处理 |
| 只启动后端 | ✅ 通过 | 包含数据库检测 |
| 只启动前端 | ✅ 通过 | 独立启动 |
| 诊断工具 | ✅ 通过 | 全面检查 |
| 错误处理 | ✅ 通过 | 友好提示 |

### 性能表现

| 脚本 | 执行时间 | 评价 |
|------|---------|------|
| db-manage.ps1 status | < 2秒 | ⚡ 优秀 |
| dev-start.ps1 -Diagnose | < 5秒 | ⚡ 优秀 |
| dev-start.ps1 (跳过) | < 3秒 | ⚡ 优秀 |

## 🎯 快速参考卡片

### 常用命令速查

```powershell
# 一键启动所有服务
.\scripts\development\dev-start.ps1

# 只启动数据库
.\scripts\development\dev-start.ps1 -Services database

# 只启动后端（含数据库）
.\scripts\development\dev-start.ps1 -Services backend

# 编译后端（手动）
cd backend-go; go build -o app.exe ./cmd/api

# 全面诊断（不启动服务）
.\scripts\development\dev-start.ps1 -Diagnose

# 快速检查数据库
.\scripts\database\db-manage.ps1 status

# 数据库管理
.\scripts\database\db-manage.ps1 start|stop|status|logs

# Go 依赖管理（手动）
cd backend-go; go mod download; go mod tidy; go mod verify
```

### 服务地址速查

| 服务 | 地址 | 凭据 |
|------|------|------|
| 前端 | http://localhost:3000 | - |
| 后端 | http://127.0.0.1:38000 | - |
| PostgreSQL | localhost:15500 | inspect_dev / dev_password_2024 |
| Redis | localhost:16380 | dev_redis_2024 |

### 故障排查速查

```powershell
# 问题 1: Docker Compose 错误
docker-compose -f docker-compose.dev.yml up -d postgres redis

# 问题 2: 数据库状态检查
.\scripts\database\db-manage.ps1 status

# 问题 3: 端口占用
netstat -ano | findstr "3000 38000 15500 16380"

# 问题 4: 全面诊断
.\scripts\development\dev-start.ps1 -Diagnose -Verbose

# 问题 5: 依赖问题
cd backend-go; go clean -modcache
cd backend-go; go mod download
cd backend-go; go mod tidy
```

## 📞 获取帮助

如遇问题：
1. 查看脚本内置帮助: `Get-Help .\script-name.ps1`
2. 查看相关文档
3. 运行健康检查: `.\dev-start.ps1 -Services database`
4. 查看日志文件

---

**最后更新**: 2026-03-12  
**维护者**: DevOps Team
