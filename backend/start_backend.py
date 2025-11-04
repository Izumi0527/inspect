#!/usr/bin/env python3
"""
完整的后端系统启动脚本
"""
import asyncio
import sys
import os
import uvicorn
from pathlib import Path

# 添加项目路径到sys.path
sys.path.insert(0, str(Path(__file__).parent))

from src.core.database import init_database, close_database
from src.core.logging import setup_logging
from src.main import app


async def startup_backend():
    """启动后端系统"""
    
    # 设置日志
    setup_logging()
    
    print("🚀 正在启动企业级网络设备巡检系统后端...")
    print("=" * 60)
    
    try:
        # 1. 初始化数据库
        print("🔄 初始化数据库连接和表结构...")
        await init_database()
        print("✅ 数据库初始化完成！")
        
        print("=" * 60)
        print("🎉 后端系统准备就绪！")
        print("")
        print("📋 系统功能概览：")
        print("   ✅ PostgreSQL数据库连接")
        print("   ✅ 用户认证与权限管理")
        print("   ✅ 设备管理CRUD操作")
        print("   ✅ 网络扫描与发现功能")
        print("   ✅ JWT令牌认证")
        print("   ✅ 异步数据库操作")
        print("")
        print("🌐 API服务地址：")
        print("   - 主页: http://localhost:8001")
        print("   - API文档: http://localhost:8001/docs")
        print("   - 健康检查: http://localhost:8001/health")
        print("")
        print("🔑 默认管理员账户（需执行数据库迁移）：")
        print("   - 用户名: admin")
        print("   - 密码: Admin123!")
        print("=" * 60)
        
        # 2. 启动FastAPI服务器
        print("🌟 正在启动API服务器...")
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=8001,
            reload=True,
            log_level="info",
            access_log=True
        )
        
    except Exception as e:
        print(f"❌ 后端启动失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    finally:
        # 清理资源
        try:
            await close_database()
            print("✅ 数据库连接已关闭")
        except:
            pass


def main():
    """主函数"""
    print("企业级网络设备巡检系统 - 后端服务")
    print("版本：1.0.0")
    print("技术栈：FastAPI + PostgreSQL + SQLAlchemy + JWT")
    print("")
    
    try:
        asyncio.run(startup_backend())
    except KeyboardInterrupt:
        print("\n👋 系统已停止")
        sys.exit(0)


if __name__ == "__main__":
    main()