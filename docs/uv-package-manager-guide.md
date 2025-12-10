# ⚡ uv 包管理器完全使用指南

## 📋 概述

uv 是由 Astral 团队开发的现代化 Python 包管理器，使用 Rust 编写，提供比传统 pip 快 10-100 倍的包安装速度。本指南详细介绍了在企业级网络设备巡检系统项目中如何高效使用 uv。

### 🚀 核心优势

| 特性 | pip | uv | 性能提升 |
|------|-----|----|---------| 
| **依赖解析** | 30-60s | 2-5s | **10x 更快** |
| **包安装** | 60-120s | 10-20s | **6x 更快** |
| **虚拟环境创建** | 5-10s | 1-2s | **5x 更快** |
| **锁文件生成** | 10-20s | 2-3s | **7x 更快** |
| **缓存效率** | 基础缓存 | 智能缓存 | **显著提升** |
| **并行下载** | 串行 | 并行 | **网络利用率最大化** |

## 🛠️ 安装与配置

### 安装 uv

#### Windows 安装

```powershell
# 方法 1: 使用 PowerShell (推荐)
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"

# 方法 2: 使用 pip
pip install uv

# 方法 3: 使用 winget
winget install --id=astral-sh.uv -e

# 验证安装
uv --version
```

#### Linux/macOS 安装

```bash
# 方法 1: 使用 curl (推荐)
curl -LsSf https://astral.sh/uv/install.sh | sh

# 方法 2: 使用 pip
pip install uv

# 方法 3: 使用 Homebrew (macOS)
brew install uv

# 验证安装
uv --version
```

### 全局配置

```bash
# 配置国内镜像源 (可选)
uv config set index-url https://pypi.tuna.tsinghua.edu.cn/simple/

# 配置缓存目录
uv config set cache-dir /path/to/cache

# 查看所有配置
uv config list

# 重置配置
uv config unset index-url
```

## 🏗️ 项目管理

### 项目初始化

```bash
# 创建新项目
uv init my-project
cd my-project

# 从现有项目初始化
cd existing-project
uv init --lib  # 库项目
uv init --app  # 应用项目

# 初始化时指定 Python 版本
uv init --python 3.12
```

### pyproject.toml 配置

```toml
[project]
name = "inspect-system-backend"
version = "1.0.0"
description = "企业级网络设备巡检系统后端服务"
requires-python = ">=3.11,<3.13"

# 生产依赖
dependencies = [
    "fastapi>=0.104.0",
    "uvicorn[standard]>=0.24.0",
    "sqlalchemy>=2.0.0",
    "redis>=5.0.0",
]

# 可选依赖组
[project.optional-dependencies]
dev = [
    "pytest>=7.4.0",
    "black>=23.9.0",
    "isort>=5.12.0",
    "mypy>=1.6.0",
]
test = [
    "pytest>=7.4.0",
    "pytest-asyncio>=0.21.0",
    "pytest-cov>=4.1.0",
]
docs = [
    "mkdocs>=1.5.0",
    "mkdocs-material>=9.0.0",
]

# uv 特定配置
[tool.uv]
dev-dependencies = [
    "pre-commit>=3.4.0",
    "ruff>=0.1.0",
]

# 指定 Python 版本约束
[tool.uv.sources]
# 可以指定特定包的源
# some-package = { git = "https://github.com/user/repo.git" }
```

## 🐍 Python 版本管理

### 安装 Python 版本

```bash
# 列出可用的 Python 版本
uv python list --all

# 安装特定版本
uv python install 3.12.9
uv python install 3.11.8

# 安装最新版本
uv python install 3.12

# 查看已安装版本
uv python list

# 设置默认版本
uv python pin 3.12.9
```

### Python 版本切换

```bash
# 为项目指定 Python 版本
uv python pin 3.12.9

# 临时使用特定版本
uv --python 3.11 run python --version

# 查看当前项目使用的版本
uv python find
```

## 🌐 虚拟环境管理

### 创建虚拟环境

```bash
# 创建虚拟环境 (使用项目指定的 Python 版本)
uv venv

# 指定 Python 版本创建
uv venv --python 3.12.9

# 指定虚拟环境名称
uv venv my-env

# 指定虚拟环境路径
uv venv /path/to/venv

# 创建时不安装 pip
uv venv --no-pip
```

### 虚拟环境操作

```bash
# 激活虚拟环境 (传统方式)
# Windows
.venv\Scripts\activate
# Linux/macOS
source .venv/bin/activate

# 使用 uv run (推荐方式，无需激活)
uv run python --version
uv run python script.py
uv run pytest

# 删除虚拟环境
Remove-Item -Recurse -Force .venv  # Windows
rm -rf .venv                       # Linux/macOS
```

## 📦 依赖管理

### 安装依赖

```bash
# 安装项目依赖
uv sync

# 安装包括开发依赖
uv sync --all-extras
uv sync --extra dev
uv sync --extra test

# 仅安装生产依赖
uv sync --no-dev

# 强制重新安装
uv sync --refresh

# 从锁文件安装 (生产环境)
uv sync --frozen
```

### 添加依赖

```bash
# 添加生产依赖
uv add fastapi
uv add "sqlalchemy>=2.0.0"

# 添加开发依赖
uv add --dev pytest
uv add --dev black isort mypy

# 添加可选依赖
uv add --optional test pytest-cov

# 从 Git 仓库添加
uv add git+https://github.com/user/repo.git

# 从本地路径添加
uv add --editable ./local-package

# 添加时指定版本约束
uv add "django>=4.0,<5.0"
```

### 移除依赖

```bash
# 移除依赖
uv remove fastapi

# 移除多个依赖
uv remove fastapi sqlalchemy

# 移除开发依赖
uv remove --dev pytest
```

### 更新依赖

```bash
# 更新所有依赖
uv sync --upgrade

# 更新特定依赖
uv sync --upgrade-package fastapi

# 更新到最新兼容版本
uv sync --upgrade-package "fastapi>=0.100"

# 查看过时的依赖
uv tree --outdated
```

## 🔒 锁文件管理

### 生成和使用锁文件

```bash
# 生成锁文件 (自动)
uv sync  # 自动生成 uv.lock

# 从锁文件安装 (确保一致性)
uv sync --frozen

# 更新锁文件
uv lock

# 验证锁文件
uv lock --check

# 导出为 requirements.txt
uv export --format requirements-txt > requirements.txt

# 导出开发依赖
uv export --format requirements-txt --extra dev > requirements-dev.txt
```

### 锁文件最佳实践

```bash
# 生产环境部署
uv sync --frozen --no-dev

# 开发环境同步
uv sync --all-extras

# CI/CD 环境
uv sync --frozen --extra test
```

## 🏃‍♂️ 运行命令

### 基本运行

```bash
# 运行 Python 脚本
uv run python script.py

# 运行模块
uv run -m pytest
uv run -m black src/

# 运行项目脚本 (定义在 pyproject.toml 中)
uv run inspect-dev
uv run inspect-migrate

# 传递参数
uv run python script.py --arg1 value1 --arg2 value2
```

### 高级运行选项

```bash
# 使用特定 Python 版本运行
uv run --python 3.11 python script.py

# 临时添加依赖运行
uv run --with requests python -c "import requests; print(requests.get('https://httpbin.org/json').json())"

# 从 URL 运行脚本
uv run --with httpx https://raw.githubusercontent.com/user/repo/main/script.py

# 设置环境变量
uv run --env DEBUG=1 python app.py
```

## 🔧 工具集成

### 与 IDE 集成

#### VS Code 配置

```json
{
    "python.defaultInterpreterPath": "./.venv/bin/python",
    "python.terminal.activateEnvironment": false,
    "python.terminal.activateEnvInCurrentTerminal": false,
    "python.testing.pytestEnabled": true,
    "python.testing.pytestArgs": ["tests"],
    "python.linting.enabled": true,
    "python.linting.flake8Enabled": true,
    "python.formatting.provider": "black",
    "python.sortImports.args": ["--profile", "black"]
}
```

#### PyCharm 配置

1. 打开 Settings → Project → Python Interpreter
2. 选择 "Add Interpreter" → "Existing Environment"
3. 选择 `.venv/bin/python` (Linux/macOS) 或 `.venv/Scripts/python.exe` (Windows)

### 与 Git 集成

```bash
# .gitignore 配置
echo ".venv/" >> .gitignore
echo "__pycache__/" >> .gitignore
echo "*.pyc" >> .gitignore

# 提交锁文件
git add uv.lock
git commit -m "添加依赖锁文件"
```

### 与 Docker 集成

```dockerfile
# Dockerfile 优化
FROM python:3.12-slim

# 安装 uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# 设置工作目录
WORKDIR /app

# 复制依赖文件
COPY pyproject.toml uv.lock ./

# 安装依赖
RUN uv sync --frozen --no-cache --no-dev

# 复制应用代码
COPY . .

# 运行应用
CMD ["uv", "run", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## 🚀 性能优化

### 缓存优化

```bash
# 查看缓存信息
uv cache info

# 清理缓存
uv cache clean

# 预热缓存
uv sync --refresh

# 设置缓存目录
export UV_CACHE_DIR=/path/to/cache
uv sync
```

### 网络优化

```bash
# 使用镜像源
uv sync --index-url https://pypi.tuna.tsinghua.edu.cn/simple/

# 配置代理
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080
uv sync

# 并行下载优化
export UV_CONCURRENT_DOWNLOADS=10
uv sync
```

### 构建优化

```bash
# 禁用字节码生成 (减少空间)
export PYTHONDONTWRITEBYTECODE=1
uv sync

# 使用系统 CA 证书
export UV_SYSTEM_PYTHON=1
uv sync
```

## 🧪 测试与质量

### 测试运行

```bash
# 运行测试
uv run pytest

# 运行测试并生成覆盖率
uv run pytest --cov=src --cov-report=html

# 运行特定测试
uv run pytest tests/test_api.py::test_function

# 并行测试
uv run pytest -n auto
```

### 代码质量检查

```bash
# 代码格式化
uv run black src/ tests/
uv run isort src/ tests/

# 代码检查
uv run flake8 src/ tests/
uv run mypy src/

# 一键质量检查脚本
uv run python -c "
import subprocess
import sys

def run_command(cmd):
    result = subprocess.run(cmd, shell=True)
    if result.returncode != 0:
        sys.exit(1)

print('🔍 运行代码格式化...')
run_command('uv run black src/ tests/')
run_command('uv run isort src/ tests/')

print('🔍 运行代码检查...')
run_command('uv run flake8 src/ tests/')
run_command('uv run mypy src/')

print('🧪 运行测试...')
run_command('uv run pytest --cov=src')

print('✅ 所有检查通过!')
"
```

## 🔄 CI/CD 集成

### GitHub Actions

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ['3.11', '3.12']
    
    steps:
    - uses: actions/checkout@v4
    
    - name: 安装 uv
      uses: astral-sh/setup-uv@v1
      with:
        version: "latest"
    
    - name: 设置 Python ${{ matrix.python-version }}
      run: uv python install ${{ matrix.python-version }}
    
    - name: 创建虚拟环境
      run: uv venv --python ${{ matrix.python-version }}
    
    - name: 安装依赖
      run: uv sync --all-extras --frozen
    
    - name: 运行代码检查
      run: |
        uv run black --check src/ tests/
        uv run isort --check-only src/ tests/
        uv run flake8 src/ tests/
        uv run mypy src/
    
    - name: 运行测试
      run: uv run pytest --cov=src --cov-report=xml
    
    - name: 上传覆盖率报告
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage.xml
```

### GitLab CI

```yaml
# .gitlab-ci.yml
image: python:3.12-slim

variables:
  PIP_CACHE_DIR: "$CI_PROJECT_DIR/.cache/pip"
  UV_CACHE_DIR: "$CI_PROJECT_DIR/.cache/uv"

cache:
  paths:
    - .cache/pip
    - .cache/uv
    - .venv/

before_script:
  - pip install uv
  - uv venv
  - uv sync --frozen --all-extras

stages:
  - test
  - build
  - deploy

test:
  stage: test
  script:
    - uv run pytest --cov=src --cov-report=xml
    - uv run black --check src/
    - uv run mypy src/
  coverage: '/TOTAL.*\s+(\d+%)$/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage.xml

build:
  stage: build
  script:
    - uv build
  artifacts:
    paths:
      - dist/
```

## 🚨 故障排除

### 常见问题

#### 问题 1: uv 命令未找到

```bash
# 症状
uv: command not found

# 解决方案
# 1. 重新安装 uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# 2. 添加到 PATH
echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# 3. 验证安装
which uv
uv --version
```

#### 问题 2: 依赖解析失败

```bash
# 症状
error: Failed to resolve dependencies

# 解决方案
# 1. 清理缓存
uv cache clean

# 2. 更新 uv
uv self update

# 3. 使用详细输出查看错误
uv sync --verbose

# 4. 检查网络连接
uv sync --index-url https://pypi.org/simple/
```

#### 问题 3: 虚拟环境问题

```bash
# 症状
Virtual environment not found

# 解决方案
# 1. 重新创建虚拟环境
rm -rf .venv
uv venv

# 2. 检查 Python 版本
uv python list
uv python install 3.12

# 3. 指定 Python 版本
uv venv --python 3.12
```

#### 问题 4: 锁文件冲突

```bash
# 症状
Lock file is out of date

# 解决方案
# 1. 更新锁文件
uv lock

# 2. 强制同步
uv sync --refresh

# 3. 重新生成锁文件
rm uv.lock
uv sync
```

### 调试技巧

```bash
# 启用详细输出
uv --verbose sync

# 查看依赖树
uv tree

# 检查依赖冲突
uv tree --conflicts

# 查看包信息
uv show fastapi

# 检查环境状态
uv python find
uv cache info
```

## 📊 性能监控

### 基准测试

```bash
# 创建性能测试脚本
cat > benchmark.py << 'EOF'
import time
import subprocess
import sys

def benchmark_command(cmd, description):
    print(f"\n🔍 测试: {description}")
    print(f"命令: {cmd}")
    
    start_time = time.time()
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    end_time = time.time()
    
    duration = end_time - start_time
    print(f"⏱️  耗时: {duration:.2f} 秒")
    
    if result.returncode == 0:
        print("✅ 成功")
    else:
        print("❌ 失败")
        print(result.stderr)
    
    return duration

# 测试不同操作的性能
print("🚀 uv 性能基准测试")
print("=" * 50)

# 虚拟环境创建
benchmark_command("rm -rf .venv && uv venv", "虚拟环境创建")

# 依赖安装
benchmark_command("uv sync", "依赖安装")

# 依赖更新
benchmark_command("uv sync --upgrade", "依赖更新")

# 锁文件生成
benchmark_command("rm uv.lock && uv lock", "锁文件生成")

print("\n🎯 基准测试完成!")
EOF

# 运行基准测试
uv run python benchmark.py
```

### 性能优化建议

```bash
# 1. 启用并行下载
export UV_CONCURRENT_DOWNLOADS=10

# 2. 使用本地缓存
export UV_CACHE_DIR=/fast/ssd/cache

# 3. 预编译轮子
uv sync --compile-bytecode

# 4. 使用镜像源
uv config set index-url https://pypi.tuna.tsinghua.edu.cn/simple/

# 5. 监控性能
time uv sync
```

## 🎯 最佳实践总结

### 项目结构最佳实践

```
project/
├── pyproject.toml          # 项目配置和依赖
├── uv.lock                # 锁文件 (提交到版本控制)
├── .python-version        # Python 版本固定
├── .venv/                 # 虚拟环境 (不提交)
├── src/                   # 源代码
├── tests/                 # 测试代码
├── scripts/               # 脚本文件
└── docs/                  # 文档
```

### 依赖管理最佳实践

1. **版本固定**
   ```bash
   # 生产环境使用精确版本
   uv add "fastapi==0.104.1"
   
   # 开发环境可以使用范围版本
   uv add --dev "pytest>=7.0,<8.0"
   ```

2. **分组管理**
   ```toml
   [project.optional-dependencies]
   dev = ["black", "isort", "mypy"]
   test = ["pytest", "pytest-cov"]
   docs = ["mkdocs", "mkdocs-material"]
   ```

3. **锁文件管理**
   ```bash
   # 开发环境
   uv sync --all-extras
   
   # 生产环境
   uv sync --frozen --no-dev
   
   # CI/CD 环境
   uv sync --frozen --extra test
   ```

### 团队协作最佳实践

1. **统一环境**
   ```bash
   # .python-version 文件
   echo "3.12.9" > .python-version
   
   # 团队成员同步环境
   uv python install $(cat .python-version)
   uv venv --python $(cat .python-version)
   uv sync --all-extras
   ```

2. **CI/CD 集成**
   ```yaml
   # 确保 CI 环境一致性
   - name: 安装依赖
     run: uv sync --frozen --all-extras
   ```

3. **文档维护**
   ```bash
   # 定期更新依赖文档
   uv tree > docs/dependencies.txt
   uv export --format requirements-txt > requirements.txt
   ```

---

**文档版本**: v1.0.0  
**更新时间**: 2025-12-10  
**uv 版本**: 0.8.12+  
**适用项目**: 企业级网络设备巡检系统