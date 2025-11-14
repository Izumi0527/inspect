"""update_audit_logs_table_structure

Revision ID: 019
Revises: 018
Create Date: 2025-11-07 11:12:44.573717

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '019'
down_revision = '018'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    更新 audit_logs 表结构以匹配新的 AuditLog 模型:
    1. 重命名 resource → resource_type
    2. 重命名 timestamp → created_at
    3. 添加 description 字段
    4. 添加 error_message 字段
    5. 删除不再使用的字段（method, path, duration）
    """

    # 1. 重命名列：resource → resource_type
    op.alter_column('audit_logs', 'resource', new_column_name='resource_type')

    # 2. 添加 description 字段（先设为可空，填充默认值后再改为必填）
    op.add_column('audit_logs', sa.Column('description', sa.Text(), nullable=True))

    # 填充默认值
    op.execute("""
        UPDATE audit_logs
        SET description = COALESCE(
            CONCAT(action, ' on ', resource_type,
                   CASE WHEN resource_id IS NOT NULL THEN CONCAT(' (ID: ', resource_id, ')') ELSE '' END
            ),
            'Legacy audit log entry'
        )
        WHERE description IS NULL
    """)

    # 将 description 改为必填
    op.alter_column('audit_logs', 'description', nullable=False)

    # 3. 添加 error_message 字段（可空）
    op.add_column('audit_logs', sa.Column('error_message', sa.Text(), nullable=True))

    # 4. 重命名列：timestamp → created_at
    op.alter_column('audit_logs', 'timestamp', new_column_name='created_at')

    # 5. 删除不再使用的列
    op.drop_column('audit_logs', 'method')
    op.drop_column('audit_logs', 'path')
    op.drop_column('audit_logs', 'duration')

    # 6. 更新索引
    # 删除旧索引（如果存在）
    op.execute('DROP INDEX IF EXISTS idx_audit_logs_resource')
    op.execute('DROP INDEX IF EXISTS idx_audit_logs_timestamp')

    # 创建新索引
    op.create_index('idx_audit_resource', 'audit_logs', ['resource_type', 'resource_id'])
    op.create_index('idx_audit_created_at', 'audit_logs', ['created_at'])


def downgrade() -> None:
    """
    回滚 audit_logs 表结构变更
    """

    # 删除新索引
    op.drop_index('idx_audit_created_at', table_name='audit_logs')
    op.drop_index('idx_audit_resource', table_name='audit_logs')

    # 恢复旧列
    op.add_column('audit_logs', sa.Column('method', sa.VARCHAR(length=10), nullable=True))
    op.add_column('audit_logs', sa.Column('path', sa.VARCHAR(length=500), nullable=True))
    op.add_column('audit_logs', sa.Column('duration', sa.INTEGER(), nullable=True))

    # 重命名列
    op.alter_column('audit_logs', 'created_at', new_column_name='timestamp')

    # 删除新列
    op.drop_column('audit_logs', 'error_message')
    op.drop_column('audit_logs', 'description')

    # 重命名列
    op.alter_column('audit_logs', 'resource_type', new_column_name='resource')

    # 恢复旧索引
    op.create_index('idx_audit_logs_timestamp', 'audit_logs', ['timestamp'])
    op.create_index('idx_audit_logs_resource', 'audit_logs', ['resource', 'resource_id'])