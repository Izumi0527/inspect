# 跨平台开发环境使用指南

## 概述

本指南提供了企业级网络设备巡检系统的完整开发环境启动解决方案。支持 Windows、Linux 和 macOS 多平台开发，使用 PowerShell 和 Shell 脚本确保在各种操作系统配置下都能正常工作。

**主要特性：**
- 🖥️ **跨平台支持**：Windows PowerShell 脚本 + Linux/macOS Shell 脚本
- 🐍 **智能后端管理**：优化的 Python 虚拟环境和依赖管理
- 🧪 **统一测试框架**：完整的应用层和基础设施测试
- 🔧 **故障自愈**：环境变量冲突自动修复和依赖问题智能处理

## 🚀 快速开始

### 启动开发环境
```bash
# Shell 脚本启动（Linux/macOS/WSL）
./scripts/dev-start.sh

# Windows PowerShell 启动
# 注意：需要先启动 Docker Desktop
docker-compose -f docker-compose.dev.yml up -d
```

### 启动后端服务（推荐）
```bash
# 使用优化的后端启动脚本
.\scripts\start-backend.ps1

# Linux/macOS 环境手动启动
cd backend && python -m venv .venv && source .venv/bin/activate
pip install uv && uv pip install -r requirements.txt
uv run python -m src.main
```

## 📁 脚本文件说明

| 文件 | 类型 | 功能描述 | 推荐场景 |
|------|------|----------|----------|
| `scripts/dev-start.sh` | Shell | Linux/macOS 环境开发启动 | Unix 系统开发 |
| `scripts/dev-stop.sh` | Shell | Linux/macOS 环境停止服务 | Unix 系统停止 |
| `scripts/start-backend.ps1` | PowerShell | **Windows 后端启动脚本（增强版）** | **Windows 后端启动（推荐）** |
| `scripts/run-all-tests.ps1` | PowerShell | 统一测试管理脚本 | 测试执行和验证 |
| `scripts/db-health-check.ps1` | PowerShell | 数据库健康检查 | 基础设施监控 |
| `scripts/db-init-migrate.ps1` | PowerShell | 数据库初始化和迁移 | 数据库维护 |
| `scripts/db-query.ps1` | PowerShell | PostgreSQL 数据库查询工具 | 数据库分析和导出 |
| `scripts/test-all.sh` | Shell | Linux/macOS 测试脚本 | Unix 系统测试 |

## ⚙️ 启动参数

### start-backend.ps1 脚本参数（主要使用）
```powershell
# 基础启动参数
.\scripts\start-backend.ps1          # 开发模式启动（默认）
.\scripts\start-backend.ps1 -Prod    # 生产模式启动
.\scripts\start-backend.ps1 -Port 8001  # 自定义端口

# 环境和数据库
.\scripts\start-backend.ps1 -CleanEnv   # 清理环境变量冲突
.\scripts\start-backend.ps1 -Migrate    # 运行数据库迁移

# 依赖管理
.\scripts\start-backend.ps1 -NoDeps     # 跳过依赖安装（快速启动）
.\scripts\start-backend.ps1 -ForceDeps  # 强制重装所有依赖

# 调试和帮助
.\scripts\start-backend.ps1 -Debug      # 启用详细调试输出
.\scripts\start-backend.ps1 -Help       # 显示帮助信息
```

### Shell 脚本参数（Linux/macOS）
```bash
# 开发环境启动
./scripts/dev-start.sh               # 启动开发环境
./scripts/dev-stop.sh                # 停止开发环境

# 测试管理
./scripts/test-all.sh                # 运行所有测试
```

## 🛠️ 运行模式详解

### 1. 标准 Docker 模式
```bash
# 使用 Docker Compose 启动完整环境
docker-compose -f docker-compose.dev.yml up -d

# 或使用 Shell 脚本（Linux/macOS/WSL）
./scripts/dev-start.sh
```

**适用场景：**
- 网络连接良好
- 需要完整的容器化环境
- 首次启动项目

**启动流程：**
1. ✅ 检查 Docker 环境
2. 🔍 测试网络连通性  
3. 🔨 构建 Docker 镜像（带重试）
4. 🚀 启动所有服务
5. 📊 显示访问地址

### 2. 本地开发模式
```bash
# 只启动数据库服务，后端前端本地运行
docker-compose -f docker-compose.dev.yml up postgres redis influxdb -d

# 或者启动完整环境后手动运行后端
.\scripts\start-backend.ps1
```

**适用场景：**
- 网络受限环境
- Docker 构建失败
- 快速开发调试

### 启动后端（新终端）

#### 方式 1：使用专用启动脚本（推荐）
```bash
# 开发模式启动（默认，带热重载）
.\scripts\start-backend.ps1

# 常用组合示例（完整参数说明见"启动参数"章节）
.\scripts\start-backend.ps1 -CleanEnv -ForceDeps -Migrate -Debug
```

**start-backend.ps1 脚本优势：**
- 🐍 **智能环境管理**：自动创建/激活虚拟环境
- 📦 **高效依赖安装**：使用uv进行包管理，智能检查避免重复安装
- 🔧 **环境变量优化**：自动清理冲突变量（解决 CORS_ORIGINS 等问题）
- 🗃️ **数据库集成**：可选自动迁移
- 📋 **详细日志**：完整的启动过程反馈
- ⚡ **性能优化**：进度显示、智能缓存、并发安装
- 🛡️ **错误处理**：参数冲突检查、故障自动修复建议

#### 方式 2：传统手动启动
```bash
# 手动启动后端服务
cd backend
python -m venv .venv

# 激活虚拟环境（根据操作系统选择）
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux/macOS

pip install uv
uv pip install -r requirements.txt
uv run python -m src.main
```

### 启动前端（新终端）
```bash
cd frontend  
pnpm install
pnpm dev
```

### 3. 预构建镜像模式
```bash
# 使用预构建镜像，跳过构建过程
docker-compose -f docker-compose.dev.yml pull
docker-compose -f docker-compose.dev.yml up -d
```

**适用场景：**
- 镜像源配置但构建仍有问题
- 需要快速启动
- CI/CD 环境

## 🔧 故障排查

### 问题 1：PowerShell 执行策略限制
```
错误：无法加载文件 start-backend.ps1，因为在此系统上禁止运行脚本。
```

**解决方案：**
1. **手动设置执行策略（推荐）**：
   ```powershell
   # 临时设置（当前会话）
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
   
   # 永久设置（需管理员权限）
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

2. **绕过执行策略**：
   ```powershell
   # 一次性绕过执行策略
   powershell -ExecutionPolicy Bypass -File .\scripts\start-backend.ps1
   ```

### 问题 2：Docker Desktop 未运行
```
错误：Docker 守护进程未响应
```

**解决方案：**
1. **自动启动**：脚本会尝试自动启动 Docker Desktop
2. **手动启动**：从开始菜单启动 Docker Desktop
3. **检查安装**：确保 Docker Desktop 已正确安装

### 问题 3：端口冲突
```
错误：Port 5433 is already in use
```

**解决方案：**
```bash
# 强制停止 Docker 服务
docker-compose -f docker-compose.dev.yml down

# 检查端口占用
netstat -an | findstr "5433 8001 3000"

# 杀死占用进程
taskkill /F /PID <进程ID>

# 或者使用 PowerShell 查找并终止进程
Get-NetTCPConnection -LocalPort 5433 | Select-Object OwningProcess
Stop-Process -Id <进程ID> -Force
```

### 问题 4：网络连接问题
```
错误：failed to do request: Head "https://registry-1.docker.io/"
```

**解决方案：**
1. **配置镜像加速器**：参考 `docs/docker-mirror-config.md`
2. **使用本地模式**：
   ```bash
   # 只启动数据库服务，手动运行后端
   docker-compose -f docker-compose.dev.yml up postgres redis influxdb -d
   .\scripts\start-backend.ps1
   ```

#### 问题 5：前端 Tailwind CSS v4 配置问题
```
错误：It looks like you're trying to use `tailwindcss` directly as a PostCSS plugin.
```

**原因分析：**
- Tailwind CSS v4 将 PostCSS 插件拆分到独立包 @tailwindcss/postcss
- postcss.config.js 仍使用 v3 的配置方式
- Next.js 15.5.0 与 Tailwind CSS v4.1.13 需要正确配置

**解决方案：**
1. **安装必要依赖**：
   ```bash
   pnpm add -D @tailwindcss/postcss
   ```

2. **更新 PostCSS 配置**：
   ```javascript
   // postcss.config.js
   const config = {
     plugins: {
       '@tailwindcss/postcss': {},  // 替代 tailwindcss: {}
       autoprefixer: {},
     },
   }
   ```

3. **验证版本兼容性**：
   - Next.js 15.5.0 ✓
   - Tailwind CSS 4.1.13 ✓
   - @tailwindcss/postcss 4.1.13 ✓

## 问题 6：CORS_ORIGINS 配置错误
```
错误：error parsing value for field "CORS_ORIGINS" from source "EnvSettingsSource"
或：JSONDecodeError: Expecting value: line 1 column 1 (char 0)
```

**原因分析：**
- PowerShell 会话中存在空的 CORS_ORIGINS 环境变量
- 环境变量优先级高于 .env 文件，空值覆盖了正确配置
- pydantic-settings 对 List[str] 类型自动进行 JSON 解析失败

**解决方案：**
1. **使用专用启动脚本（推荐）**：
   ```bash
   # 自动清理环境变量并启动
   .\scripts\start-backend.ps1 -CleanEnv
   
   # 或组合使用，同时强制重装依赖
   .\scripts\start-backend.ps1 -CleanEnv -ForceDeps -Debug
   ```

2. **手动清理环境变量**：
   ```powershell
   # PowerShell 中执行
   Remove-Item Env:CORS_ORIGINS -ErrorAction SilentlyContinue
   
   # 然后启动后端
   .\scripts\start-backend.ps1
   ```

3. **重启 PowerShell 会话**：
   - 关闭当前 PowerShell 窗口
   - 重新打开新的 PowerShell 窗口

### 问题 7：权限不足
```
错误：Access denied 或需要管理员权限
```

**解决方案：**
1. **以管理员身份运行**：右键选择"以管理员身份运行"
2. **使用 UAC 提升**：脚本会自动提示提升权限

### 问题 8：依赖安装问题
```
错误：pip install 失败，网络超时，或包冲突
```

**解决方案：**
1. **强制重新安装依赖（推荐）**：
   ```bash
   # 强制重装所有依赖包
   .\scripts\start-backend.ps1 -ForceDeps -Debug
   ```

2. **跳过依赖安装快速启动**：
   ```bash
   # 如果依赖已安装，跳过安装步骤
   .\scripts\start-backend.ps1 -NoDeps
   ```

3. **组合解决方案**：
   ```bash
   # 清理环境+强制重装+调试模式
   .\scripts\start-backend.ps1 -CleanEnv -ForceDeps -Debug
   ```

4. **检查网络和权限**：
   - 确保网络连接正常
   - 尝试以管理员权限运行
   - 检查防火墙和代理设置

## 🎯 高级用法

### 1. 自定义配置
```bash
# 修改环境变量（.env.dev 会自动创建）
# 可以手动编辑添加自定义配置
```

### 2. 多环境支持
```bash
# 开发环境
./scripts/dev-start.sh

# 测试环境（如果有 docker-compose.test.yml）
docker-compose -f docker-compose.test.yml up -d
```

### 3. 性能优化
```bash
# 清理 Docker 缓存
docker system prune -a

# 使用 SSD 提升构建速度
# 在 Docker Desktop 设置中启用 WSL 2 引擎
```

### 4. 调试模式
```bash
# 启动并查看实时日志
docker-compose -f docker-compose.dev.yml up

# 查看特定服务日志
docker-compose -f docker-compose.dev.yml logs -f backend-dev

# 后端调试模式
.\scripts\start-backend.ps1 -Debug
```

### 5. 数据库管理

#### 数据库初始化和迁移

项目提供了强大的数据库管理脚本 `db-init-migrate.ps1`，支持 PostgreSQL、Redis、InfluxDB 三种数据库的完整管理。**新增数据验证功能**，迁移完成后自动验证数据状态并提供详细报告。

##### 基础操作
```powershell
# 显示帮助信息
.\scripts\db-init-migrate.ps1 -Help

# 初始化所有数据库（包含测试设备数据）
.\scripts\db-init-migrate.ps1 -Init

# 初始化数据库但跳过测试设备数据（推荐）
.\scripts\db-init-migrate.ps1 -Init -SkipTestDevices

# 运行数据库迁移到最新版本
.\scripts\db-init-migrate.ps1 -Migrate

# 运行迁移但跳过测试设备数据迁移
.\scripts\db-init-migrate.ps1 -Migrate -SkipTestDevices

# 创建新的迁移文件
.\scripts\db-init-migrate.ps1 -CreateMigration "添加新字段"

# 显示当前迁移状态
.\scripts\db-init-migrate.ps1 -Status
```

##### 🆕 自动数据验证功能

迁移完成后，脚本会自动验证数据状态并显示详细报告：

```
📊 数据库迁移验证报告
========================
管理员用户 (admin): ✅ 存在
用户总数: 1
角色数量: 3
权限数量: 22
测试设备数量: 0 (✅ 正确跳过)
当前迁移版本: 008_create_user_roles_table

🔐 默认登录信息:
   用户名: admin
   密码: Admin123!
   邮箱: admin@inspect.local
```

**验证报告说明：**
- **✅ 正确跳过**：使用 `-SkipTestDevices` 参数时，设备数量为0表示成功跳过测试设备数据
- **✅ 完整导入**：不使用 `-SkipTestDevices` 时，设备数量为14表示完整导入测试设备
- **⚠️ 可能有遗留数据**：数量异常，可能需要手动清理数据库
- **❌ 缺失**：关键数据缺失，需要检查迁移过程

##### 高级功能
```powershell
# 导入数据选项
.\scripts\db-init-migrate.ps1 -ImportData          # 导入初始数据和测试数据

# 备份和恢复
.\scripts\db-init-migrate.ps1 -Backup              # 备份所有数据库
.\scripts\db-init-migrate.ps1 -Restore             # 恢复数据库

# 健康检查和清理
.\scripts\db-init-migrate.ps1 -HealthCheck         # 运行健康检查
.\scripts\db-init-migrate.ps1 -Clean               # 清理并重置数据库
```

##### ⭐ SkipTestDevices 参数说明

**用途**：控制是否跳过测试设备数据的迁移（009_insert_test_devices.py）

**适用场景**：
- 🏗️ **生产环境部署**：避免导入测试设备数据干扰生产环境
- 🧹 **干净的开发环境**：专注功能开发，无测试数据噪音
- 🔧 **团队协作**：统一的数据库初始状态
- 🐛 **故障排查**：消除设备连接错误日志

**使用对比**：
```powershell
# 标准初始化（包含14个测试设备）
.\scripts\db-init-migrate.ps1 -Init
# 结果：✅ admin用户 + ✅ 完整表结构 + ✅ 14个测试设备

# 精简初始化（仅基础数据）
.\scripts\db-init-migrate.ps1 -Init -SkipTestDevices
# 结果：✅ admin用户 + ✅ 完整表结构 + ❌ 无测试设备干扰

# 迁移到指定版本
.\scripts\db-init-migrate.ps1 -Migrate -SkipTestDevices
# 结果：迁移到 008_create_user_roles_table，跳过 009_insert_test_devices
```

**技术实现**：
- 使用 `alembic upgrade 008_create_user_roles_table` 替代 `alembic upgrade head`
- 保留完整的表结构和用户权限系统
- 跳过 009_insert_test_devices.py 中的设备组和测试设备数据

#### 数据库查询工具

使用专用的查询脚本快速分析数据库内容：

```powershell
# 查询所有表的概览信息
.\scripts\db-query.ps1

# 查询特定表的详细信息
.\scripts\db-query.ps1 -Table users -Limit 20

# 只显示表结构，不显示数据
.\scripts\db-query.ps1 -ShowSchema

# 导出为不同格式
.\scripts\db-query.ps1 -Format CSV -Output "database_report.csv"
.\scripts\db-query.ps1 -Format JSON -Output "database_report.json"
.\scripts\db-query.ps1 -Format HTML -Output "database_report.html"

# 执行自定义SQL查询
.\scripts\db-query.ps1 -CustomSQL "SELECT COUNT(*) FROM users WHERE is_active = true"

# 查询包含特定模式的表
.\scripts\db-query.ps1 -Pattern "*device*"
```

#### 数据库初始化和重置

当您需要完全清洁的开发环境时，可以使用以下数据库重置方案：

##### 方案A：保留表结构，只清理数据（推荐）
```bash
# 1. 回滚到只有基础数据的状态
cd backend && uv run alembic downgrade 002_insert_default_data

# 2. 重新应用基础数据（包含admin用户）
uv run alembic upgrade 002_insert_default_data

# 3. 应用所有表结构（但跳过测试设备数据）
uv run alembic upgrade 008_create_user_roles_table

# 或者使用脚本一键完成（推荐）
.\scripts\db-init-migrate.ps1 -Migrate -SkipTestDevices

# 结果：✅ admin用户 + ✅ 完整表结构 + ❌ 无测试设备干扰
```

##### 方案B：完全重建数据库（最彻底）
```bash
# 1. 完全清空数据库
cd backend && uv run alembic downgrade base

# 2. 重新创建所有表和基础数据（跳过测试设备）
.\scripts\db-init-migrate.ps1 -Init -SkipTestDevices

# 3. 清除Redis缓存（可选但推荐）
uv run python -c "
import redis
redis_client = redis.from_url('redis://:dev_redis_2024@localhost:6380')
redis_client.flushall()
print('Redis缓存已完全清理')
redis_client.close()
"

# 结果：✅ admin用户 + ✅ 清洁的数据库 + ❌ 无任何测试数据
```

#### 保留的登录信息
```
用户名：admin
密码：Admin123!
邮箱：admin@inspect.local
角色：系统管理员（拥有所有权限）
```

#### 应用场景
- **方案A适用**：需要快速清理测试数据，保留业务表结构
- **方案B适用**：需要完全清洁的环境，或数据损坏需要重建
- **开发调试**：消除设备连接错误日志，专注功能开发
- **团队协作**：统一的数据库初始状态

#### 验证命令
```bash
# 验证数据库状态
cd backend && uv run python -c "
from sqlalchemy import create_engine, text
engine = create_engine('postgresql://inspect_dev:dev_password_2024@localhost:5433/inspect_system_dev')
with engine.connect() as conn:
    user_count = conn.execute(text('SELECT COUNT(*) FROM users')).scalar()
    device_count = conn.execute(text('SELECT COUNT(*) FROM devices')).scalar()
    print(f'用户数: {user_count}, 设备数: {device_count}')
"

# 预期结果：用户数: 1, 设备数: 0
```

#### ⚠️ 重要注意事项
- **数据备份**：重置前请备份重要数据（如有）
- **服务停止**：重置前必须停止后端服务（Ctrl+C）
- **缓存清理**：建议同时清理Redis缓存避免数据不一致
- **团队同步**：团队开发时请协调数据库重置时间
- **权限丢失**：方案B会重置所有自定义用户和权限配置

## 📋 服务端口映射

| 服务 | 端口 | 访问地址 | 用途 |
|------|------|----------|------|
| 前端应用 | 3000 | http://localhost:3000 | React 应用 |
| 后端 API | 8001 | http://localhost:8001 | FastAPI 服务 |
| API 文档 | 8001 | http://localhost:8001/docs | Swagger UI |
| PostgreSQL | 5433 | localhost:5433 | 主数据库 |
| Redis | 6380 | localhost:6380 | 缓存服务 |
| InfluxDB | 8087 | http://localhost:8087 | 时序数据库 |

## 🔐 默认认证信息

```env
# 系统管理员账户（数据库重置后可用）
Admin Username: admin
Admin Password: Admin123!
Admin Email: admin@inspect.local
Admin Role: 系统管理员（拥有所有权限）

# PostgreSQL
Host: localhost:5433
Database: inspect_system_dev
Username: inspect_dev  
Password: dev_password_2024

# Redis
Host: localhost:6380
Password: dev_redis_2024

# InfluxDB
URL: http://localhost:8087
Username: dev_admin
Password: dev_admin_2024
Organization: inspect_dev
Token: dev_token_2024
```

## 🎨 Windows 特色功能

### 1. ANSI 颜色支持
- Windows 10+ 自动启用彩色输出
- 旧版本 Windows 自动禁用颜色

### 2. 智能进程管理
- 自动检测并停止前端开发进程
- 支持强制停止所有相关进程

### 3. 系统集成
- 支持双击运行
- 自动检测管理员权限
- 集成 Windows 错误报告

### 4. 兼容性保障
- 支持 PowerShell 5.1 到 PowerShell 7
- 兼容 Windows 7 到 Windows 11
- 自动回退到兼容模式

## 📊 性能建议

### 1. 系统要求
- **最低配置**：8GB RAM, 50GB 可用空间
- **推荐配置**：16GB+ RAM, SSD 硬盘
- **操作系统**：Windows 10 1903+ 或 Windows 11

### 2. Docker 优化
```json
// Docker Desktop 设置建议
{
  "memory": 4096,        // 4GB 内存
  "cpus": 4,             // 4 核 CPU
  "disk": {
    "size": 64          // 64GB 磁盘空间
  },
  "wsl": {
    "engine": "wsl2"    // 使用 WSL 2 引擎
  }
}
```

### 3. Windows Defender 排除
建议将项目目录添加到 Windows Defender 排除列表：
```
C:\coder\Inspect\
```

## 📝 日志管理

### 🆕 统一日志系统架构

项目已实现**端到端日志追踪系统**，提供前后端交互的完整可见性：

**核心特性：**
- 🔍 **前后端关联**：通过请求ID实现端到端追踪
- 📊 **实时监控**：支持实时日志跟踪和多维度筛选
- 🎯 **智能路由**：同时输出到控制台和文件，支持日志轮转
- 🛠️ **强大工具**：专用查看脚本和测试验证工具

### 日志目录结构
```
logs\
├── backend\          # 后端日志（统一路径）
│   ├── app.log      # 主要应用日志
│   └── app.log.1    # 轮转备份日志
├── frontend\         # 前端日志
│   └── app.log      # 前端应用日志
├── database\         # 数据库日志
│   └── init-migrate.log
└── nginx\           # Nginx 日志（如果使用）
```

### 🚀 快速使用

#### 1. 启动服务（现在会显示所有交互日志）
```powershell
# 启动后端服务 - 现在会在控制台显示所有API交互
.\scripts\start-backend.ps1

# 启动前端服务（新终端）
cd frontend && pnpm dev
```

#### 2. 实时查看日志
```powershell
# 实时查看所有服务日志（推荐）
.\scripts\view-logs.ps1 -Follow

# 查看最近50条后端日志
.\scripts\view-logs.ps1 -Service backend

# 只查看错误日志
.\scripts\view-logs.ps1 -Level error

# 搜索包含"API"的日志
.\scripts\view-logs.ps1 -Filter "API"

# 按请求ID追踪特定请求链路
.\scripts\view-logs.ps1 -RequestId "req_12345"
```

### 📋 日志查看脚本详细功能

#### 基础查看功能
```powershell
# 显示帮助信息
.\scripts\view-logs.ps1 -Help

# 查看不同服务的日志
.\scripts\view-logs.ps1 -Service backend    # 后端日志
.\scripts\view-logs.ps1 -Service frontend   # 前端日志
.\scripts\view-logs.ps1 -Service database   # 数据库日志
.\scripts\view-logs.ps1 -Service all        # 所有服务日志（默认）
```

#### 高级筛选功能
```powershell
# 按日志级别筛选
.\scripts\view-logs.ps1 -Level debug        # 调试信息
.\scripts\view-logs.ps1 -Level info         # 一般信息
.\scripts\view-logs.ps1 -Level warn         # 警告信息
.\scripts\view-logs.ps1 -Level error        # 错误信息

# 按时间范围筛选
.\scripts\view-logs.ps1 -Since "2025-01-01 10:00:00"
.\scripts\view-logs.ps1 -Until "2025-01-01 18:00:00"

# 组合筛选
.\scripts\view-logs.ps1 -Service backend -Level error -Filter "database"
```

#### 实时跟踪和统计
```powershell
# 实时跟踪模式（类似 tail -f）
.\scripts\view-logs.ps1 -Follow

# 显示日志统计信息
.\scripts\view-logs.ps1 -Stats

# 指定显示行数
.\scripts\view-logs.ps1 -Tail 100
```

#### 日志导出功能
```powershell
# 导出日志到文件
.\scripts\view-logs.ps1 -Export

# 指定导出路径
.\scripts\view-logs.ps1 -Export -ExportPath "logs_backup.txt"

# 导出特定筛选结果
.\scripts\view-logs.ps1 -Service backend -Level error -Export
```

### 🔍 请求追踪系统

#### 前后端关联追踪
系统自动为每个API请求生成唯一ID，实现端到端追踪：

```powershell
# 追踪特定请求的完整链路
.\scripts\view-logs.ps1 -RequestId "req_1704067200_abc123"

# 查看包含请求ID的所有相关日志
.\scripts\view-logs.ps1 -Filter "req_1704067200_abc123"
```

#### 请求ID格式
```
格式：req_{timestamp}_{uuid}
示例：req_1704067200_abc123def456
```

#### 日志关联示例
```
# 前端发起请求
[10:30:15] [前端] [INFO] [http_interceptor] 🚀 发起API请求 - method: GET, url: /api/v1/dashboard/overview, requestId: req_1704067200_abc123

# 后端接收处理
[10:30:15] [后端] [INFO] [request_tracking] HTTP request started - method: GET, url: /api/v1/dashboard/overview, requestId: req_1704067200_abc123

# 后端响应完成
[10:30:15] [后端] [INFO] [request_tracking] HTTP request completed - method: GET, status_code: 200, process_time: 0.0124, requestId: req_1704067200_abc123
```

### 🧪 日志功能验证

#### 自动化测试脚本
```powershell
# 运行完整的日志功能测试
.\scripts\test-logs.ps1 -Comprehensive

# 快速基础功能测试
.\scripts\test-logs.ps1 -Quick

# 自定义测试参数
.\scripts\test-logs.ps1 -TestRequests 10 -Verbose
```

#### 测试内容
- ✅ 服务可用性检查
- ✅ 日志目录结构验证
- ✅ API请求和响应记录
- ✅ 请求ID追踪功能
- ✅ 日志查看脚本功能
- ✅ 性能压力测试（全面模式）

### 🛠️ 故障排查

#### 常见问题和解决方案

##### 问题1：看不到前后端交互日志
```
现象：启动服务后控制台没有显示API请求日志
```
**解决方案：**
```powershell
# 1. 确保使用更新的启动脚本
.\scripts\start-backend.ps1

# 2. 检查日志配置
.\scripts\test-logs.ps1 -Quick

# 3. 手动检查日志文件
.\scripts\view-logs.ps1 -Service backend -Tail 20
```

##### 问题2：请求ID追踪不工作
```
现象：日志中看不到统一的请求ID
```
**解决方案：**
```powershell
# 1. 验证追踪系统
.\scripts\test-logs.ps1 -TestRequests 5

# 2. 检查前端拦截器状态
# 在浏览器控制台查看是否有拦截器初始化日志

# 3. 手动测试请求ID传递
curl -H "X-Request-ID: test123" http://localhost:8000/health
```

##### 问题3：日志文件过大
```
现象：日志文件占用大量磁盘空间
```
**解决方案：**
```powershell
# 系统已配置自动日志轮转（100MB切分）
# 查看当前日志文件大小
.\scripts\view-logs.ps1 -Stats

# 手动清理旧日志（谨慎操作）
# Remove-Item logs\backend\*.log.* -Confirm
```

#### 日志级别调试
```powershell
# 提高日志详细程度
$env:LOG_LEVEL = "DEBUG"
.\scripts\start-backend.ps1

# 恢复正常日志级别
$env:LOG_LEVEL = "INFO"
.\scripts\start-backend.ps1
```

### 📊 日志监控最佳实践

#### 1. 开发阶段
```powershell
# 启动开发环境
.\scripts\start-backend.ps1

# 在另一个终端实时监控
.\scripts\view-logs.ps1 -Follow -Service backend

# 测试功能时查看特定请求
.\scripts\view-logs.ps1 -RequestId "具体的请求ID"
```

#### 2. 问题调试
```powershell
# 查看错误日志
.\scripts\view-logs.ps1 -Level error

# 搜索特定错误
.\scripts\view-logs.ps1 -Filter "Exception"

# 查看API调用链路
.\scripts\view-logs.ps1 -Filter "HTTP request"
```

#### 3. 性能分析
```powershell
# 查看响应时间统计
.\scripts\view-logs.ps1 -Filter "process_time" -Stats

# 导出性能数据分析
.\scripts\view-logs.ps1 -Filter "process_time" -Export -ExportPath "performance_logs.txt"
```

### 💡 新功能亮点

1. **🔍 端到端可见性**：从前端点击到后端响应的完整链路追踪
2. **📊 实时监控**：支持实时日志跟踪，立即看到交互情况
3. **🎯 智能筛选**：按服务、级别、关键词、请求ID等多维度筛选
4. **🛠️ 强大工具**：专用查看和测试脚本，提升调试效率
5. **🔄 自动轮转**：日志文件自动切分，避免磁盘空间问题

### ⚡ 性能优化

日志系统已针对性能进行优化：
- **异步写入**：不阻塞主要业务流程
- **智能缓存**：避免重复的文件操作
- **条件输出**：健康检查等高频请求使用DEBUG级别
- **轮转机制**：自动管理日志文件大小

现在您可以享受完整的日志可见性，轻松追踪和诊断前后端交互问题！🎉

## 🚨 常见错误代码

| 错误代码 | 含义 | 解决方案 |
|----------|------|----------|
| 1 | 项目目录错误 | 在项目根目录运行 |
| 2 | Docker 未安装 | 安装 Docker Desktop |
| 3 | 权限不足 | 以管理员身份运行 |
| 4 | 端口冲突 | 使用 --force 停止冲突服务 |
| 5 | 网络连接失败 | 配置镜像加速器或使用 --local |

## 🔄 更新和维护

### 脚本更新
```bash
# 获取最新脚本
git pull origin main

# 重新设置执行权限（如需要）
# PowerShell 中运行：
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
```

### 依赖更新
```bash
# 更新前端依赖
cd frontend
pnpm update

# 更新后端依赖
cd backend  
uv pip install --upgrade -r requirements.txt
```

### 镜像更新
```bash
# 强制重建所有镜像
.\dev-start.bat --clean
```

## 🧪 测试管理

### 统一测试调度脚本

项目提供了统一的测试管理工具，支持应用层测试和基础设施层健康检查：

#### 快速测试
```bash
# 运行完整测试套件（推荐）
.\scripts\run-all-tests.ps1 -Full

# 运行应用层集成测试
.\scripts\run-all-tests.ps1 -AppLayer

# 运行基础设施健康检查
.\scripts\run-all-tests.ps1 -Infrastructure
```

#### 单项测试
```bash
# 仅测试数据库连接
.\scripts\run-all-tests.ps1 -DatabaseOnly

# 仅测试Redis缓存
.\scripts\run-all-tests.ps1 -RedisOnly

# 仅测试InfluxDB时序数据库
.\scripts\run-all-tests.ps1 -InfluxDBOnly

# 仅测试告警升级功能
.\scripts\run-all-tests.ps1 -EscalationOnly

# 仅测试WebSocket实时通信
.\scripts\run-all-tests.ps1 -WebSocketOnly

# 仅测试API服务基础功能
.\scripts\run-all-tests.ps1 -APIOnly
```

#### 高级选项
```bash
# 并行执行测试（提高速度）
.\scripts\run-all-tests.ps1 -AppLayer -Parallel

# 详细输出模式（调试用）
.\scripts\run-all-tests.ps1 -Full -Verbose

# 显示帮助信息
.\scripts\run-all-tests.ps1 -Help
```

### 测试层级说明

| 测试类型 | 文件位置 | 测试范围 | 适用场景 |
|---------|---------|----------|----------|
| **📋 应用层测试** | `backend/tests/` | 业务逻辑、ORM、缓存服务 | 开发调试、CI/CD |
| **🔧 基础设施检查** | `scripts/db-health-check.ps1` | 容器状态、端口连通性 | 生产监控、运维 |

#### 应用层测试详解
- **test_db.py**: 数据库连接和 SQLAlchemy ORM 测试
- **test_redis_cache.py**: Redis 缓存服务、JWT黑名单、用户设备缓存测试
- **test_influxdb.py**: InfluxDB 时序数据库集成功能测试
- **test_escalation.py**: 告警升级机制测试，验证告警升级服务核心功能
- **test_websocket.py**: WebSocket实时通信功能测试，包括连接、心跳、房间订阅
- **test_main.py**: 简化的API服务测试，验证基础API接口和数据库连接

#### 基础设施检查详解
- Docker 容器运行状态检查
- PostgreSQL/Redis/InfluxDB 连通性测试
- 数据库版本信息和资源使用统计
- 端口可访问性验证

### 测试最佳实践

#### 1. 开发阶段测试流程
```bash
# 启动开发环境
docker-compose -f docker-compose.dev.yml up -d

# 运行应用层测试验证功能
.\scripts\run-all-tests.ps1 -AppLayer

# 代码修改后重新测试
.\scripts\run-all-tests.ps1 -DatabaseOnly  # 快速验证数据库相关修改
.\scripts\run-all-tests.ps1 -EscalationOnly  # 验证告警升级功能修改
.\scripts\run-all-tests.ps1 -WebSocketOnly   # 验证WebSocket通信修改
```

#### 2. 生产部署前检查
```bash
# 运行完整测试套件
.\scripts\run-all-tests.ps1 -Full -Verbose

# 检查基础设施健康状态
.\scripts\run-all-tests.ps1 -Infrastructure
```

#### 3. 故障诊断流程
```bash
# 1. 快速系统健康检查
.\scripts\run-all-tests.ps1 -Infrastructure

# 2. 针对性功能测试
.\scripts\run-all-tests.ps1 -RedisOnly       # Redis问题排查
.\scripts\run-all-tests.ps1 -DatabaseOnly   # 数据库问题排查
.\scripts\run-all-tests.ps1 -WebSocketOnly  # WebSocket通信问题排查
.\scripts\run-all-tests.ps1 -EscalationOnly # 告警升级问题排查

# 3. 详细诊断
.\scripts\run-all-tests.ps1 -AppLayer -Verbose
```

#### 4. 数据库重置流程
```bash
# 当遇到数据污染或需要清洁环境时
# 1. 停止后端服务（Ctrl+C）

# 2. 数据库重置（详细方案参考"数据库管理"章节）
# 快速重置（保留表结构）- 推荐使用脚本
.\scripts\db-init-migrate.ps1 -Migrate -SkipTestDevices

# 或手动执行
cd backend && uv run alembic downgrade 002_insert_default_data
uv run alembic upgrade 008_create_user_roles_table

# 3. 清理缓存
uv run python -c "import redis; redis.from_url('redis://:dev_redis_2024@localhost:6380').flushall()"

# 4. 重新启动服务
.\scripts\start-backend.ps1 -Debug

# 5. 使用 admin/Admin123! 登录验证
```

### 测试结果解读

#### 成功输出示例
```
🚀 企业级网络设备巡检系统 - 统一测试调度
================================================

[步骤] 检查测试环境依赖...
[成功] 环境依赖检查通过
[步骤] 运行Python应用层测试...
[成功] test_db.py 测试通过
[成功] test_redis_cache.py 测试通过
[成功] test_influxdb.py 测试通过
[成功] test_escalation.py 测试通过
[成功] test_websocket.py 测试通过
[成功] test_main.py 测试通过
[步骤] 运行基础设施健康检查...
[成功] 基础设施健康检查通过

====== 测试结果汇总 ======
执行时间: 01:23.45
总测试数: 6
通过: 6
失败: 0

🎉 所有测试都通过了！
```

#### 故障排查
如果测试失败，脚本会提供详细的错误信息和建议解决方案：

1. **环境依赖问题**: 检查 Python、uv、Docker 是否正确安装
2. **数据库连接失败**: 验证数据库服务是否启动，端口是否冲突
3. **权限问题**: 确保以适当权限运行脚本

## 💡 最佳实践

### 1. 开发工作流
```bash
# 每日启动
docker-compose -f docker-compose.dev.yml up -d

# 数据库初始化（推荐跳过测试设备数据，现在有自动验证报告）
.\scripts\db-init-migrate.ps1 -Init -SkipTestDevices

# 启动后端服务（新终端）- 推荐使用智能启动脚本
.\scripts\start-backend.ps1

# 首次启动或遇到依赖问题时
.\scripts\start-backend.ps1 -ForceDeps -CleanEnv -Debug

# 快速启动（依赖已安装）
.\scripts\start-backend.ps1 -NoDeps

# 运行测试验证环境
.\scripts\run-all-tests.ps1 -Infrastructure

# 开发完成后测试
.\scripts\run-all-tests.ps1 -AppLayer

# 停止开发环境
docker-compose -f docker-compose.dev.yml down

# 遇到问题时的完整重置流程
docker-compose -f docker-compose.dev.yml down
docker system prune -f
./scripts/dev-start.sh  # Linux/macOS
# 或 docker-compose -f docker-compose.dev.yml up -d  # Windows
.\scripts\start-backend.ps1 -CleanEnv -ForceDeps -Debug
```

#### 🆕 数据验证最佳实践

使用新的自动验证功能确保数据库状态正确：

```bash
# 迁移后自动验证（推荐方式）
.\scripts\db-init-migrate.ps1 -Migrate -SkipTestDevices
# 迁移完成后会自动显示验证报告，包括：
# - ✅ 管理员用户状态
# - 📊 数据统计（用户、角色、权限、设备数量）
# - 🏷️ 当前迁移版本
# - 🔐 登录信息提示

# 验证数据状态正确后，使用 db-query.ps1 进一步检查
.\scripts\db-query.ps1 -Table users
# 应该看到 1 个管理员用户

.\scripts\db-query.ps1 -ShowStats
# 查看所有表的统计信息
```

#### 故障排查与数据验证

```bash
# 当验证报告显示异常时的处理步骤：

# 1. 如果显示 "❌ 缺失" 管理员用户
.\scripts\db-init-migrate.ps1 -Migrate  # 重新运行迁移

# 2. 如果显示 "⚠️ 可能有遗留数据"（设备数量异常）
.\scripts\db-query.ps1 -CustomSQL "SELECT COUNT(*) FROM devices"
# 根据结果决定是否需要清理数据

# 3. 如果权限数量不是 22 个，可能需要重新初始化
.\scripts\db-init-migrate.ps1 -Init -SkipTestDevices

# 4. 使用详细查询工具验证具体数据
.\scripts\db-query.ps1 -Format JSON -Output "database_status.json"
```

### 2. 团队协作
- 确保所有团队成员使用相同的脚本版本
- 共享 `.env.dev` 配置（移除敏感信息）
- 统一 Docker 镜像版本

### 3. 备份和恢复
```bash
# 备份数据库（如需要）
docker exec inspect-postgres-dev pg_dump -U inspect_dev inspect_system_dev > backup.sql

# 恢复数据库
docker exec -i inspect-postgres-dev psql -U inspect_dev inspect_system_dev < backup.sql
```

## 🎉 总结

跨平台开发脚本套件提供了：
- 🖥️ **跨平台兼容**：Windows PowerShell + Linux/macOS Shell 双重支持
- 🚀 **智能启动**：Docker 容器化 + 本地开发双模式
- 🛡️ **智能容错**：网络异常自动切换，依赖问题自动修复
- 🎨 **用户友好**：彩色输出和详细的状态提示
- 🔧 **灵活配置**：支持多种运行模式和参数组合
- 🐍 **后端优化**：专用脚本解决环境变量冲突和依赖管理
- 🧪 **测试集成**：统一的测试管理和故障排查工具

现在你可以在任何操作系统环境中享受一致的开发体验！