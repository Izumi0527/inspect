-- 企业级网络设备巡检系统数据库初始化脚本
-- 此脚本在PostgreSQL容器首次启动时自动执行

-- 创建扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "timescaledb";

-- 设置时区
SET timezone = 'Asia/Shanghai';

-- 创建应用用户（如果不存在）
DO
$$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles  
      WHERE rolname = 'inspect_dev') THEN
      
      CREATE ROLE inspect_dev LOGIN PASSWORD 'dev_password_2024';
   END IF;
END
$$;

-- 授予权限
GRANT ALL PRIVILEGES ON DATABASE inspect_system_dev TO inspect_dev;

-- 设置连接池默认参数
ALTER DATABASE inspect_system_dev SET default_transaction_isolation TO 'read committed';
ALTER DATABASE inspect_system_dev SET timezone TO 'Asia/Shanghai';

-- 创建审计日志函数（为后续功能准备）
CREATE OR REPLACE FUNCTION audit_trigger_row()
RETURNS TRIGGER AS $$
BEGIN
    -- 记录行级变更日志
    -- 这里可以添加具体的审计逻辑
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 输出初始化完成信息
SELECT 
    'Database initialization completed at ' || NOW() as status,
    'inspect_system_dev' as database_name,
    'inspect_dev' as user_name;
