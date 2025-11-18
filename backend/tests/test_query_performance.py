"""
查询性能分析脚本
使用 EXPLAIN ANALYZE 分析关键统计查询的性能
"""
import asyncio
from datetime import datetime, timedelta
import structlog
from sqlalchemy import text

from src.core.database import get_db_session_context, init_database, close_database
from src.repositories.inspection_repository import InspectionRepository
from src.repositories.device_repository import DeviceRepository
from src.repositories.strategy_repository import StrategyRepository

logger = structlog.get_logger()


async def analyze_query(session, query_name: str, sql_query: str):
    """
    使用 EXPLAIN ANALYZE 分析查询性能

    Args:
        session: 数据库会话
        query_name: 查询名称
        sql_query: SQL查询语句
    """
    print(f"\n{'='*80}")
    print(f"分析查询: {query_name}")
    print(f"{'='*80}")

    # 执行 EXPLAIN ANALYZE
    explain_query = f"EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) {sql_query}"

    try:
        result = await session.execute(text(explain_query))
        rows = result.fetchall()

        print("\nEXPLAIN ANALYZE 结果:\n")
        for row in rows:
            print(row[0])
        print()

    except Exception as e:
        logger.error(f"分析查询失败: {query_name}", error=str(e))
        print(f"错误: {str(e)}\n")


async def analyze_inspection_stats_query():
    """分析巡检统计查询 (get_stats_summary)"""

    async with get_db_session_context() as session:
        now = datetime.now()
        start_date = now - timedelta(days=7)
        end_date = now

        # 1. 总执行次数查询
        total_query = f"""
            SELECT COUNT(inspections.id)
            FROM inspections
            WHERE inspections.created_at >= '{start_date}'
              AND inspections.created_at <= '{end_date}'
        """
        await analyze_query(session, "统计摘要 - 总执行次数", total_query)

        # 2. 成功执行次数查询
        success_query = f"""
            SELECT COUNT(inspections.id)
            FROM inspections
            WHERE inspections.status = 'completed'
              AND inspections.created_at >= '{start_date}'
              AND inspections.created_at <= '{end_date}'
        """
        await analyze_query(session, "统计摘要 - 成功执行次数", success_query)

        # 3. 平均评分查询
        avg_score_query = f"""
            SELECT AVG(
                CAST(inspections.passed_checks AS FLOAT) /
                NULLIF(inspections.total_checks, 0) * 100
            )
            FROM inspections
            WHERE inspections.status = 'completed'
              AND inspections.total_checks > 0
              AND inspections.created_at >= '{start_date}'
              AND inspections.created_at <= '{end_date}'
        """
        await analyze_query(session, "统计摘要 - 平均评分", avg_score_query)


async def analyze_problem_distribution_query():
    """分析问题分布查询 (get_problem_category_distribution)"""

    async with get_db_session_context() as session:
        # 问题分类分布查询
        problem_query = """
            SELECT
                inspection_results.check_item_type,
                COUNT(*) as count
            FROM inspection_results
            WHERE inspection_results.status IN ('fail', 'warning')
            GROUP BY inspection_results.check_item_type
            ORDER BY count DESC
        """
        await analyze_query(session, "问题分类分布", problem_query)


async def analyze_device_distribution_query():
    """分析设备分布查询 (get_device_type_distribution)"""

    async with get_db_session_context() as session:
        # 设备类型分布查询
        device_query = """
            SELECT
                devices.device_type,
                COUNT(*) as count
            FROM devices
            WHERE devices.is_active = true
            GROUP BY devices.device_type
            ORDER BY count DESC
        """
        await analyze_query(session, "设备类型分布", device_query)


async def analyze_strategy_stats_query():
    """分析策略统计查询 (get_strategy_statistics)"""

    async with get_db_session_context() as session:
        # 1. 总策略数
        total_strategies_query = """
            SELECT COUNT(inspection_strategies.id)
            FROM inspection_strategies
        """
        await analyze_query(session, "策略统计 - 总数", total_strategies_query)

        # 2. 活跃策略数
        active_strategies_query = """
            SELECT COUNT(inspection_strategies.id)
            FROM inspection_strategies
            WHERE inspection_strategies.enabled = true
        """
        await analyze_query(session, "策略统计 - 活跃数", active_strategies_query)


async def analyze_executions_paginated_query():
    """分析执行记录分页查询 (get_executions_paginated)"""

    async with get_db_session_context() as session:
        now = datetime.now()
        start_date = now - timedelta(days=7)
        end_date = now

        # 执行记录分页查询（带多表关联）
        exec_query = f"""
            SELECT inspections.*
            FROM inspections
            LEFT OUTER JOIN devices ON devices.id = inspections.device_id
            LEFT OUTER JOIN inspection_templates ON inspection_templates.id = inspections.template_id
            LEFT OUTER JOIN inspection_schedules ON inspection_schedules.id = inspections.schedule_id
            LEFT OUTER JOIN users ON users.id = inspections.created_by
            WHERE inspections.started_at >= '{start_date}'
              AND inspections.started_at < '{end_date}'
            ORDER BY inspections.started_at DESC
            LIMIT 10 OFFSET 0
        """
        await analyze_query(session, "执行记录分页查询（含关联）", exec_query)


async def main():
    """
    主函数：依次分析所有关键查询
    """
    print("\n" + "="*80)
    print("开始查询性能分析...")
    print("="*80 + "\n")

    # 初始化数据库连接
    try:
        print("正在初始化数据库连接...")
        await init_database()
        print("数据库连接初始化成功\n")
    except Exception as e:
        print(f"数据库初始化失败: {str(e)}")
        return

    try:
        # 1. 分析统计摘要查询
        print("\n### 1. 统计摘要查询分析")
        await analyze_inspection_stats_query()

        # 2. 分析问题分布查询
        print("\n### 2. 问题分布查询分析")
        await analyze_problem_distribution_query()

        # 3. 分析设备分布查询
        print("\n### 3. 设备分布查询分析")
        await analyze_device_distribution_query()

        # 4. 分析策略统计查询
        print("\n### 4. 策略统计查询分析")
        await analyze_strategy_stats_query()

        # 5. 分析执行记录分页查询
        print("\n### 5. 执行记录分页查询分析")
        await analyze_executions_paginated_query()

        print("\n" + "="*80)
        print("查询性能分析完成！")
        print("="*80 + "\n")

        print("\n优化建议:")
        print("1. 检查 EXPLAIN 输出中是否使用了索引 (Index Scan vs Seq Scan)")
        print("2. 关注执行时间 (Execution Time)")
        print("3. 关注扫描的行数 (rows)")
        print("4. 关注是否有昂贵的操作 (Sort, Hash, Nested Loop)")
        print("5. 如果发现 Seq Scan，考虑添加缺失的索引")

    finally:
        # 关闭数据库连接
        print("\n正在关闭数据库连接...")
        await close_database()
        print("数据库连接已关闭")


if __name__ == "__main__":
    asyncio.run(main())
