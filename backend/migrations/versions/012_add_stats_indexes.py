"""Add indexes for statistics queries optimization

Revision ID: 012_add_stats_indexes
Revises: 011_add_category
Create Date: 2025-11-02 10:30:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '012_add_stats_indexes'
down_revision = '011_add_category'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add composite indexes for statistics queries optimization"""

    # ==================== Inspections 表统计查询优化索引 ====================

    # 1. 复合索引：created_at + status
    # 用于统计摘要查询（get_stats_summary）和趋势数据查询（get_trend_data）
    # 查询模式：WHERE created_at >= ? AND created_at <= ? AND status = ?
    op.create_index(
        'idx_inspections_created_status',
        'inspections',
        ['created_at', 'status'],
        postgresql_using='btree'
    )

    # 2. 复合索引：status + created_at
    # 用于按状态过滤后的时间范围查询（反向顺序，优化不同查询模式）
    op.create_index(
        'idx_inspections_status_created',
        'inspections',
        ['status', 'created_at'],
        postgresql_using='btree'
    )

    # 3. 复合索引：created_at + total_checks
    # 用于计算平均评分时过滤掉 total_checks = 0 的记录
    op.create_index(
        'idx_inspections_created_total_checks',
        'inspections',
        ['created_at', 'total_checks'],
        postgresql_using='btree',
        postgresql_where=sa.text('total_checks > 0')  # 部分索引，只索引有检查项的记录
    )

    # ==================== InspectionResults 表统计查询优化索引 ====================

    # 4. 复合索引：check_item_type + status
    # 用于问题分类分布查询（get_problem_category_distribution）
    # 查询模式：WHERE status IN ('fail', 'warning') GROUP BY check_item_type
    op.create_index(
        'idx_inspection_results_type_status',
        'inspection_results',
        ['check_item_type', 'status'],
        postgresql_using='btree'
    )

    # 5. 复合索引：status + check_item_type
    # 反向顺序，优化先按状态过滤的查询
    op.create_index(
        'idx_inspection_results_status_type',
        'inspection_results',
        ['status', 'check_item_type'],
        postgresql_using='btree',
        postgresql_where=sa.text("status IN ('fail', 'warning')")  # 部分索引，只索引失败和警告记录
    )

    # 6. 复合索引：inspection_id + check_item_type
    # 用于关联查询巡检结果时按类型分组
    op.create_index(
        'idx_inspection_results_inspection_type',
        'inspection_results',
        ['inspection_id', 'check_item_type'],
        postgresql_using='btree'
    )

    # ==================== Devices 表统计查询优化索引 ====================

    # devices 表的 device_type 单列索引已在 003_create_device_tables.py 中创建
    # 这里添加复合索引以进一步优化

    # 7. 复合索引：device_type + is_active
    # 用于设备类型分布查询，只统计活跃设备
    op.create_index(
        'idx_devices_type_active',
        'devices',
        ['device_type', 'is_active'],
        postgresql_using='btree',
        postgresql_where=sa.text('is_active = true')  # 部分索引，只索引活跃设备
    )

    # ==================== InspectionStrategies 表统计查询优化索引 ====================

    # 8. 复合索引：enabled + type
    # 用于策略统计查询
    op.create_index(
        'idx_inspection_strategies_enabled_type',
        'inspection_strategies',
        ['enabled', 'type'],
        postgresql_using='btree'
    )


def downgrade() -> None:
    """Remove statistics optimization indexes"""

    # 删除索引（按创建的反向顺序）
    op.drop_index('idx_inspection_strategies_enabled_type', table_name='inspection_strategies')
    op.drop_index('idx_devices_type_active', table_name='devices')
    op.drop_index('idx_inspection_results_inspection_type', table_name='inspection_results')
    op.drop_index('idx_inspection_results_status_type', table_name='inspection_results')
    op.drop_index('idx_inspection_results_type_status', table_name='inspection_results')
    op.drop_index('idx_inspections_created_total_checks', table_name='inspections')
    op.drop_index('idx_inspections_status_created', table_name='inspections')
    op.drop_index('idx_inspections_created_status', table_name='inspections')
