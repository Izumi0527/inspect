# 后端编译和部署指南

## 概述

本文档说明如何编译和部署 Go 后端服务，包括开发环境和生产环境的最佳实践。

## 快速开始

### 开发环境（推荐）

```powershell
# 使用 go run（自动编译并运行）
cd backend-go
go run ./cmd/api
```

**优点**:
- 无需手动编译
- 修改代码后重新运行即可
- 适合快速迭代开发

### 生产环境

```powershell
# 1. 编译生产版本（优化）
cd backend-go
go build -ldflags="-s -w" -o app.exe ./cmd/api

# 2. 运行编译后的程序（Windows）
.\app.exe
```

**优点**:
- 启动速度快
- 文件体积小
- 性能优化

## 编译方式（推荐：手动命令）

```powershell
cd backend-go

# 标准编译
go build -o app.exe ./cmd/api

# 生产版本（优化）
go build -ldflags="-s -w" -o app.exe ./cmd/api

# 调试版本
go build -gcflags="all=-N -l" -o app-debug.exe ./cmd/api

# 交叉编译 Linux
$env:GOOS="linux"; $env:GOARCH="amd64"; go build -o app ./cmd/api
```

## 编译模式对比

| 模式 | 文件大小 | 启动速度 | 调试支持 | 适用场景 |
|------|---------|---------|---------|---------|
| **release** | ~34 MB | 快 | ❌ | 生产环境 |
| **debug** | ~35 MB | 中等 | ✅ | 开发调试 |
| **dev** | ~35 MB | 中等 | 部分 | 开发测试 |

### release 模式（生产）

```powershell
cd backend-go
go build -ldflags="-s -w" -o app.exe ./cmd/api
```

**特点**:
- 去除调试信息（`-s`）
- 去除符号表（`-w`）
- 文件体积最小
- 性能最优

**编译参数**: `-ldflags="-s -w"`

### debug 模式（调试）

```powershell
cd backend-go
go build -gcflags="all=-N -l" -o app-debug.exe ./cmd/api
```

**特点**:
- 禁用优化（`-N`）
- 禁用内联（`-l`）
- 保留完整调试信息
- 便于使用 delve 调试

**编译参数**: `-gcflags="all=-N -l"`

**输出文件**: `app-debug.exe`

### dev 模式（开发）

```powershell
cd backend-go
go build -o app.exe ./cmd/api
```

**特点**:
- 标准编译
- 平衡性能和调试
- 适合日常开发

## 运行方式

### 方式 1: 直接运行

```powershell
# Windows
.\backend-go\app.exe

# Linux/macOS
./backend-go/app
```

### 方式 2: 后台运行（Windows）

```powershell
# 使用 Start-Process
Start-Process -FilePath ".\backend-go\app.exe" -WindowStyle Hidden

# 使用 nohup（Linux/macOS）
nohup ./backend-go/app > app.log 2>&1 &
```

## 交叉编译

### 编译 Linux 版本

```powershell
# 手动编译
cd backend-go
$env:GOOS="linux"; $env:GOARCH="amd64"
go build -ldflags="-s -w" -o app ./cmd/api
```

### 编译 macOS 版本

```powershell
# 手动编译
cd backend-go
$env:GOOS="darwin"; $env:GOARCH="amd64"
go build -ldflags="-s -w" -o app ./cmd/api
```

### 支持的平台

| 平台 | GOOS | GOARCH | 输出文件 |
|------|------|--------|---------|
| Windows 64位 | windows | amd64 | app.exe |
| Linux 64位 | linux | amd64 | app |
| macOS 64位 | darwin | amd64 | app |
| Linux ARM64 | linux | arm64 | app |

## 环境配置

### 配置文件位置

后端服务会按以下顺序查找配置文件：

1. 环境变量 `ENV_FILE` 指定的路径
2. 当前目录的 `.env` 文件
3. 项目根目录的 `.env` 文件

### 设置配置文件路径

```powershell
# Windows
$env:ENV_FILE = "C:\path\to\.env"
.\backend-go\app.exe

# Linux/macOS
export ENV_FILE="/path/to/.env"
./backend-go/app
```

### 必需的环境变量

```bash
# 数据库配置
DATABASE_URL=postgresql://inspect_dev:dev_password_2024@localhost:15500/inspect_system_dev

# Redis 配置
REDIS_URL=redis://:dev_redis_2024@localhost:16380/0

# JWT 配置
JWT_SECRET_KEY=your-secret-key
JWT_ALGORITHM=HS256

# 服务端口
SERVER_PORT=8000

# 日志配置
LOG_LEVEL=INFO
LOG_FILE=logs/backend-go/app.log
```

## 部署流程

### 开发环境部署

```powershell
# 1. 启动数据库
.\scripts\database\db-manage.ps1 start

# 2. 使用 go run（推荐）
cd backend-go
go run ./cmd/api

# 或编译后运行（Windows 示例）
cd backend-go
go build -o app.exe ./cmd/api
.\app.exe
```

### 生产环境部署（Windows）

```powershell
# 1. 编译生产版本
cd backend-go
go clean
go build -ldflags="-s -w" -o app.exe ./cmd/api

# 2. 复制文件到部署目录
$deployDir = "C:\deploy\inspect-backend"
New-Item -ItemType Directory -Force -Path $deployDir
Copy-Item backend-go\app.exe $deployDir\
Copy-Item .env $deployDir\

# 3. 创建 Windows 服务（可选）
# 使用 NSSM 或其他服务管理工具

# 4. 启动服务
cd $deployDir
.\app.exe
```

### 生产环境部署（Linux）

```bash
# 1. 在 Windows 上交叉编译（在 backend-go 目录）
cd backend-go
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o app ./cmd/api

# 2. 上传到 Linux 服务器
scp backend-go/app user@server:/opt/inspect-backend/
scp .env user@server:/opt/inspect-backend/

# 3. 在 Linux 服务器上
ssh user@server
cd /opt/inspect-backend
chmod +x app

# 4. 创建 systemd 服务
sudo nano /etc/systemd/system/inspect-backend.service

# 5. 启动服务
sudo systemctl start inspect-backend
sudo systemctl enable inspect-backend
```

### systemd 服务配置示例

```ini
[Unit]
Description=Inspect Backend API Service
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=inspect
WorkingDirectory=/opt/inspect-backend
Environment="ENV_FILE=/opt/inspect-backend/.env"
ExecStart=/opt/inspect-backend/app
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## Docker 部署

### Dockerfile 示例

```dockerfile
# 构建阶段
FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY backend-go/go.mod backend-go/go.sum ./
RUN go mod download

COPY backend-go/ ./
RUN go build -ldflags="-s -w" -o app ./cmd/api

# 运行阶段
FROM alpine:latest

RUN apk --no-cache add ca-certificates
WORKDIR /root/

COPY --from=builder /app/app .
COPY .env .

EXPOSE 8000
CMD ["./app"]
```

### 构建和运行

```bash
# 构建镜像
docker build -t inspect-backend:latest .

# 运行容器
docker run -d \
  --name inspect-backend \
  -p 8000:8000 \
  --env-file .env \
  inspect-backend:latest
```

## 性能优化

### 编译优化

```powershell
# 最小化文件体积
go build -ldflags="-s -w" -o app.exe ./cmd/api

# 启用所有优化
go build -ldflags="-s -w" -gcflags="-l=4" -o app.exe ./cmd/api

# 静态链接（Linux）
CGO_ENABLED=0 go build -ldflags="-s -w" -o app ./cmd/api
```

### 运行时优化

```bash
# 设置 GOMAXPROCS（CPU 核心数）
export GOMAXPROCS=4

# 设置内存限制
export GOMEMLIMIT=2GiB

# 启用性能分析
export GODEBUG=gctrace=1
```

## 健康检查

### 检查服务状态

```powershell
# 使用 curl
curl http://localhost:8000/health

# 使用 PowerShell
Invoke-WebRequest http://localhost:8000/health
```

### 健康检查响应

```json
{
  "status": "healthy",
  "version": "1.0.1",
  "timestamp": "2026-01-30T14:55:06Z",
  "database": "connected",
  "redis": "connected"
}
```

## 故障排查

### 编译失败

```powershell
# 清理缓存
go clean -modcache
go clean -cache

# 重新下载依赖
cd backend-go
go mod download
go mod tidy

# 重新编译
cd backend-go
go clean
go build -o app.exe ./cmd/api
```

### 运行时错误

```powershell
# 检查环境变量
Get-Content .env

# 检查数据库连接
.\scripts\database\db-manage.ps1 status

# 查看日志
Get-Content logs\backend-go\app.log -Tail 50

# 使用调试版本
cd backend-go
go build -gcflags="all=-N -l" -o app-debug.exe ./cmd/api
.\backend-go\app-debug.exe
```

### 端口占用

```powershell
# 查找占用端口的进程
netstat -ano | findstr :8000

# 结束进程
taskkill /PID <进程ID> /F
```

## 最佳实践

### 开发环境

1. **使用 go run**: 快速迭代，无需手动编译
2. **使用热重载**: 安装 `air` 工具实现自动重载
3. **启用调试日志**: 设置 `LOG_LEVEL=DEBUG`

### 生产环境

1. **使用 release 模式**: 最小化文件体积，优化性能
2. **使用环境变量**: 不要在代码中硬编码配置
3. **启用日志轮转**: 防止日志文件过大
4. **设置资源限制**: 限制内存和 CPU 使用
5. **配置监控**: 使用 Prometheus 等监控工具

### 安全建议

1. **不要提交 .exe 文件**: 已在 `.gitignore` 中配置
2. **保护配置文件**: 不要提交包含敏感信息的 `.env`
3. **使用强密钥**: 生产环境必须使用强随机密钥
4. **定期更新依赖**: 修复安全漏洞

## 相关文档

- [后端服务说明](../backend-go/README.md)
- [开发脚本文档](../scripts/development/README.md)
- [环境配置指南](../env/env_configuration_guide.md)
- [Docker 部署指南](../docker/compose_quick_start.md)

## 更新日志

### 2026-03-12
- 移除开发脚本封装（`build-backend.ps1`、`start-backend-compiled.ps1`），统一为 Go 官方命令示例
- 更新编译/运行/部署示例命令，避免文档引用漂移

### 2026-01-30
- 更新后端 README 文档
- 统一使用 `app.exe` 作为主程序名称
- 完善编译和部署流程文档
