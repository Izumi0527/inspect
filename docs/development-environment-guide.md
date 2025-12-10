# 🛠️ 企业级网络设备巡检系统开发环境完整配置指南

## 📋 概述

本指南提供了企业级网络设备巡检系统完整的开发环境配置方案，涵盖前端、后端、数据库、容器化等全栈开发环境的搭建和优化。

### 🎯 环境配置目标

- **统一开发环境** - 确保团队成员使用一致的开发工具和版本
- **高效开发体验** - 优化开发工具链，提升开发效率
- **质量保障** - 集成代码质量检查和自动化测试
- **容器化支持** - 提供完整的 Docker 开发环境
- **生产环境对齐** - 开发环境尽可能接近生产环境

## 🏗️ 系统架构概览

```mermaid
graph TB
    subgraph "开发环境架构"
        A[开发者工作站] --> B[前端开发环境]
        A --> C[后端开发环境]
        A --> D[数据库环境]
        A --> E[容器化环境]
        
        B --> F[Node.js 20+ & pnpm]
        B --> G[Next.js 15 & React 19]
        B --> H[TypeScript 5.7]
        
        C --> I[Python 3.12.9 & uv]
        C --> J[FastAPI & Uvicorn]
        C --> K[SQLAlchemy 2.0]
        
        D --> L[PostgreSQL 16]
        D --> M[Redis 7]
        D --> N[InfluxDB 2.7]
        
        E --> O[Docker & Docker Compose]
        E --> P[开发工具容器]
    end
```

## 🖥️ 系统要求

### 硬件要求

| 组件 | 最低配置 | 推荐配置 | 说明 |
|------|----------|----------|------|
| **CPU** | 4 核心 | 8 核心+ | 支持并行编译和容器运行 |
| **内存** | 8GB | 16GB+ | 开发工具和数据库需要充足内存 |
| **存储** | 100GB 可用空间 | 256GB SSD | SSD 显著提升开发体验 |
| **网络** | 稳定互联网连接 | 高速宽带 | 依赖下载和容器镜像拉取 |

### 操作系统支持

| 操作系统 | 版本要求 | 支持状态 | 备注 |
|----------|----------|----------|------|
| **Windows** | Windows 10/11 | ✅ 完全支持 | 推荐使用 WSL2 |
| **macOS** | macOS 12+ | ✅ 完全支持 | Intel 和 Apple Silicon |
| **Linux** | Ubuntu 20.04+ | ✅ 完全支持 | 推荐 Ubuntu/Debian 系 |

## 🔧 核心工具安装

### 1. 版本控制工具

#### Git 安装和配置

```bash
# Windows (使用 winget)
winget install --id Git.Git -e --source winget

# macOS (使用 Homebrew)
brew install git

# Ubuntu/Debian
sudo apt update && sudo apt install git

# 全局配置
git config --global user.name "你的姓名"
git config --global user.email "your.email@company.com"
git config --global init.defaultBranch main
git config --global core.autocrlf input  # Linux/macOS
git config --global core.autocrlf true   # Windows

# 配置 SSH 密钥
ssh-keygen -t ed25519 -C "your.email@company.com"
cat ~/.ssh/id_ed25519.pub  # 复制公钥到 Git 服务器
```

### 2. 容器化工具

#### Docker 安装

```bash
# Windows
# 下载并安装 Docker Desktop for Windows
# https://docs.docker.com/desktop/install/windows-install/

# macOS
# 下载并安装 Docker Desktop for Mac
# https://docs.docker.com/desktop/install/mac-install/

# Ubuntu
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# 验证安装
docker --version
docker-compose --version
```

#### Docker 配置优化

```json
# Docker Desktop 配置 (settings.json)
{
  "memoryMiB": 8192,
  "cpus": 4,
  "diskSizeMiB": 102400,
  "swapMiB": 2048,
  "experimental": true,
  "buildkit": true
}
```

### 3. 开发环境管理

#### Node.js 和 pnpm 安装

```bash
# 使用 fnm (推荐的 Node.js 版本管理器)
# Windows
winget install Schniz.fnm

# macOS
brew install fnm

# Linux
curl -fsSL https://fnm.vercel.app/install | bash

# 安装 Node.js 20 LTS
fnm install 20
fnm use 20
fnm default 20

# 安装 pnpm
npm install -g pnpm@latest

# 验证安装
node --version  # 应该显示 v20.x.x
pnpm --version  # 应该显示 8.x.x+
```

#### Python 和 uv 安装

```bash
# Python 3.12.9 安装
# Windows
winget install Python.Python.3.12

# macOS
brew install python@3.12

# Ubuntu
sudo apt update
sudo apt install python3.12 python3.12-venv python3.12-dev

# uv 安装
# Windows
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"

# Linux/macOS
curl -LsSf https://astral.sh/uv/install.sh | sh

# 验证安装
python3.12 --version  # 应该显示 Python 3.12.9
uv --version          # 应该显示 uv 0.8.12+
```

## 🎨 前端开发环境

### 环境配置

```bash
# 进入前端目录
cd frontend

# 安装依赖
pnpm install

# 验证环境
pnpm run type-check
pnpm run lint
pnpm run test --run
```

### VS Code 前端配置

创建 `.vscode/settings.json`:

```json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.suggest.autoImports": true,
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true,
    "source.organizeImports": true
  },
  "eslint.workingDirectories": ["frontend"],
  "tailwindCSS.includeLanguages": {
    "typescript": "javascript",
    "typescriptreact": "javascript"
  },
  "emmet.includeLanguages": {
    "typescript": "html",
    "typescriptreact": "html"
  }
}
```

### 前端开发脚本

创建 `frontend/scripts/dev-setup.js`:

```javascript
#!/usr/bin/env node
/**
 * 前端开发环境设置脚本
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 设置前端开发环境...');

// 检查 Node.js 版本
const nodeVersion = process.version;
const requiredVersion = 'v20';
if (!nodeVersion.startsWith(requiredVersion)) {
  console.error(`❌ 需要 Node.js ${requiredVersion}+，当前版本: ${nodeVersion}`);
  process.exit(1);
}

// 检查 pnpm
try {
  execSync('pnpm --version', { stdio: 'ignore' });
  console.log('✅ pnpm 已安装');
} catch (error) {
  console.error('❌ pnpm 未安装，请运行: npm install -g pnpm');
  process.exit(1);
}

// 安装依赖
console.log('📦 安装依赖...');
execSync('pnpm install', { stdio: 'inherit' });

// 运行类型检查
console.log('🔍 运行类型检查...');
execSync('pnpm run type-check', { stdio: 'inherit' });

// 运行代码检查
console.log('🔍 运行代码检查...');
execSync('pnpm run lint', { stdio: 'inherit' });

// 运行测试
console.log('🧪 运行测试...');
execSync('pnpm run test --run', { stdio: 'inherit' });

console.log('✅ 前端开发环境设置完成！');
console.log('🎯 运行 pnpm dev 启动开发服务器');
```

## 🐍 后端开发环境

### 环境配置

```bash
# 进入后端目录
cd backend

# 安装 Python 3.12.9
uv python install 3.12.9

# 创建虚拟环境
uv venv --python 3.12.9

# 安装依赖
uv sync --all-extras

# 验证环境
uv run python --version
uv run pytest --version
uv run black --version
```

### VS Code 后端配置

创建 `.vscode/settings.json` (后端部分):

```json
{
  "python.defaultInterpreterPath": "./backend/.venv/Scripts/python.exe",
  "python.terminal.activateEnvironment": false,
  "python.linting.enabled": true,
  "python.linting.flake8Enabled": true,
  "python.linting.mypyEnabled": true,
  "python.formatting.provider": "black",
  "python.sortImports.args": ["--profile", "black"],
  "python.testing.pytestEnabled": true,
  "python.testing.pytestArgs": [
    "tests",
    "--verbose"
  ],
  "[python]": {
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
      "source.organizeImports": true
    }
  }
}
```

### 后端开发脚本

创建 `backend/scripts/dev-setup.py`:

```python
#!/usr/bin/env python3
"""
后端开发环境设置脚本
"""

import subprocess
import sys
from pathlib import Path

def run_command(cmd: str, description: str) -> None:
    """运行命令并处理错误"""
    print(f"🔄 {description}...")
    try:
        result = subprocess.run(cmd, shell=True, check=True, capture_output=True, text=True)
        print(f"✅ {description}完成")
        if result.stdout:
            print(result.stdout)
    except subprocess.CalledProcessError as e:
        print(f"❌ {description}失败: {e}")
        if e.stderr:
            print(e.stderr)
        sys.exit(1)

def main():
    print("🚀 设置后端开发环境...")
    
    # 检查 uv 是否安装
    try:
        subprocess.run("uv --version", shell=True, check=True, capture_output=True)
        print("✅ uv 已安装")
    except subprocess.CalledProcessError:
        print("❌ uv 未安装，请先安装 uv")
        sys.exit(1)
    
    # 检查 Python 版本
    run_command("uv python install 3.12.9", "安装 Python 3.12.9")
    
    # 创建虚拟环境
    if not Path(".venv").exists():
        run_command("uv venv --python 3.12.9", "创建虚拟环境")
    
    # 安装依赖
    run_command("uv sync --all-extras", "安装项目依赖")
    
    # 验证安装
    run_command("uv run python --version", "验证 Python 版本")
    run_command("uv run python -c \"import fastapi, sqlalchemy, redis; print('核心依赖导入成功')\"", "验证核心依赖")
    
    # 运行代码质量检查
    run_command("uv run black --check src/ tests/", "检查代码格式")
    run_command("uv run isort --check-only src/ tests/", "检查导入排序")
    run_command("uv run flake8 src/ tests/", "运行代码检查")
    run_command("uv run mypy src/", "运行类型检查")
    
    # 运行测试
    run_command("uv run pytest tests/ -v", "运行测试套件")
    
    print("✅ 后端开发环境设置完成！")
    print("🎯 运行 uv run uvicorn src.main:app --reload 启动开发服务器")

if __name__ == "__main__":
    main()
```

## 🗄️ 数据库环境

### Docker Compose 数据库服务

创建 `docker-compose.db.yml`:

```yaml
version: '3.8'

services:
  # PostgreSQL 开发数据库
  postgres-dev:
    image: postgres:16-alpine
    container_name: inspect-postgres-dev
    environment:
      POSTGRES_DB: inspect_system_dev
      POSTGRES_USER: inspect_dev
      POSTGRES_PASSWORD: dev_password_2024
      POSTGRES_INITDB_ARGS: "--encoding=UTF-8 --lc-collate=C --lc-ctype=C"
    volumes:
      - postgres_dev_data:/var/lib/postgresql/data
      - ./database/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
      - ./database/dev-data.sql:/docker-entrypoint-initdb.d/dev-data.sql:ro
    ports:
      - "5433:5432"
    networks:
      - dev_network
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U inspect_dev -d inspect_system_dev"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis 开发缓存
  redis-dev:
    image: redis:7-alpine
    container_name: inspect-redis-dev
    command: redis-server --requirepass dev_redis_2024 --appendonly yes
    volumes:
      - redis_dev_data:/data
    ports:
      - "6380:6379"
    networks:
      - dev_network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "dev_redis_2024", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  # InfluxDB 开发时序数据库
  influxdb-dev:
    image: influxdb:2.7-alpine
    container_name: inspect-influxdb-dev
    environment:
      DOCKER_INFLUXDB_INIT_MODE: setup
      DOCKER_INFLUXDB_INIT_USERNAME: dev_admin
      DOCKER_INFLUXDB_INIT_PASSWORD: dev_admin_2024
      DOCKER_INFLUXDB_INIT_ORG: inspect_dev
      DOCKER_INFLUXDB_INIT_BUCKET: device_metrics_dev
      DOCKER_INFLUXDB_INIT_ADMIN_TOKEN: dev_token_2024
    volumes:
      - influxdb_dev_data:/var/lib/influxdb2
    ports:
      - "8087:8086"
    networks:
      - dev_network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "-H", "Authorization: Token dev_token_2024", "http://localhost:8086/health"]
      interval: 30s
      timeout: 10s
      retries: 5

  # pgAdmin 数据库管理工具
  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: inspect-pgadmin-dev
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@inspect.dev
      PGADMIN_DEFAULT_PASSWORD: dev_admin_2024
      PGADMIN_CONFIG_SERVER_MODE: "False"
    volumes:
      - pgadmin_data:/var/lib/pgadmin
    ports:
      - "5050:80"
    depends_on:
      - postgres-dev
    networks:
      - dev_network
    restart: unless-stopped

  # Redis Commander 缓存管理工具
  redis-commander:
    image: rediscommander/redis-commander:latest
    container_name: inspect-redis-commander-dev
    environment:
      REDIS_HOSTS: local:redis-dev:6379:0:dev_redis_2024
    ports:
      - "8081:8081"
    depends_on:
      - redis-dev
    networks:
      - dev_network
    restart: unless-stopped

networks:
  dev_network:
    driver: bridge

volumes:
  postgres_dev_data:
  redis_dev_data:
  influxdb_dev_data:
  pgadmin_data:
```

### 数据库初始化脚本

创建 `database/init.sql`:

```sql
-- 数据库初始化脚本
-- 创建扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- 创建用户和权限
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'inspect_app') THEN
        CREATE ROLE inspect_app WITH LOGIN PASSWORD 'app_password_2024';
    END IF;
END
$$;

-- 授权
GRANT CONNECT ON DATABASE inspect_system_dev TO inspect_app;
GRANT USAGE ON SCHEMA public TO inspect_app;
GRANT CREATE ON SCHEMA public TO inspect_app;

-- 创建基础表结构（示例）
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    is_superuser BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- 插入默认管理员用户
INSERT INTO users (username, email, password_hash, is_superuser) 
VALUES ('admin', 'admin@inspect.dev', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj3QJflLg5F2', true)
ON CONFLICT (username) DO NOTHING;

COMMENT ON TABLE users IS '用户表';
COMMENT ON COLUMN users.id IS '用户唯一标识';
COMMENT ON COLUMN users.username IS '用户名';
COMMENT ON COLUMN users.email IS '邮箱地址';
COMMENT ON COLUMN users.password_hash IS '密码哈希';
COMMENT ON COLUMN users.is_active IS '是否激活';
COMMENT ON COLUMN users.is_superuser IS '是否超级用户';
```

### 数据库管理脚本

创建 `scripts/db-manage.py`:

```python
#!/usr/bin/env python3
"""
数据库管理脚本
"""

import argparse
import subprocess
import sys
from pathlib import Path

def run_command(cmd: str) -> None:
    """运行命令"""
    print(f"执行: {cmd}")
    result = subprocess.run(cmd, shell=True)
    if result.returncode != 0:
        sys.exit(1)

def start_databases():
    """启动数据库服务"""
    print("🚀 启动数据库服务...")
    run_command("docker-compose -f docker-compose.db.yml up -d")
    print("✅ 数据库服务已启动")
    print("📊 访问地址:")
    print("  - PostgreSQL: localhost:5433")
    print("  - Redis: localhost:6380")
    print("  - InfluxDB: http://localhost:8087")
    print("  - pgAdmin: http://localhost:5050")
    print("  - Redis Commander: http://localhost:8081")

def stop_databases():
    """停止数据库服务"""
    print("🛑 停止数据库服务...")
    run_command("docker-compose -f docker-compose.db.yml down")
    print("✅ 数据库服务已停止")

def reset_databases():
    """重置数据库"""
    print("🔄 重置数据库...")
    run_command("docker-compose -f docker-compose.db.yml down -v")
    run_command("docker-compose -f docker-compose.db.yml up -d")
    print("✅ 数据库已重置")

def backup_database():
    """备份数据库"""
    print("💾 备份数据库...")
    backup_dir = Path("backups")
    backup_dir.mkdir(exist_ok=True)
    
    from datetime import datetime
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # 备份 PostgreSQL
    pg_backup = f"backups/postgres_backup_{timestamp}.sql"
    run_command(f"docker exec inspect-postgres-dev pg_dump -U inspect_dev inspect_system_dev > {pg_backup}")
    
    # 备份 Redis
    redis_backup = f"backups/redis_backup_{timestamp}.rdb"
    run_command(f"docker exec inspect-redis-dev redis-cli -a dev_redis_2024 --rdb {redis_backup}")
    
    print(f"✅ 数据库备份完成: {backup_dir}")

def main():
    parser = argparse.ArgumentParser(description="数据库管理工具")
    parser.add_argument("action", choices=["start", "stop", "reset", "backup"], 
                       help="操作类型")
    
    args = parser.parse_args()
    
    if args.action == "start":
        start_databases()
    elif args.action == "stop":
        stop_databases()
    elif args.action == "reset":
        reset_databases()
    elif args.action == "backup":
        backup_database()

if __name__ == "__main__":
    main()
```

## 🔧 IDE 配置

### VS Code 完整配置

创建 `.vscode/settings.json`:

```json
{
  // 通用设置
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll": true,
    "source.organizeImports": true
  },
  "files.trimTrailingWhitespace": true,
  "files.insertFinalNewline": true,
  "files.trimFinalNewlines": true,
  
  // Python 设置
  "python.defaultInterpreterPath": "./backend/.venv/Scripts/python.exe",
  "python.terminal.activateEnvironment": false,
  "python.linting.enabled": true,
  "python.linting.flake8Enabled": true,
  "python.linting.mypyEnabled": true,
  "python.formatting.provider": "black",
  "python.sortImports.args": ["--profile", "black"],
  "python.testing.pytestEnabled": true,
  "python.testing.pytestArgs": ["backend/tests", "--verbose"],
  
  // TypeScript/JavaScript 设置
  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.suggest.autoImports": true,
  "eslint.workingDirectories": ["frontend"],
  "tailwindCSS.includeLanguages": {
    "typescript": "javascript",
    "typescriptreact": "javascript"
  },
  
  // 文件关联
  "files.associations": {
    "*.env.*": "dotenv",
    "docker-compose*.yml": "dockercompose",
    "Dockerfile*": "dockerfile"
  },
  
  // 排除文件
  "files.exclude": {
    "**/.git": true,
    "**/.DS_Store": true,
    "**/node_modules": true,
    "**/__pycache__": true,
    "**/.pytest_cache": true,
    "**/.mypy_cache": true,
    "**/dist": true,
    "**/.next": true,
    "**/coverage": true
  },
  
  // 搜索排除
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/.next": true,
    "**/coverage": true,
    "**/logs": true
  }
}
```

创建 `.vscode/extensions.json`:

```json
{
  "recommendations": [
    // Python 开发
    "ms-python.python",
    "ms-python.flake8",
    "ms-python.mypy-type-checker",
    "ms-python.black-formatter",
    "ms-python.isort",
    
    // JavaScript/TypeScript 开发
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next",
    
    // 容器化开发
    "ms-azuretools.vscode-docker",
    "ms-vscode-remote.remote-containers",
    
    // 数据库
    "ms-mssql.mssql",
    "cweijan.vscode-postgresql-client2",
    
    // 通用工具
    "ms-vscode.vscode-json",
    "redhat.vscode-yaml",
    "ms-vscode.vscode-markdown",
    "yzhang.markdown-all-in-one",
    "streetsidesoftware.code-spell-checker",
    
    // Git 工具
    "eamodio.gitlens",
    "mhutchie.git-graph",
    
    // 其他有用扩展
    "ms-vscode.vscode-todo-highlight",
    "gruntfuggly.todo-tree",
    "aaron-bond.better-comments"
  ]
}
```

创建 `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "启动前端开发服务器",
      "type": "shell",
      "command": "pnpm",
      "args": ["dev"],
      "options": {
        "cwd": "${workspaceFolder}/frontend"
      },
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "new"
      },
      "problemMatcher": []
    },
    {
      "label": "启动后端开发服务器",
      "type": "shell",
      "command": "uv",
      "args": ["run", "uvicorn", "src.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"],
      "options": {
        "cwd": "${workspaceFolder}/backend"
      },
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "new"
      },
      "problemMatcher": []
    },
    {
      "label": "启动数据库服务",
      "type": "shell",
      "command": "docker-compose",
      "args": ["-f", "docker-compose.db.yml", "up", "-d"],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      }
    },
    {
      "label": "运行后端测试",
      "type": "shell",
      "command": "uv",
      "args": ["run", "pytest", "tests/", "-v", "--cov=src"],
      "options": {
        "cwd": "${workspaceFolder}/backend"
      },
      "group": "test",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      }
    },
    {
      "label": "运行前端测试",
      "type": "shell",
      "command": "pnpm",
      "args": ["test", "--run"],
      "options": {
        "cwd": "${workspaceFolder}/frontend"
      },
      "group": "test",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      }
    },
    {
      "label": "代码质量检查",
      "type": "shell",
      "command": "python",
      "args": ["scripts/quality-check.py"],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      }
    }
  ]
}
```

## 🚀 一键环境设置

### 主设置脚本

创建 `scripts/setup-dev-env.py`:

```python
#!/usr/bin/env python3
"""
一键开发环境设置脚本
"""

import os
import subprocess
import sys
import platform
from pathlib import Path

class DevEnvironmentSetup:
    def __init__(self):
        self.os_type = platform.system().lower()
        self.project_root = Path(__file__).parent.parent
        
    def run_command(self, cmd: str, description: str, cwd: Path = None) -> bool:
        """运行命令并处理错误"""
        print(f"🔄 {description}...")
        try:
            result = subprocess.run(
                cmd, 
                shell=True, 
                check=True, 
                cwd=cwd or self.project_root,
                capture_output=True, 
                text=True
            )
            print(f"✅ {description}完成")
            return True
        except subprocess.CalledProcessError as e:
            print(f"❌ {description}失败: {e}")
            if e.stderr:
                print(f"错误信息: {e.stderr}")
            return False
    
    def check_prerequisites(self) -> bool:
        """检查前置条件"""
        print("🔍 检查前置条件...")
        
        prerequisites = [
            ("git", "Git 版本控制"),
            ("docker", "Docker 容器"),
            ("node", "Node.js 运行时"),
            ("pnpm", "pnpm 包管理器"),
            ("python3.12", "Python 3.12"),
            ("uv", "uv 包管理器")
        ]
        
        all_ok = True
        for cmd, name in prerequisites:
            try:
                subprocess.run(f"{cmd} --version", shell=True, check=True, capture_output=True)
                print(f"✅ {name} 已安装")
            except subprocess.CalledProcessError:
                print(f"❌ {name} 未安装")
                all_ok = False
        
        return all_ok
    
    def setup_backend(self) -> bool:
        """设置后端环境"""
        print("\n🐍 设置后端环境...")
        backend_dir = self.project_root / "backend"
        
        steps = [
            ("uv python install 3.12.9", "安装 Python 3.12.9"),
            ("uv venv --python 3.12.9", "创建虚拟环境"),
            ("uv sync --all-extras", "安装依赖包"),
            ("uv run python -c \"import fastapi; print('FastAPI 导入成功')\"", "验证安装")
        ]
        
        for cmd, desc in steps:
            if not self.run_command(cmd, desc, backend_dir):
                return False
        
        return True
    
    def setup_frontend(self) -> bool:
        """设置前端环境"""
        print("\n🎨 设置前端环境...")
        frontend_dir = self.project_root / "frontend"
        
        steps = [
            ("pnpm install", "安装依赖包"),
            ("pnpm run type-check", "类型检查"),
            ("pnpm run lint", "代码检查")
        ]
        
        for cmd, desc in steps:
            if not self.run_command(cmd, desc, frontend_dir):
                return False
        
        return True
    
    def setup_database(self) -> bool:
        """设置数据库环境"""
        print("\n🗄️ 设置数据库环境...")
        
        steps = [
            ("docker-compose -f docker-compose.db.yml pull", "拉取数据库镜像"),
            ("docker-compose -f docker-compose.db.yml up -d", "启动数据库服务")
        ]
        
        for cmd, desc in steps:
            if not self.run_command(cmd, desc):
                return False
        
        # 等待数据库启动
        print("⏳ 等待数据库服务启动...")
        import time
        time.sleep(10)
        
        return True
    
    def create_env_files(self) -> bool:
        """创建环境配置文件"""
        print("\n📝 创建环境配置文件...")
        
        # 后端环境配置
        backend_env = self.project_root / "backend" / ".env"
        if not backend_env.exists():
            env_content = """# 数据库配置
DATABASE_URL=postgresql+asyncpg://inspect_dev:dev_password_2024@localhost:5433/inspect_system_dev
REDIS_URL=redis://:dev_redis_2024@localhost:6380/0
INFLUXDB_URL=http://localhost:8087
INFLUXDB_TOKEN=dev_token_2024
INFLUXDB_ORG=inspect_dev
INFLUXDB_BUCKET=device_metrics_dev

# 应用配置
SECRET_KEY=dev_secret_key_2024_very_long_and_secure
ENVIRONMENT=development
DEBUG=true
LOG_LEVEL=debug

# Python 配置
PYTHONDONTWRITEBYTECODE=1
PYTHONUNBUFFERED=1
"""
            backend_env.write_text(env_content)
            print("✅ 后端环境配置文件已创建")
        
        # 前端环境配置
        frontend_env = self.project_root / "frontend" / ".env.local"
        if not frontend_env.exists():
            env_content = """# API 配置
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000

# 开发配置
NODE_ENV=development
NEXT_PUBLIC_ENV=development
"""
            frontend_env.write_text(env_content)
            print("✅ 前端环境配置文件已创建")
        
        return True
    
    def run_tests(self) -> bool:
        """运行测试验证环境"""
        print("\n🧪 运行测试验证环境...")
        
        # 后端测试
        backend_dir = self.project_root / "backend"
        if not self.run_command("uv run pytest tests/ -v", "后端测试", backend_dir):
            print("⚠️ 后端测试失败，但环境设置可能仍然正常")
        
        # 前端测试
        frontend_dir = self.project_root / "frontend"
        if not self.run_command("pnpm test --run", "前端测试", frontend_dir):
            print("⚠️ 前端测试失败，但环境设置可能仍然正常")
        
        return True
    
    def print_summary(self):
        """打印设置摘要"""
        print("\n" + "="*60)
        print("🎉 开发环境设置完成！")
        print("="*60)
        print("\n📊 服务访问地址:")
        print("  🎨 前端开发服务器: http://localhost:3000")
        print("  🐍 后端 API 服务器: http://localhost:8000")
        print("  📚 API 文档: http://localhost:8000/docs")
        print("  🗄️ PostgreSQL: localhost:5433")
        print("  🔴 Redis: localhost:6380")
        print("  📈 InfluxDB: http://localhost:8087")
        print("  🔧 pgAdmin: http://localhost:5050")
        print("  🔧 Redis Commander: http://localhost:8081")
        
        print("\n🚀 启动开发服务器:")
        print("  前端: cd frontend && pnpm dev")
        print("  后端: cd backend && uv run uvicorn src.main:app --reload")
        
        print("\n🛠️ 常用命令:")
        print("  数据库管理: python scripts/db-manage.py [start|stop|reset|backup]")
        print("  代码质量检查: python scripts/quality-check.py")
        print("  运行测试: python scripts/run-tests.py")
        
        print("\n📖 更多信息请查看 docs/ 目录下的文档")
    
    def run(self):
        """运行完整设置流程"""
        print("🚀 开始设置企业级网络设备巡检系统开发环境")
        print("="*60)
        
        # 检查前置条件
        if not self.check_prerequisites():
            print("\n❌ 前置条件检查失败，请先安装缺失的工具")
            sys.exit(1)
        
        # 创建环境配置文件
        if not self.create_env_files():
            print("\n❌ 环境配置文件创建失败")
            sys.exit(1)
        
        # 设置数据库环境
        if not self.setup_database():
            print("\n❌ 数据库环境设置失败")
            sys.exit(1)
        
        # 设置后端环境
        if not self.setup_backend():
            print("\n❌ 后端环境设置失败")
            sys.exit(1)
        
        # 设置前端环境
        if not self.setup_frontend():
            print("\n❌ 前端环境设置失败")
            sys.exit(1)
        
        # 运行测试
        self.run_tests()
        
        # 打印摘要
        self.print_summary()

if __name__ == "__main__":
    setup = DevEnvironmentSetup()
    setup.run()
```

### 快速启动脚本

创建 `scripts/dev-start.py`:

```python
#!/usr/bin/env python3
"""
开发环境快速启动脚本
"""

import subprocess
import sys
import time
from pathlib import Path

def start_services():
    """启动所有开发服务"""
    print("🚀 启动开发环境...")
    
    # 启动数据库服务
    print("🗄️ 启动数据库服务...")
    subprocess.run("docker-compose -f docker-compose.db.yml up -d", shell=True)
    
    # 等待数据库启动
    print("⏳ 等待数据库服务启动...")
    time.sleep(5)
    
    print("✅ 开发环境启动完成！")
    print("\n📊 服务状态:")
    subprocess.run("docker-compose -f docker-compose.db.yml ps", shell=True)
    
    print("\n🎯 下一步:")
    print("  1. 启动后端: cd backend && uv run uvicorn src.main:app --reload")
    print("  2. 启动前端: cd frontend && pnpm dev")
    print("  3. 访问应用: http://localhost:3000")

if __name__ == "__main__":
    start_services()
```

## 📋 开发工作流

### 日常开发流程

1. **启动开发环境**
   ```bash
   # 启动数据库服务
   python scripts/dev-start.py
   
   # 启动后端服务 (新终端)
   cd backend
   uv run uvicorn src.main:app --reload
   
   # 启动前端服务 (新终端)
   cd frontend
   pnpm dev
   ```

2. **代码开发**
   ```bash
   # 创建新功能分支
   git checkout -b feature/new-feature
   
   # 开发代码...
   
   # 运行代码质量检查
   python scripts/quality-check.py
   
   # 运行测试
   python scripts/run-tests.py
   ```

3. **提交代码**
   ```bash
   # 添加文件
   git add .
   
   # 提交代码
   git commit -m "feat: 添加新功能"
   
   # 推送分支
   git push origin feature/new-feature
   ```

### 团队协作规范

1. **分支管理**
   - `main`: 主分支，保持稳定
   - `develop`: 开发分支，集成新功能
   - `feature/*`: 功能分支
   - `hotfix/*`: 热修复分支

2. **提交规范**
   - `feat`: 新功能
   - `fix`: 修复问题
   - `docs`: 文档更新
   - `style`: 代码格式调整
   - `refactor`: 重构代码
   - `test`: 测试相关
   - `chore`: 构建工具、依赖更新

3. **代码审查**
   - 所有代码必须通过 Pull Request
   - 至少一人审查后才能合并
   - 必须通过所有自动化检查

## 🎯 总结

通过本指南，你已经建立了一个完整的企业级开发环境，包括：

### ✅ 已完成配置

1. **核心工具链** - Git、Docker、Node.js、Python、uv
2. **前端环境** - Next.js 15 + React 19 + TypeScript 5.7
3. **后端环境** - Python 3.12.9 + FastAPI + SQLAlchemy 2.0
4. **数据库环境** - PostgreSQL 16 + Redis 7 + InfluxDB 2.7
5. **开发工具** - VS Code 配置、管理脚本、自动化流程

### 🚀 下一步建议

1. **团队同步** - 确保所有开发者使用相同的环境配置
2. **CI/CD 集成** - 将开发环境配置应用到持续集成流程
3. **监控优化** - 添加开发环境性能监控和日志收集
4. **文档维护** - 随着项目发展持续更新环境配置文档

---

**文档版本**: v1.0.0  
**更新时间**: 2025-12-10  
**适用系统**: Windows 10/11, macOS 12+, Ubuntu 20.04+  
**维护者**: 技术团队