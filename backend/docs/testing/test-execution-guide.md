# Settings API 测试执行指南
**单元测试、覆盖率分析与 CI/CD 集成**

版本: v1.0.0
更新时间: 2025-01-XX

---

## 📋 目录

1. [概述](#概述)
2. [环境准备](#环境准备)
3. [运行测试](#运行测试)
4. [覆盖率分析](#覆盖率分析)
5. [调试测试](#调试测试)
6. [CI/CD 集成](#cicd-集成)
7. [常见问题](#常见问题)

---

## 概述

Settings API 拥有完整的单元测试覆盖，确保代码质量和可靠性。

### 测试统计
- ✅ **60 个测试用例**
- ✅ **99% 代码覆盖率**
- ✅ **100% 通过率**
- ✅ **6 个核心模块全覆盖**

### 测试框架
- **pytest**: 测试框架
- **pytest-asyncio**: 异步测试支持
- **pytest-cov**: 覆盖率统计
- **httpx**: HTTP 客户端测试
- **unittest.mock**: Mock 工具

---

## 环境准备

### 1. 安装依赖

项目使用 `uv` 管理 Python 环境和依赖。

```bash
# 安装 uv (如果尚未安装)
curl -LsSf https://astral.sh/uv/install.sh | sh

# 进入项目目录
cd backend

# 创建虚拟环境并安装依赖
uv sync
```

### 2. 配置测试环境

测试使用独立的配置，不会影响生产环境。

**pytest 配置文件** (`pyproject.toml`):
```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
asyncio_mode = "auto"
asyncio_default_fixture_loop_scope = "function"
addopts = [
    "-v",
    "--strict-markers",
    "--tb=short",
]
```

### 3. 验证环境

```bash
# 验证 Python 版本
python --version  # 应为 3.11+

# 验证 pytest 安装
uv run pytest --version

# 验证测试文件可以被发现
uv run pytest --collect-only tests/api/settings/
```

---

## 运行测试

### 基本命令

#### 运行所有测试
```bash
cd backend
uv run pytest tests/api/settings/ -v
```

**输出示例**:
```
============================= test session starts =============================
collected 60 items

tests\api\settings\test_audit.py .....                                   [  8%]
tests\api\settings\test_general.py ..............                        [ 31%]
tests\api\settings\test_monitoring.py .......                            [ 43%]
tests\api\settings\test_notifications.py ............                    [ 63%]
tests\api\settings\test_security.py .............                        [ 85%]
tests\api\settings\test_users.py .........                               [100%]

============================= 60 passed in 9.87s ==============================
```

#### 运行单个模块测试
```bash
# 测试通用配置模块
uv run pytest tests/api/settings/test_general.py -v

# 测试系统监控模块
uv run pytest tests/api/settings/test_monitoring.py -v

# 测试安全配置模块
uv run pytest tests/api/settings/test_security.py -v
```

#### 运行单个测试用例
```bash
# 运行特定测试函数
uv run pytest tests/api/settings/test_general.py::test_get_all_settings -v

# 使用关键词匹配
uv run pytest tests/api/settings/ -k "error" -v  # 运行所有包含 "error" 的测试
```

### 高级选项

#### 显示详细输出
```bash
# 显示 print 语句输出
uv run pytest tests/api/settings/ -v -s

# 显示局部变量 (调试时有用)
uv run pytest tests/api/settings/ -v -l
```

#### 失败时停止
```bash
# 遇到第一个失败就停止
uv run pytest tests/api/settings/ -x

# 最多失败 3 次后停止
uv run pytest tests/api/settings/ --maxfail=3
```

#### 并行执行 (加速测试)
```bash
# 安装 pytest-xdist
uv add --dev pytest-xdist

# 使用 4 个进程并行
uv run pytest tests/api/settings/ -n 4
```

---

## 覆盖率分析

### 生成覆盖率报告

#### 终端输出
```bash
uv run pytest tests/api/settings/ \
  --cov=src/api/settings \
  --cov-report=term-missing
```

**输出示例**:
```
Name                                Stmts   Miss  Cover   Missing
-----------------------------------------------------------------
src\api\settings\__init__.py           17      1    94%   29
src\api\settings\audit.py              17      0   100%
src\api\settings\general.py            66      0   100%
src\api\settings\monitoring.py         28      0   100%
src\api\settings\notifications.py      35      0   100%
src\api\settings\security.py           48      0   100%
src\api\settings\users.py              27      0   100%
-----------------------------------------------------------------
TOTAL                                 238      1    99%
```

#### HTML 报告
```bash
uv run pytest tests/api/settings/ \
  --cov=src/api/settings \
  --cov-report=html
```

生成的 HTML 报告位于 `htmlcov/index.html`，可以在浏览器中打开查看详细的逐行覆盖情况。

```bash
# Windows
start htmlcov/index.html

# macOS
open htmlcov/index.html

# Linux
xdg-open htmlcov/index.html
```

#### XML 报告 (用于 CI/CD)
```bash
uv run pytest tests/api/settings/ \
  --cov=src/api/settings \
  --cov-report=xml
```

生成的 `coverage.xml` 可以上传到 Codecov、Coveralls 等服务。

### 覆盖率阈值检查

在 `pyproject.toml` 中配置最低覆盖率要求:

```toml
[tool.coverage.report]
fail_under = 95
show_missing = true
exclude_lines = [
    "pragma: no cover",
    "def __repr__",
    "raise NotImplementedError",
    "if __name__ == .__main__.:",
    "pass",
]
```

运行时自动检查:
```bash
uv run pytest tests/api/settings/ --cov=src/api/settings --cov-fail-under=95
```

如果覆盖率低于 95%，pytest 将返回失败状态码。

---

## 调试测试

### 失败测试调试

#### 查看详细的失败信息
```bash
uv run pytest tests/api/settings/ -v --tb=long
```

**Traceback 模式**:
- `--tb=short`: 简短回溯 (默认)
- `--tb=long`: 完整回溯
- `--tb=native`: Python 标准回溯
- `--tb=no`: 不显示回溯

#### 使用 pdb 调试器
```bash
# 失败时进入 pdb
uv run pytest tests/api/settings/ --pdb

# 开始时就进入 pdb
uv run pytest tests/api/settings/ --trace
```

在测试代码中设置断点:
```python
def test_something(app):
    import pdb; pdb.set_trace()  # 断点
    # 测试代码...
```

#### 重新运行失败的测试
```bash
# 第一次运行
uv run pytest tests/api/settings/ --lf  # last failed

# 重新运行失败和之前失败的测试
uv run pytest tests/api/settings/ --ff  # failed first
```

### 性能分析

#### 显示最慢的测试
```bash
uv run pytest tests/api/settings/ --durations=10
```

**输出示例**:
```
============================= slowest 10 durations =============================
0.85s call     tests/api/settings/test_monitoring.py::test_get_current_metrics
0.78s call     tests/api/settings/test_security.py::test_sync_ldap_users_success
0.65s call     tests/api/settings/test_notifications.py::test_webhook_success
...
```

#### 性能优化建议
- 使用 mock 避免实际 I/O 操作
- 使用 fixture 复用测试数据
- 考虑并行执行 (pytest-xdist)

---

## CI/CD 集成

### GitHub Actions

创建 `.github/workflows/test.yml`:

```yaml
name: Settings API Tests

on:
  push:
    branches: [ main, develop ]
    paths:
      - 'backend/**'
  pull_request:
    branches: [ main, develop ]
    paths:
      - 'backend/**'

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ['3.11', '3.12']

    steps:
      - uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v4
        with:
          enable-cache: true

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ matrix.python-version }}

      - name: Install dependencies
        run: |
          cd backend
          uv sync

      - name: Run tests with coverage
        run: |
          cd backend
          uv run pytest tests/api/settings/ \
            --cov=src/api/settings \
            --cov-report=xml \
            --cov-report=term-missing \
            --cov-fail-under=95

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          file: ./backend/coverage.xml
          flags: settings-api
          name: settings-api-coverage

      - name: Comment coverage on PR
        uses: py-cov-action/python-coverage-comment-action@v3
        with:
          GITHUB_TOKEN: ${{ github.token }}
          COVERAGE_PATH: backend/coverage.xml
```

### GitLab CI

创建 `.gitlab-ci.yml`:

```yaml
stages:
  - test

test:settings-api:
  stage: test
  image: python:3.11
  before_script:
    - curl -LsSf https://astral.sh/uv/install.sh | sh
    - export PATH="$HOME/.cargo/bin:$PATH"
    - cd backend
    - uv sync
  script:
    - uv run pytest tests/api/settings/
      --cov=src/api/settings
      --cov-report=xml
      --cov-report=term
      --cov-fail-under=95
  coverage: '/TOTAL.*\s+(\d+%)$/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: backend/coverage.xml
  only:
    changes:
      - backend/**
```

### Jenkins

创建 `Jenkinsfile`:

```groovy
pipeline {
    agent any

    stages {
        stage('Setup') {
            steps {
                sh '''
                    curl -LsSf https://astral.sh/uv/install.sh | sh
                    export PATH="$HOME/.cargo/bin:$PATH"
                    cd backend
                    uv sync
                '''
            }
        }

        stage('Test') {
            steps {
                sh '''
                    cd backend
                    uv run pytest tests/api/settings/ \
                        --cov=src/api/settings \
                        --cov-report=xml \
                        --cov-report=html \
                        --junitxml=test-results.xml
                '''
            }
        }

        stage('Coverage') {
            steps {
                publishHTML([
                    reportDir: 'backend/htmlcov',
                    reportFiles: 'index.html',
                    reportName: 'Coverage Report'
                ])
                publishCoverage adapters: [
                    coberturaAdapter('backend/coverage.xml')
                ]
            }
        }
    }

    post {
        always {
            junit 'backend/test-results.xml'
        }
    }
}
```

### Pre-commit Hook

创建 `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: local
    hooks:
      - id: pytest-settings-api
        name: Run Settings API Tests
        entry: bash -c 'cd backend && uv run pytest tests/api/settings/ --cov=src/api/settings --cov-fail-under=95'
        language: system
        pass_filenames: false
        always_run: true
```

安装:
```bash
pip install pre-commit
pre-commit install
```

---

## 常见问题

### Q1: 测试运行很慢怎么办？

**A**: 使用并行执行:
```bash
uv add --dev pytest-xdist
uv run pytest tests/api/settings/ -n auto
```

### Q2: 某个测试偶尔失败怎么办？

**A**: 可能是异步或 mock 问题，使用 `--count` 重复运行:
```bash
uv add --dev pytest-repeat
uv run pytest tests/api/settings/test_xxx.py --count=10
```

### Q3: 如何跳过某些测试？

**A**: 使用 `@pytest.mark.skip`:
```python
@pytest.mark.skip(reason="Temporarily disabled")
async def test_something(app):
    pass
```

或使用条件跳过:
```python
@pytest.mark.skipif(sys.platform == "win32", reason="Not supported on Windows")
async def test_something(app):
    pass
```

### Q4: 如何测试特定的 Python 版本？

**A**: 使用 tox 进行多版本测试:

创建 `tox.ini`:
```ini
[tox]
envlist = py311,py312

[testenv]
deps =
    pytest
    pytest-asyncio
    pytest-cov
commands =
    pytest tests/api/settings/ --cov=src/api/settings
```

运行:
```bash
uv add --dev tox
uv run tox
```

### Q5: 覆盖率为什么不是 100%？

**A**: 检查未覆盖的代码行:
```bash
uv run pytest tests/api/settings/ --cov=src/api/settings --cov-report=term-missing
```

常见未覆盖原因:
- 异常处理分支未触发
- 条件分支未覆盖
- 初始化代码 (通常可以忽略)

### Q6: 如何mock数据库或外部服务？

**A**: 使用 `unittest.mock.patch`:
```python
from unittest.mock import patch

@pytest.mark.asyncio
async def test_with_mock(app):
    with patch("src.services.external_service.method") as mock:
        mock.return_value = "mocked_value"
        # 测试代码...
```

---

## 最佳实践

### 1. 测试命名规范
```python
# ✅ 清晰的命名
async def test_get_setting_returns_404_when_not_found(app):
    pass

# ❌ 不清晰的命名
async def test_setting(app):
    pass
```

### 2. 使用 Fixture 复用代码
```python
@pytest.fixture
def mock_settings_data():
    """可复用的 mock 数据"""
    return [
        SettingItem(key="key1", value="value1"),
        SettingItem(key="key2", value="value2"),
    ]

async def test_something(app, mock_settings_data):
    # 使用 fixture
    pass
```

### 3. 独立性原则
每个测试应该独立运行，不依赖其他测试的状态。

```python
# ✅ 独立的测试
async def test_create_user(app):
    # 创建测试数据
    user = await create_user(...)
    # 验证
    assert user is not None
    # 清理
    await delete_user(user.id)

# ❌ 依赖其他测试
async def test_update_user(app):
    # 假设用户已存在 (依赖 test_create_user)
    pass
```

### 4. 错误消息验证
```python
# ✅ 验证错误消息
assert response.status_code == 404
assert "not found" in response.json()["detail"]

# ❌ 只验证状态码
assert response.status_code == 404
```

### 5. 使用参数化测试
```python
@pytest.mark.parametrize("method,expected", [
    ("GET", 200),
    ("POST", 200),
    ("PUT", 200),
    ("PATCH", 200),
])
async def test_webhook_methods(app, method, expected):
    # 测试多种 HTTP 方法
    pass
```

---

## 测试报告

### 生成 HTML 测试报告

```bash
uv add --dev pytest-html
uv run pytest tests/api/settings/ --html=report.html --self-contained-html
```

### 生成 JSON 测试报告

```bash
uv add --dev pytest-json-report
uv run pytest tests/api/settings/ --json-report --json-report-file=report.json
```

### 集成到监控系统

可以将测试结果发送到监控系统 (如 Grafana、Prometheus):

```python
# conftest.py
import pytest
import requests

@pytest.hookimpl(trylast=True)
def pytest_sessionfinish(session, exitstatus):
    """测试结束后发送统计数据"""
    stats = {
        "passed": session.testscollected - session.testsfailed,
        "failed": session.testsfailed,
        "total": session.testscollected,
    }
    # 发送到监控系统
    requests.post("http://monitoring/api/test-results", json=stats)
```

---

## 相关资源

- **pytest 官方文档**: https://docs.pytest.org/
- **pytest-asyncio 文档**: https://pytest-asyncio.readthedocs.io/
- **Coverage.py 文档**: https://coverage.readthedocs.io/
- **httpx 文档**: https://www.python-httpx.org/

---

**文档版本**: v1.0.0
**最后更新**: 2025-01-XX
**维护团队**: Backend Team
