# 环境变量配置指南

## 概述

本项目使用环境变量来管理不同环境下的配置信息。配置文件分为根目录配置（整个项目）和前端配置（Next.js）。

## 配置文件结构

```
项目根目录/
├── .env                    # 整个项目的实际配置（包含后端Go服务）
├── .env.example            # 整个项目的配置模板
└── frontend/
    ├── .env.local          # 前端本地开发配置
    └── .env.example        # 前端配置模板
```

## 根目录配置文件

### `.env`
- **用途**: 整个项目的实际配置文件
- **包含**: 后端Go服务、数据库、Redis、JWT等所有配置
- **版本控制**: ❌ 已被 `.gitignore` 忽略
- **使用场景**: 本地开发、生产部署

### `.env.example`
- **用途**: 配置模板，供团队成员参考
- **包含**: 所有配置项的示例和详细说明
- **版本控制**: ✅ 提交到版本控制
- **使用方法**: `cp .env.example .env` 然后修改

## 前端配置文件

### `frontend/.env.local`
- **用途**: 前端本地开发配置
- **包含**: Next.js 前端相关的环境变量
- **版本控制**: ❌ 已被 `.gitignore` 忽略
- **使用场景**: 本地开发

### `frontend/.env.example`
- **用途**: 前端配置模板
- **包含**: 前端所有配置项的示例和说明
- **版本控制**: ✅ 提交到版本控制
- **使用方法**: `cp .env.example .env.local` 然后修改

## 快速开始

### 首次设置

1. **设置根目录配置**
   ```bash
   # 复制配置模板
   cp .env.example .env
   
   # 根据实际情况修改配置
   # 主要修改：数据库连接、Redis连接、密钥等
   ```

2. **设置前端配置**
   ```bash
   cd frontend
   
   # 复制前端配置模板
   cp .env.example .env.local
   
   # 根据实际情况修改配置
   # 主要修改：API地址、功能开关等
   ```

### 开发环境配置

**根目录 `.env` 关键配置：**
```bash
NODE_ENV=development
DATABASE_URL=postgresql://inspect_dev:dev_password_2024@localhost:15500/inspect_system_dev
REDIS_URL=redis://:dev_redis_2024@localhost:16379/0
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**前端 `.env.local` 关键配置：**
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
NEXT_PUBLIC_DISABLE_AUTH_CHECK=false
```

### 生产环境配置

**根目录 `.env` 关键修改：**
```bash
NODE_ENV=production
ENVIRONMENT=production
DEBUG=false
SECRET_KEY=<使用强随机密钥>
JWT_SECRET_KEY=<使用强随机密钥>
DATABASE_URL=postgresql://<生产数据库连接>
REDIS_URL=redis://<生产Redis连接>
CORS_ORIGINS=["https://yourdomain.com"]
LOG_LEVEL=INFO
LOG_FORMAT=json
```

**前端配置：**
```bash
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_WS_URL=wss://api.yourdomain.com
NEXT_PUBLIC_DISABLE_AUTH_CHECK=false
```

## 配置项说明

### 前端配置项

#### API配置
- `NEXT_PUBLIC_API_URL`: 后端API基础URL
- `NEXT_PUBLIC_WS_URL`: WebSocket连接地址

#### 开发配置
- `NEXT_PUBLIC_DISABLE_AUTH_CHECK`: 是否禁用认证检查（仅开发环境）

#### 功能开关
- `NEXT_PUBLIC_DEBUG`: 是否启用调试模式
- `NEXT_PUBLIC_ENABLE_PERFORMANCE_MONITOR`: 是否启用性能监控

#### 测试配置（E2E测试）
- `API_URL`: E2E测试时的API地址
- `TEST_DATABASE_URL`: 测试数据库连接
- `NODE_ENV`: 环境标识
- `NEXT_TELEMETRY_DISABLED`: 禁用遥测

### 后端配置项

详见根目录 `.env.example` 文件中的详细说明，包括：
- 数据库配置
- Redis配置
- JWT配置
- CORS配置
- 日志配置
- SNMP配置
- 邮件配置
- 监控配置
- 备份配置

## 环境变量优先级

Next.js 环境变量加载优先级（从高到低）：
1. `.env.local` - 本地开发配置（最高优先级）
2. `.env.development` / `.env.production` - 环境特定配置
3. `.env` - 默认配置

## 重要说明

### NEXT_PUBLIC_ 前缀
- **带前缀**: 变量会暴露到浏览器端，可在客户端组件中使用
- **不带前缀**: 变量只在服务器端可用，不会暴露到浏览器

### 安全建议
1. ❌ **不要**将 `.env` 和 `.env.local` 提交到版本控制
2. ✅ **务必**在生产环境修改所有默认密码和密钥
3. ✅ **建议**使用环境变量或 Docker secrets 管理敏感信息
4. ✅ **定期**轮换密钥和密码

### 修改生效
- 修改环境变量后需要**重启开发服务器**才能生效
- Docker环境需要**重新构建镜像**或**重启容器**

## 故障排查

### 前端无法连接后端
1. 检查 `NEXT_PUBLIC_API_URL` 是否正确
2. 确认后端服务是否正常运行
3. 检查端口是否被占用

### 认证问题
1. 检查 `JWT_SECRET_KEY` 是否一致
2. 确认 `NEXT_PUBLIC_DISABLE_AUTH_CHECK` 设置
3. 清除浏览器缓存和 Cookie

### 数据库连接失败
1. 检查 `DATABASE_URL` 格式是否正确
2. 确认数据库服务是否运行
3. 验证用户名、密码、端口是否正确

## 相关文档

- [开发环境搭建指南](./development-environment-guide.md)
- [Docker部署指南](./docker/COMPOSE_QUICK_START.md)
- [数据库配置指南](./datebase/database-deployment.md)

## 更新日志

### 2026-01-30
- 整理前端 .env 文件，保留 `.env.example` 和 `.env.local`
- 删除 `.env.test`，测试配置合并到 `.env.example`
- 将所有英文注释改为中文
- 创建本配置指南文档
