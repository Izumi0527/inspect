"""Update report_templates to use reporttype ENUM

Revision ID: 017
Revises: 016
Create Date: 2025-01-26 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '017'
down_revision = '016'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    将report_templates表的report_type列从String+CHECK约束改为reporttype ENUM
    """

    # 1. 删除旧的CHECK约束
    op.drop_constraint('ck_report_templates_type', 'report_templates', type_='check')

    # 2. 修改列类型为reporttype ENUM
    op.execute("""
        ALTER TABLE report_templates
        ALTER COLUMN report_type TYPE reporttype
        USING report_type::text::reporttype;
    """)

    # Migration completed successfully
    pass


def downgrade() -> None:
    """
    恢复report_templates表的report_type列为String+CHECK约束
    """

    # 1. 将列类型改回String
    op.execute("""
        ALTER TABLE report_templates
        ALTER COLUMN report_type TYPE VARCHAR(20)
        USING report_type::text;
    """)

    # 2. 恢复CHECK约束（只包含原始的5个值）
    op.create_check_constraint(
        'ck_report_templates_type',
        'report_templates',
        "report_type IN ('inspection', 'performance', 'availability', 'alert', 'custom')"
    )

    # Migration rollback completed
    pass
