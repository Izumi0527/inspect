"""Update alert tables schema to match new design

Revision ID: 013_update_alert_tables_schema
Revises: 012_add_stats_indexes
Create Date: 2025-01-26 10:00:00.000000

Updates:
1. alert_rules: Update field lengths, add created_by, remove obsolete fields
2. alerts: Add reactivation fields, update field lengths, change user FK types
3. Add alert_operation_history table for audit trail
4. maintenance_windows: Update created_by field type
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = '013_update_alert_tables_schema'
down_revision = '012_add_stats_indexes'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Update alert tables to match new design"""

    # ==================== 更新 alert_rules 表 ====================

    # 修改字段长度
    op.alter_column('alert_rules', 'name',
                   existing_type=sa.String(100),
                   type_=sa.String(255),
                   existing_nullable=False,
                   comment='规则名称')

    op.alter_column('alert_rules', 'category',
                   existing_type=sa.String(20),
                   type_=sa.String(50),
                   existing_nullable=False,
                   comment='告警类别')

    op.alter_column('alert_rules', 'operator',
                   existing_type=sa.String(20),
                   type_=sa.String(10),
                   existing_nullable=False,
                   comment='比较运算符')

    # 添加 created_by 字段（如果不存在）
    # 先检查列是否存在，如果不存在则添加
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_name='alert_rules' AND column_name='created_by') THEN
                ALTER TABLE alert_rules ADD COLUMN created_by VARCHAR(36) REFERENCES users(id);
                COMMENT ON COLUMN alert_rules.created_by IS '创建人ID';
            END IF;
        END
        $$;
    """)

    # 删除废弃字段（如果存在）
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name='alert_rules' AND column_name='escalation_time') THEN
                ALTER TABLE alert_rules DROP COLUMN escalation_time;
            END IF;
        END
        $$;
    """)

    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name='alert_rules' AND column_name='sms_enabled') THEN
                ALTER TABLE alert_rules DROP COLUMN sms_enabled;
            END IF;
        END
        $$;
    """)

    # 更新约束（删除旧的，添加新的）
    op.execute("ALTER TABLE alert_rules DROP CONSTRAINT IF EXISTS ck_alert_rules_operator")
    op.create_check_constraint(
        'ck_alert_rules_operator',
        'alert_rules',
        "operator IN ('>', '<', '>=', '<=', '==', '!=')"
    )

    # 添加索引（如果不存在）
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_alert_rules_created_at') THEN
                CREATE INDEX idx_alert_rules_created_at ON alert_rules(created_at DESC);
            END IF;
        END
        $$;
    """)

    # ==================== 更新 alerts 表 ====================

    # 修改字段长度
    op.alter_column('alerts', 'title',
                   existing_type=sa.String(200),
                   type_=sa.String(500),
                   existing_nullable=False,
                   comment='告警标题')

    op.alter_column('alerts', 'category',
                   existing_type=sa.String(20),
                   type_=sa.String(50),
                   existing_nullable=False,
                   comment='告警类别')

    # 添加 reactivation 相关字段
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_name='alerts' AND column_name='reactivated_at') THEN
                ALTER TABLE alerts ADD COLUMN reactivated_at TIMESTAMP WITH TIME ZONE;
                COMMENT ON COLUMN alerts.reactivated_at IS '重新激活时间';
            END IF;
        END
        $$;
    """)

    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_name='alerts' AND column_name='reactivated_by') THEN
                ALTER TABLE alerts ADD COLUMN reactivated_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL;
                COMMENT ON COLUMN alerts.reactivated_by IS '重新激活人ID';
            END IF;
        END
        $$;
    """)

    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_name='alerts' AND column_name='reactivation_reason') THEN
                ALTER TABLE alerts ADD COLUMN reactivation_reason TEXT;
                COMMENT ON COLUMN alerts.reactivation_reason IS '重新激活原因';
            END IF;
        END
        $$;
    """)

    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_name='alerts' AND column_name='closed_by') THEN
                ALTER TABLE alerts ADD COLUMN closed_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL;
                COMMENT ON COLUMN alerts.closed_by IS '关闭人ID';
            END IF;
        END
        $$;
    """)

    # 为 first_occurred 和 last_occurred 添加默认值（如果没有）
    op.execute("""
        ALTER TABLE alerts ALTER COLUMN first_occurred
        SET DEFAULT CURRENT_TIMESTAMP;

        ALTER TABLE alerts ALTER COLUMN last_occurred
        SET DEFAULT CURRENT_TIMESTAMP;
    """)

    # 添加索引（如果不存在）
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_alerts_reactivated_at') THEN
                CREATE INDEX idx_alerts_reactivated_at ON alerts(reactivated_at);
            END IF;

            IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_alerts_closed_at') THEN
                CREATE INDEX idx_alerts_closed_at ON alerts(closed_at);
            END IF;

            IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_alerts_status_created') THEN
                CREATE INDEX idx_alerts_status_created ON alerts(status, created_at DESC);
            END IF;
        END
        $$;
    """)

    # ==================== 创建 alert_operation_history 表 ====================

    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                          WHERE table_name='alert_operation_history') THEN
                CREATE TABLE alert_operation_history (
                    id SERIAL PRIMARY KEY,
                    alert_id INTEGER NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,

                    -- 操作信息
                    operation_type VARCHAR(50) NOT NULL,
                    operator_id VARCHAR(36) NOT NULL,
                    operator_name VARCHAR(100) NOT NULL,
                    operation_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

                    -- 操作内容
                    note TEXT,
                    previous_status VARCHAR(20),
                    new_status VARCHAR(20),

                    -- 元数据（JSON格式存储额外信息）
                    metadata JSON DEFAULT '{}'::json,

                    -- 约束
                    CONSTRAINT ck_alert_operation_history_type
                        CHECK (operation_type IN ('create', 'acknowledge', 'resolve', 'reactivate', 'close', 'delete', 'update'))
                );

                -- 添加注释
                COMMENT ON TABLE alert_operation_history IS '告警操作历史表';
                COMMENT ON COLUMN alert_operation_history.alert_id IS '告警ID';
                COMMENT ON COLUMN alert_operation_history.operation_type IS '操作类型';
                COMMENT ON COLUMN alert_operation_history.operator_id IS '操作人ID';
                COMMENT ON COLUMN alert_operation_history.operator_name IS '操作人名称';
                COMMENT ON COLUMN alert_operation_history.operation_time IS '操作时间';
                COMMENT ON COLUMN alert_operation_history.note IS '操作备注';
                COMMENT ON COLUMN alert_operation_history.previous_status IS '操作前状态';
                COMMENT ON COLUMN alert_operation_history.new_status IS '操作后状态';
                COMMENT ON COLUMN alert_operation_history.metadata IS '元数据';

                -- 创建索引
                CREATE INDEX idx_alert_operation_history_alert_id ON alert_operation_history(alert_id);
                CREATE INDEX idx_alert_operation_history_operation_type ON alert_operation_history(operation_type);
                CREATE INDEX idx_alert_operation_history_operator_id ON alert_operation_history(operator_id);
                CREATE INDEX idx_alert_operation_history_operation_time ON alert_operation_history(operation_time DESC);
            END IF;
        END
        $$;
    """)

    # ==================== 更新 maintenance_windows 表 ====================

    # 添加索引（如果不存在）
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_maintenance_windows_created_at') THEN
                CREATE INDEX idx_maintenance_windows_created_at ON maintenance_windows(created_at DESC);
            END IF;
        END
        $$;
    """)


def downgrade() -> None:
    """Rollback alert tables schema updates"""

    # ==================== 回滚 maintenance_windows 表 ====================

    op.execute("DROP INDEX IF EXISTS idx_maintenance_windows_created_at")

    # ==================== 删除 alert_operation_history 表 ====================

    op.execute("DROP TABLE IF EXISTS alert_operation_history CASCADE")

    # ==================== 回滚 alerts 表 ====================

    # 删除新增索引
    op.execute("DROP INDEX IF EXISTS idx_alerts_status_created")
    op.execute("DROP INDEX IF EXISTS idx_alerts_closed_at")
    op.execute("DROP INDEX IF EXISTS idx_alerts_reactivated_at")

    # 删除默认值
    op.execute("""
        ALTER TABLE alerts ALTER COLUMN first_occurred DROP DEFAULT;
        ALTER TABLE alerts ALTER COLUMN last_occurred DROP DEFAULT;
    """)

    # 删除新增字段
    op.execute("ALTER TABLE alerts DROP COLUMN IF EXISTS closed_by")
    op.execute("ALTER TABLE alerts DROP COLUMN IF EXISTS reactivation_reason")
    op.execute("ALTER TABLE alerts DROP COLUMN IF EXISTS reactivated_by")
    op.execute("ALTER TABLE alerts DROP COLUMN IF EXISTS reactivated_at")

    # 回滚字段长度
    op.alter_column('alerts', 'category',
                   existing_type=sa.String(50),
                   type_=sa.String(20))

    op.alter_column('alerts', 'title',
                   existing_type=sa.String(500),
                   type_=sa.String(200))

    # ==================== 回滚 alert_rules 表 ====================

    # 删除新增索引
    op.execute("DROP INDEX IF EXISTS idx_alert_rules_created_at")

    # 回滚约束
    op.execute("ALTER TABLE alert_rules DROP CONSTRAINT IF EXISTS ck_alert_rules_operator")
    op.create_check_constraint(
        'ck_alert_rules_operator',
        'alert_rules',
        "operator IN ('>', '<', '=', '!=', '>=', '<=')"
    )

    # 恢复删除的字段
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_name='alert_rules' AND column_name='sms_enabled') THEN
                ALTER TABLE alert_rules ADD COLUMN sms_enabled BOOLEAN DEFAULT FALSE;
                COMMENT ON COLUMN alert_rules.sms_enabled IS '启用短信通知';
            END IF;
        END
        $$;
    """)

    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_name='alert_rules' AND column_name='escalation_time') THEN
                ALTER TABLE alert_rules ADD COLUMN escalation_time INTEGER DEFAULT 3600;
                COMMENT ON COLUMN alert_rules.escalation_time IS '升级时间(秒)';
            END IF;
        END
        $$;
    """)

    # 删除 created_by 字段
    op.execute("ALTER TABLE alert_rules DROP COLUMN IF EXISTS created_by")

    # 回滚字段长度
    op.alter_column('alert_rules', 'operator',
                   existing_type=sa.String(10),
                   type_=sa.String(20))

    op.alter_column('alert_rules', 'category',
                   existing_type=sa.String(50),
                   type_=sa.String(20))

    op.alter_column('alert_rules', 'name',
                   existing_type=sa.String(255),
                   type_=sa.String(100))
