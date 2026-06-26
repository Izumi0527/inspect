# 后端 Go 服务说明

## 目录结构

```
backend-go/
├── cmd/                    # 可执行程序入口
│   ├── api/               # 主 API 服务
│   ├── genhash/           # 密码哈希生成工具
│   └── migrate/           # 数据库迁移工具
├── internal/              # 内部包（不对外暴露）
│   ├── app/              # 应用初始化
│   ├── auth/             # 认证服务
│   ├── config/           # 配置管理
│   ├── db/               # 数据库连接和迁移
│   ├── http/             # HTTP 路由和处理器
│   └── ...               # 其他业务模块
├── *.exe                  # 编译后的可执行文件
├── go.mod                 # Go 模块定义
└── go.sum                 # 依赖版本锁定
```

## 可执行文件说明

后端目录下的 `.exe` 文件是 Go 编译后的可执行程序。

### app.exe
**主 API 服务程序**

- **源码**: `cmd/api/main.go`
- **功能**: 启动完整的后端 API 服务器
- **用途**: 
  - 提供 RESTful API 接口
  - 处理前端请求
  - WebSocket 实时通信
  - 设备监控和数据采集
  - 报表生成和导出
  - 巡检任务调度和执行
- **端口**: 18080（当前 Windows 本机开发示例；如当前机器无法监听该端口，可通过 `SERVER_PORT` 改成其他可用端口）
- **启动方式**:
  ```powershell
  # 直接运行编译后的程序
  .\backend-go\app.exe
  
  # 或使用 go run（开发推荐）
  cd backend-go
  go run ./cmd/api
  ```
- **健康检查**: `http://localhost:${SERVER_PORT}/health`（例如 `http://127.0.0.1:18080/health`）
- **编译时间**: 2026-01-30 14:55:06
- **文件大小**: ~34 MB

## 其他工具程序

虽然没有编译为 `.exe`，但以下工具程序也很重要：

### genhash
**密码哈希生成工具**

- **源码**: `cmd/genhash/main.go`
- **功能**: 生成 bcrypt 密码哈希
- **用途**: 为用户创建安全的密码哈希
- **使用方式**:
  ```powershell
  cd backend-go
  go run ./cmd/genhash
  ```
- **输出**: bcrypt 哈希字符串

### migrate
**数据库迁移工具**

- **源码**: `cmd/migrate/main.go`
- **功能**: 执行数据库结构迁移
- **用途**: 
  - 初始化数据库表结构
  - 更新数据库 schema
  - 应用数据库变更
- **使用方式**:
  ```powershell
  cd backend-go
  go run ./cmd/migrate
  ```

## 编译说明

### 编译主 API 服务

```powershell
# 标准编译（生产版本）
cd backend-go
go build -o app.exe ./cmd/api

# 调试版本编译（包含调试符号）
go build -gcflags="all=-N -l" -o app-debug.exe ./cmd/api

# 优化编译（减小文件体积）
go build -ldflags="-s -w" -o app.exe ./cmd/api

# 交叉编译（Linux）
GOOS=linux GOARCH=amd64 go build -o app ./cmd/api

# 交叉编译（macOS）
GOOS=darwin GOARCH=amd64 go build -o app ./cmd/api
```

### 编译参数说明

- `-o app.exe`: 指定输出文件名
- `-gcflags="all=-N -l"`: 禁用优化和内联，便于调试
- `-ldflags="-s -w"`: 去除调试信息和符号表，减小文件体积
  - `-s`: 去除符号表
  - `-w`: 去除 DWARF 调试信息

### 编译工具程序
```powershell
# 编译密码哈希工具
go build -o genhash.exe ./cmd/genhash

# 编译数据库迁移工具
go build -o migrate.exe ./cmd/migrate
```

## 开发运行

### 使用开发脚本（推荐）
```powershell
# 启动完整开发环境（数据库 + 后端 + 前端）
.\scripts\dev-start.ps1

# 仅启动后端服务
.\scripts\dev-start.ps1 -Services backend
```

### 直接运行
```powershell
# 使用 go run（自动编译并运行，开发推荐）
cd backend-go
go run ./cmd/api

# 或运行已编译的程序
.\backend-go\app.exe

# 后台运行（Windows）
Start-Process -FilePath ".\backend-go\app.exe" -WindowStyle Hidden
```

### 热重载开发
推荐使用 `air` 工具实现热重载：

```powershell
# 安装 air
go install github.com/cosmtrek/air@latest

# 在 backend-go 目录下运行
cd backend-go
air
```

## 环境配置

后端服务需要以下环境变量（在项目根目录的 `.env` 文件中配置）：

```bash
# 数据库配置
DATABASE_URL=postgresql://inspect_dev:dev_password_2024@localhost:15500/inspect_system_dev

# Redis 配置
REDIS_URL=redis://:dev_redis_2024@localhost:16380/0

# JWT 配置
JWT_SECRET_KEY=your-secret-key
JWT_ALGORITHM=HS256

# 服务端口
SERVER_PORT=18080

# 日志配置
LOG_LEVEL=DEBUG
# 相对路径按项目根目录解析，实际写入 <项目根目录>\logs\backend-go\app-dev.log
LOG_FILE=logs/backend-go/app-dev.log
```

## 清理编译产物

```powershell
# 删除所有 .exe 文件
Remove-Item backend-go\*.exe

# 或使用 go clean
cd backend-go
go clean
```

## 注意事项

1. **版本控制**: `.exe` 文件已被 `.gitignore` 忽略，不会提交到 Git
2. **开发建议**: 开发时使用 `go run` 而不是编译后运行，更方便
3. **生产部署**: 生产环境应使用优化编译的版本
4. **调试**: 需要调试时使用 `debug-api.exe` 或 `go run`
5. **清理**: 定期清理旧的编译产物，避免混淆版本

## 相关文档

- [项目详细架构文档](../docs/PROJECT_ARCHITECTURE.md)
- [API 文档](../docs/api/readme.md)
- [数据库迁移指南](../docs/datebase/database-deployment.md)
- [Docker 部署指南](../docs/docker/compose_quick_start.md)

## 故障排查

### 编译失败
```powershell
# 清理缓存并重新下载依赖
go clean -modcache
go mod download
go mod tidy
```

### 运行时错误
```powershell
# 检查环境变量
Get-Content .env

# 检查数据库连接
.\scripts\db-manage.ps1 status

# 在项目根目录查看日志
Get-Content .\logs\backend-go\app-dev.log -Tail 50
```

### 端口占用
```powershell
# 查找占用 18080 端口的进程
netstat -ano | findstr :18080

# Windows 如怀疑端口被系统保留，可查看 TCP 排除范围
netsh interface ipv4 show excludedportrange protocol=tcp

# 结束进程（替换 PID）
taskkill /PID <进程ID> /F
```
