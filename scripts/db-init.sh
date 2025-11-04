#!/bin/bash

# 企业级网络设备巡检系统 - 数据库初始化脚本
# 用于开发环境的数据库设置和初始化

set -e  # 遇到错误时退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查当前目录
if [[ ! -f "pyproject.toml" ]]; then
    log_error "请在后端项目根目录下运行此脚本"
    exit 1
fi

log_info "开始初始化数据库..."

# 1. 确保必要目录存在
log_info "创建必要的目录..."
mkdir -p data logs migrations/versions

# 2. 检查并激活虚拟环境
if [[ ! -d ".venv" ]]; then
    log_info "创建Python虚拟环境..."
    uv venv
fi

# 激活虚拟环境
log_info "激活虚拟环境..."
source .venv/Scripts/activate 2>/dev/null || source .venv/bin/activate

# 3. 安装依赖
log_info "安装Python依赖包..."
uv pip install -e .

# 4. 设置环境变量
if [[ ! -f ".env" ]]; then
    log_info "复制开发环境配置文件..."
    cp .env.dev .env
else
    log_warning ".env 文件已存在，跳过复制"
fi

# 5. 删除旧的SQLite数据库（如果存在）
if [[ -f "data/inspect_dev.db" ]]; then
    log_warning "删除现有的开发数据库..."
    rm -f data/inspect_dev.db
fi

# 6. 运行数据库迁移
log_info "运行数据库迁移..."

# 检查是否有迁移文件
if [[ ! -f "migrations/versions/001_create_user_tables.py" ]]; then
    log_error "未找到迁移文件，请先创建迁移"
    exit 1
fi

# 运行迁移（使用相对路径的SQLite）
export DATABASE_URL="sqlite+aiosqlite:///./data/inspect_dev.db"

# 创建迁移版本表并运行迁移
alembic upgrade head

# 7. 验证数据库
if [[ -f "data/inspect_dev.db" ]]; then
    log_success "SQLite数据库创建成功: data/inspect_dev.db"
    
    # 显示数据库大小
    db_size=$(du -h data/inspect_dev.db | cut -f1)
    log_info "数据库大小: $db_size"
    
    # 显示表信息（如果有sqlite3命令）
    if command -v sqlite3 &> /dev/null; then
        log_info "数据库表结构:"
        sqlite3 data/inspect_dev.db ".tables"
    fi
else
    log_error "数据库创建失败"
    exit 1
fi

# 8. 创建日志文件
touch logs/app_dev.log
log_success "日志文件已创建: logs/app_dev.log"

log_success "数据库初始化完成！"
echo
log_info "使用方法："
echo "  1. 启动开发服务器: uv run python src/main.py"
echo "  2. 查看API文档: http://localhost:8000/docs"
echo "  3. 数据库文件位置: backend/data/inspect_dev.db"
echo "  4. 日志文件位置: backend/logs/app_dev.log"
echo
log_info "如需重置数据库，请重新运行此脚本"