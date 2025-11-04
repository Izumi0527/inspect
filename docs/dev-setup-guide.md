# 开发环境启动指南

## 概述

本项目提供了多种开发环境启动方式，以应对不同的网络和系统环境。

## 快速启动

### 方式 1：标准 Docker 模式（推荐）

```bash
./scripts/dev-start.sh
```

此模式会：
- 自动检测 Docker 镜像源配置
- 测试网络连通性
- 构建完整的 Docker 开发环境
- 启动所有服务（数据库 + 后端 + 前端）

### 方式 2：本地开发模式（网络受限推荐）

```bash
./scripts/dev-start.sh --local
```

此模式会：
- 仅启动数据库服务（PostgreSQL、Redis、InfluxDB）
- 后端和前端在本地环境运行
- 避免 Docker 镜像构建问题

### 方式 3：预构建镜像模式

```bash
./scripts/dev-start.sh --prebuilt
```

此模式会：
- 使用预构建的 Docker 镜像
- 跳过本地构建过程
- 适用于镜像源配置但仍有构建问题的情况

## 详细启动步骤

### 标准 Docker 模式

1. **检查网络连通性**
   ```bash
   curl -I https://registry-1.docker.io
   ```

2. **配置镜像加速器（如需要）**
   参考 `docs/docker-mirror-config.md`

3. **启动环境**
   ```bash
   ./scripts/dev-start.sh
   ```

4. **访问服务**
   - 前端：http://localhost:3000
   - 后端 API：http://localhost:8001
   - API 文档：http://localhost:8001/docs

### 本地开发模式

1. **启动数据库服务**
   ```bash
   ./scripts/dev-start.sh --local
   ```

2. **启动后端（新终端）**
   ```bash
   cd backend
   
   # 创建虚拟环境（如果尚未创建）
   python -m venv .venv
   .\.venv\Scripts\activate  # Windows
   # 或
   source .venv/bin/activate  # Linux/macOS
   
   # 安装依赖
   pip install uv
   uv pip install -r requirements.txt
   
   # 启动后端服务
   uvicorn src.main:app --reload --port 8001
   ```

3. **启动前端（新终端）**
   ```bash
   cd frontend
   
   # 安装依赖（如果尚未安装）
   pnpm install  # 或 npm install
   
   # 启动前端服务
   pnpm dev  # 或 npm run dev
   ```

## 常见问题解决

### 1. Docker 镜像拉取失败

**错误症状：**
```
failed to do request: Head "https://registry-1.docker.io/v2/library/python/manifests/3.11-slim"
```

**解决方案：**
1. 配置 Docker 镜像加速器（参考 `docs/docker-mirror-config.md`）
2. 使用本地开发模式：`./scripts/dev-start.sh --local`

### 2. Python 版本不匹配

**错误症状：**
```
ERROR: This package requires Python >=3.11
```

**解决方案：**
1. 升级本地 Python 到 3.11+
2. 使用 Docker 模式避免本地 Python 版本问题

### 3. 端口冲突

**错误症状：**
```
Error: Port 5433 is already in use
```

**解决方案：**
```bash
# 检查端口占用
netstat -an | findstr :5433  # Windows
# 或
lsof -i :5433  # Linux/macOS

# 停止可能运行的服务
docker-compose -f docker-compose.dev.yml down
```

### 4. 依赖安装失败

**后端依赖问题：**
```bash
cd backend
pip install uv
uv pip install -r requirements.txt --no-cache-dir
```

**前端依赖问题：**
```bash
cd frontend
rm -rf node_modules package-lock.json
pnpm install
```

## 服务状态检查

### 检查 Docker 服务状态
```bash
docker-compose -f docker-compose.dev.yml ps
docker-compose -f docker-compose.dev.yml logs [service-name]
```

### 检查本地服务状态
```bash
# 检查后端健康状态
curl http://localhost:8001/health

# 检查前端是否运行
curl http://localhost:3000

# 检查数据库连接
psql -h localhost -p 5433 -U inspect_dev -d inspect_system_dev
```

## 环境变量配置

项目启动时会自动创建 `.env.dev` 文件，包含以下配置：

```env
# 开发环境配置
NODE_ENV=development
ENVIRONMENT=development

# 数据库配置
DATABASE_URL=postgresql://inspect_dev:dev_password_2024@localhost:5433/inspect_system_dev
REDIS_URL=redis://:dev_redis_2024@localhost:6380/0
INFLUXDB_URL=http://localhost:8087

# API 配置
NEXT_PUBLIC_API_URL=http://localhost:8001
NEXT_PUBLIC_WS_URL=ws://localhost:8001

# 调试模式
DEBUG=true
LOG_LEVEL=debug
```

## 开发工具集成

### VS Code 配置

推荐安装以下扩展：
- Python
- Pylance
- ES7+ React/Redux/React-Native snippets
- Tailwind CSS IntelliSense
- Docker

### IDE 配置

1. **Python 解释器路径**（本地开发模式）
   ```
   backend/.venv/Scripts/python.exe  # Windows
   backend/.venv/bin/python  # Linux/macOS
   ```

2. **TypeScript 配置**
   项目已配置 `tsconfig.json`，支持路径别名和严格类型检查

## 日志和调试

### 日志位置
- Docker 模式：`docker-compose -f docker-compose.dev.yml logs -f`
- 本地模式：`logs/frontend/dev.log`

### 调试端口
- 后端调试：8001
- 前端热重载：3000
- 数据库：5433
- Redis：6380
- InfluxDB：8087

## 性能优化

### Docker 构建优化
```bash
# 清理构建缓存
docker builder prune -f

# 并行构建
docker-compose -f docker-compose.dev.yml build --parallel

# 使用构建缓存
export DOCKER_BUILDKIT=1
```

### 本地开发优化
```bash
# 后端热重载
uvicorn src.main:app --reload --reload-dir src

# 前端快速刷新
pnpm dev --turbo
```

## 项目结构

```
inspect-system/
├── backend/                 # 后端服务
│   ├── src/                # 源代码
│   ├── requirements.txt    # Python 依赖
│   └── pyproject.toml      # 项目配置
├── frontend/               # 前端应用
│   ├── src/               # 源代码
│   ├── package.json       # Node.js 依赖
│   └── next.config.js     # Next.js 配置
├── scripts/               # 启动脚本
├── docs/                  # 项目文档
├── docker-compose.dev.yml # Docker 开发环境
└── Dockerfile            # Docker 镜像定义
```

## 提交代码前检查

```bash
# 后端代码检查
cd backend
uv run black src/
uv run isort src/
uv run flake8 src/
uv run mypy src/

# 前端代码检查
cd frontend
pnpm lint
pnpm type-check
pnpm test

# 构建测试
pnpm build
```