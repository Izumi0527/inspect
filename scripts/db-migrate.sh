#!/bin/bash

# 网络设备巡检系统 - 数据库迁移脚本

set -e

echo "🗄️ 执行数据库迁移..."

# 检查环境
check_environment() {
    echo "📋 检查环境..."
    
    # 检查后端虚拟环境
    if [ ! -d "backend/.venv" ]; then
        echo "❌ 后端虚拟环境不存在，请先运行 ./scripts/dev-start.sh"
        exit 1
    fi
    
    echo "✅ 环境检查完成"
}

# 执行数据库迁移
run_migrations() {
    echo "🔄 执行数据库迁移..."
    
    cd backend
    
    # 激活虚拟环境
    source .venv/bin/activate
    
    # 检查数据库连接
    echo "📡 检查数据库连接..."
    python -c "
from src.core.config import settings
import asyncpg
import asyncio

async def check_db():
    try:
        conn = await asyncpg.connect(settings.DATABASE_URL.replace('+asyncpg', ''))
        await conn.close()
        print('✅ 数据库连接成功')
    except Exception as e:
        print(f'❌ 数据库连接失败: {e}')
        exit(1)

asyncio.run(check_db())
"
    
    # 生成迁移文件（如果需要）
    if [ "$1" = "create" ]; then
        if [ -z "$2" ]; then
            echo "❌ 请提供迁移文件名称"
            echo "用法: ./scripts/db-migrate.sh create migration_name"
            exit 1
        fi
        
        echo "📝 创建迁移文件: $2"
        alembic revision --autogenerate -m "$2"
    fi
    
    # 执行迁移
    echo "⬆️  应用数据库迁移..."
    alembic upgrade head
    
    cd ..
    
    echo "✅ 数据库迁移完成"
}

# 显示迁移状态
show_migration_status() {
    echo "📊 数据库迁移状态..."
    
    cd backend
    source .venv/bin/activate
    
    alembic current
    alembic history
    
    cd ..
}

# 主函数
main() {
    check_environment
    run_migrations "$@"
    show_migration_status
}

# 运行主函数
main "$@"