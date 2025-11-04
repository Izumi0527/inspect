"""Add category field to inspection_templates

Revision ID: 011_add_category
Revises: 010_inspection_strategies
Create Date: 2025-11-02 03:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '011_add_category'
down_revision = '010_inspection_strategies'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add category column to inspection_templates table"""
    op.add_column('inspection_templates',
        sa.Column('category', sa.String(50), server_default='custom', nullable=False, comment='模板分类')
    )

    # 创建索引
    op.create_index('idx_inspection_templates_category', 'inspection_templates', ['category'])

    # 添加CHECK约束
    op.create_check_constraint(
        'ck_inspection_templates_category',
        'inspection_templates',
        "category IN ('network', 'system', 'security', 'custom')"
    )


def downgrade() -> None:
    """Remove category column from inspection_templates table"""
    op.drop_constraint('ck_inspection_templates_category', 'inspection_templates')
    op.drop_index('idx_inspection_templates_category')
    op.drop_column('inspection_templates', 'category')
