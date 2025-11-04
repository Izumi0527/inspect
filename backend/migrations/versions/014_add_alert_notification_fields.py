"""添加告警规则通知配置字段

添加以下字段以支持旧版API功能迁移：
- cooldown_minutes: 告警冷却时间（分钟）
- email_recipients: 邮件收件人列表（JSON）

Revision ID: 014
Revises: 013_update_alert_tables_schema
Create Date: 2025-01-27

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = '014'
down_revision = '013_update_alert_tables_schema'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    添加告警规则通知配置字段
    使用幂等性检查确保脚本可重复执行
    """

    # 添加 cooldown_minutes 字段
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='alert_rules' AND column_name='cooldown_minutes'
            ) THEN
                ALTER TABLE alert_rules
                ADD COLUMN cooldown_minutes INTEGER NOT NULL DEFAULT 30;

                COMMENT ON COLUMN alert_rules.cooldown_minutes IS '冷却时间（分钟）';
            END IF;
        END
        $$;
    """)

    # 添加 email_recipients 字段
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='alert_rules' AND column_name='email_recipients'
            ) THEN
                ALTER TABLE alert_rules
                ADD COLUMN email_recipients JSONB;

                COMMENT ON COLUMN alert_rules.email_recipients IS '邮件收件人列表';
            END IF;
        END
        $$;
    """)

    print("✅ 成功添加告警规则通知配置字段")


def downgrade() -> None:
    """
    回滚操作：删除添加的字段
    使用幂等性检查确保脚本可重复执行
    """

    # 删除 email_recipients 字段
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='alert_rules' AND column_name='email_recipients'
            ) THEN
                ALTER TABLE alert_rules DROP COLUMN email_recipients;
            END IF;
        END
        $$;
    """)

    # 删除 cooldown_minutes 字段
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='alert_rules' AND column_name='cooldown_minutes'
            ) THEN
                ALTER TABLE alert_rules DROP COLUMN cooldown_minutes;
            END IF;
        END
        $$;
    """)

    print("✅ 成功回滚告警规则通知配置字段")
