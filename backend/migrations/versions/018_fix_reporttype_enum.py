"""Fix reporttype enum to include all required values

Revision ID: 018
Revises: 017
Create Date: 2025-01-26 14:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '018'
down_revision = '017'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    修复 reporttype 枚举，确保包含所有需要的值

    处理以下情况：
    1. reporttype 枚举不存在 -> 直接创建
    2. reporttype 枚举存在但值不完整 -> 重新创建
    3. report_templates.report_type 是 String 类型 -> 转换为枚举
    """

    # 步骤1: 检查并创建/修复 reporttype 枚举
    op.execute("""
        DO $$
        BEGIN
            -- 检查 reporttype 枚举是否存在
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reporttype') THEN
                -- 情况1: 枚举不存在，直接创建包含所有7个值的枚举
                RAISE NOTICE 'Creating reporttype enum with all values...';
                CREATE TYPE reporttype AS ENUM (
                    'inspection', 'performance', 'availability',
                    'alert', 'custom', 'trend', 'statistics'
                );
            ELSE
                -- 情况2: 枚举存在，但可能值不完整
                RAISE NOTICE 'reporttype enum exists, recreating with complete values...';

                -- 创建新的完整枚举
                CREATE TYPE reporttype_complete AS ENUM (
                    'inspection', 'performance', 'availability',
                    'alert', 'custom', 'trend', 'statistics'
                );

                -- 更新 report_templates 表使用新枚举
                -- 使用 text 作为中间类型避免枚举转换问题
                ALTER TABLE report_templates
                ALTER COLUMN report_type TYPE reporttype_complete
                USING report_type::text::reporttype_complete;

                -- 更新 reports 表使用新枚举（如果该列还在使用旧枚举）
                ALTER TABLE reports
                ALTER COLUMN report_type TYPE reporttype_complete
                USING report_type::text::reporttype_complete;

                -- 删除旧枚举
                DROP TYPE reporttype;

                -- 重命名新枚举为 reporttype
                ALTER TYPE reporttype_complete RENAME TO reporttype;
            END IF;
        END
        $$;
    """)

    # 步骤2: 确保 report_templates.report_type 使用枚举类型
    # 处理可能仍然是 String 类型的情况
    op.execute("""
        DO $$
        DECLARE
            col_type TEXT;
        BEGIN
            -- 获取当前列的类型
            SELECT udt_name INTO col_type
            FROM information_schema.columns
            WHERE table_name = 'report_templates'
            AND column_name = 'report_type';

            -- 如果列类型不是 reporttype 枚举
            IF col_type != 'reporttype' THEN
                RAISE NOTICE 'Converting report_templates.report_type from % to reporttype enum...', col_type;

                -- 先删除可能存在的 CHECK 约束
                BEGIN
                    ALTER TABLE report_templates DROP CONSTRAINT IF EXISTS ck_report_templates_type;
                EXCEPTION
                    WHEN OTHERS THEN
                        RAISE NOTICE 'No check constraint to drop, continuing...';
                END;

                -- 转换列类型为枚举
                ALTER TABLE report_templates
                ALTER COLUMN report_type TYPE reporttype
                USING report_type::text::reporttype;

                RAISE NOTICE 'Successfully converted report_templates.report_type to reporttype enum';
            ELSE
                RAISE NOTICE 'report_templates.report_type is already using reporttype enum';
            END IF;
        END
        $$;
    """)


def downgrade() -> None:
    """
    降级：将枚举类型改回 String + CHECK 约束

    注意：此操作会丢失枚举类型的优势，但保持数据完整性
    """

    # 步骤1: 将 report_templates.report_type 改回 VARCHAR
    op.execute("""
        ALTER TABLE report_templates
        ALTER COLUMN report_type TYPE VARCHAR(20)
        USING report_type::text;
    """)

    # 步骤2: 添加 CHECK 约束
    op.create_check_constraint(
        'ck_report_templates_type',
        'report_templates',
        "report_type IN ('inspection', 'performance', 'availability', 'alert', 'custom', 'trend', 'statistics')"
    )

    # 步骤3: 将 reports.report_type 改回 VARCHAR（如果需要）
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'reports'
                AND column_name = 'report_type'
                AND udt_name = 'reporttype'
            ) THEN
                ALTER TABLE reports
                ALTER COLUMN report_type TYPE VARCHAR(20)
                USING report_type::text;
            END IF;
        END
        $$;
    """)
