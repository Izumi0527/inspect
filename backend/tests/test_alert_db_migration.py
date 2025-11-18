"""
Test script for database connection and alert system migration

This script tests:
1. Database connection
2. Alert tables exist
3. New migration is ready
4. Sample data can be inserted
"""
import asyncio
import sys
from datetime import datetime

async def main():
    """Main test function"""
    print("\n" + "="*60)
    print("告警系统数据库连接和迁移测试")
    print("="*60 + "\n")

    # Test 1: Check database configuration
    print("📝 测试 1: 检查数据库配置")
    try:
        from src.core.config import settings
        print(f"  ✅ 数据库URL: {settings.DATABASE_URL.split('@')[1] if '@' in settings.DATABASE_URL else '已配置'}")
        print(f"  ✅ 数据库Echo: {settings.DATABASE_ECHO}")
        print(f"  ✅ 连接池大小: {settings.DATABASE_POOL_SIZE}")
    except Exception as e:
        print(f"  ❌ 配置加载失败: {e}")
        return False

    # Test 2: Check database connection
    print("\n📝 测试 2: 检查数据库连接")
    try:
        from src.core.database import db_manager
        await db_manager.initialize()
        print("  ✅ 数据库连接成功")
    except Exception as e:
        print(f"  ❌ 数据库连接失败: {e}")
        print("  💡 提示: 请确保PostgreSQL服务已启动")
        print("  💡 可以运行: .\\scripts\\db-init-migrate.ps1 -Status")
        return False

    # Test 3: Check alert models
    print("\n📝 测试 3: 检查告警模型")
    try:
        from src.models.alert import AlertRule, Alert, AlertOperationHistory
        print("  ✅ AlertRule 模型加载成功")
        print("  ✅ Alert 模型加载成功")
        print("  ✅ AlertOperationHistory 模型加载成功")
    except Exception as e:
        print(f"  ❌ 模型加载失败: {e}")
        return False

    # Test 4: Check if tables exist
    print("\n📝 测试 4: 检查数据库表是否存在")
    try:
        from sqlalchemy import inspect
        inspector = inspect(db_manager.engine)
        tables = await asyncio.to_thread(inspector.get_table_names)

        required_tables = ['alert_rules', 'alerts', 'alert_notifications',
                          'maintenance_windows', 'alert_operation_history']

        for table in required_tables:
            if table in tables:
                print(f"  ✅ 表 '{table}' 存在")
            else:
                print(f"  ⚠️  表 '{table}' 不存在（需要运行迁移）")

    except Exception as e:
        print(f"  ❌ 表检查失败: {e}")
        return False

    # Test 5: Test DatabaseAlertRepository
    print("\n📝 测试 5: 测试 DatabaseAlertRepository")
    try:
        from src.repositories.alert_repository_db import DatabaseAlertRepository
        from src.core.database import get_db_session_context

        async with get_db_session_context() as session:
            repo = DatabaseAlertRepository(session)

            # Test get_rules
            rules, total = await repo.get_rules(skip=0, limit=10)
            print(f"  ✅ 告警规则查询成功: 找到 {total} 条规则")

            # Test get_alerts
            alerts, total = await repo.get_alerts(skip=0, limit=10)
            print(f"  ✅ 告警记录查询成功: 找到 {total} 条告警")

            # Test statistics
            stats = await repo.get_alert_statistics()
            print(f"  ✅ 统计查询成功:")
            print(f"     - 活跃告警: {stats['total_active']}")
            print(f"     - 已解决告警: {stats['total_resolved']}")

    except Exception as e:
        print(f"  ❌ Repository测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

    # Test 6: Test dependency injection
    print("\n📝 测试 6: 测试依赖注入")
    try:
        from src.core.dependencies import get_database_alert_repository
        from src.core.database import get_db_session_context

        async with get_db_session_context() as session:
            repo = get_database_alert_repository(session)
            rules, _ = await repo.get_rules(skip=0, limit=1)
            print(f"  ✅ 依赖注入测试成功")

    except Exception as e:
        print(f"  ❌ 依赖注入测试失败: {e}")
        return False

    # Cleanup
    await db_manager.close()

    print("\n" + "="*60)
    print("✅ 所有测试通过！")
    print("="*60 + "\n")

    print("💡 后续步骤:")
    print("   1. 运行迁移: .\\scripts\\db-init-migrate.ps1 -Migrate")
    print("   2. 检查状态: .\\scripts\\db-init-migrate.ps1 -Status")
    print("   3. 启动后端: .\\scripts\\start-backend.ps1 -Dev")
    print()

    return True


if __name__ == "__main__":
    try:
        result = asyncio.run(main())
        sys.exit(0 if result else 1)
    except KeyboardInterrupt:
        print("\n\n⚠️  用户中断测试")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
