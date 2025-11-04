#!/usr/bin/env python3
"""
数据库连接测试脚本
"""
import asyncio
import sys
import os
from pathlib import Path

# 添加项目路径到sys.path
sys.path.insert(0, str(Path(__file__).parent))

from src.core.database import init_database, close_database
from src.core.logging import setup_logging


async def test_database():
    """测试数据库连接和表创建"""
    
    # 设置日志
    setup_logging()
    
    print("🔄 正在测试数据库连接...")
    
    try:
        # 初始化数据库
        await init_database()
        print("✅ 数据库连接成功！")
        print("✅ 数据表创建完成！")
        
        # 关闭数据库连接
        await close_database()
        print("✅ 数据库连接已关闭")
        
        print("\n🎉 数据库配置测试通过！")
        
    except Exception as e:
        print(f"❌ 数据库测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(test_database())