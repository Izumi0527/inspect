"""
添加报表类别和格式支持

Revision ID: 015_add_report_category_and_formats
Revises: 014_add_alert_notification_fields
Create Date: 2025-01-04 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '015'
down_revision = '014'
branch_labels = None
depends_on = None


def upgrade():
    """
    升级数据库：
    1. 添加报表category字段
    2. 扩展ReportType枚举（trend, statistics）
    3. 扩展ReportFormat枚举（html, word）
    4. 修改template_id为可空
    """
    # 创建新的枚举类型（包含新值）
    # 注意：PostgreSQL需要先创建新类型再修改列

    # 1. 创建新的ReportType枚举（包含trend和statistics）
    op.execute("""
        CREATE TYPE report_type_new AS ENUM (
            'inspection', 'performance', 'availability',
            'alert', 'custom', 'trend', 'statistics'
        );
    """)

    # 2. 创建新的ReportFormat枚举（包含html和word）
    op.execute("""
        CREATE TYPE report_format_new AS ENUM (
            'pdf', 'excel', 'csv', 'json', 'html', 'word'
        );
    """)

    # 3. 创建ReportCategory枚举
    op.execute("""
        CREATE TYPE report_category AS ENUM (
            'daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'
        );
    """)

    # 4. 修改template_id为可空
    op.alter_column('reports', 'template_id',
                   existing_type=sa.Integer(),
                   nullable=True)

    # 5. 添加category列
    op.add_column('reports',
                  sa.Column('category',
                           sa.Enum('daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom',
                                  name='report_category'),
                           server_default='custom',
                           nullable=True))

    # 6. 更新reports表的report_type列使用新枚举
    op.execute("""
        ALTER TABLE reports
        ALTER COLUMN report_type TYPE report_type_new
        USING report_type::text::report_type_new;
    """)

    # 7. 安全删除旧的枚举类型（如果存在）
    op.execute("""
        DO $$ BEGIN
            DROP TYPE IF EXISTS reporttype;
        EXCEPTION
            WHEN undefined_object THEN NULL;
        END $$;
    """)

    # 8. 重命名新枚举类型
    op.execute("ALTER TYPE report_type_new RENAME TO reporttype;")

    # Migration completed successfully
    pass


def downgrade():
    """
    降级数据库：移除新增的字段和枚举值
    """
    # 1. 删除category列
    op.drop_column('reports', 'category')

    # 2. 删除category枚举
    op.execute("DROP TYPE report_category;")

    # 3. 恢复旧的ReportType枚举
    op.execute("""
        CREATE TYPE reporttype_old AS ENUM (
            'inspection', 'performance', 'availability', 'alert', 'custom'
        );
    """)

    # 4. 更新reports表使用旧枚举
    op.execute("""
        ALTER TABLE reports
        ALTER COLUMN report_type TYPE reporttype_old
        USING report_type::text::reporttype_old;
    """)

    # 5. 删除新枚举，恢复旧名称
    op.execute("DROP TYPE reporttype;")
    op.execute("ALTER TYPE reporttype_old RENAME TO reporttype;")

    # 6. 恢复template_id为非空
    op.alter_column('reports', 'template_id',
                   existing_type=sa.Integer(),
                   nullable=False)

    # Migration rollback completed
    pass
