"""
应用配置设置
"""
import os
import json
from pathlib import Path
from typing import List, Optional, Union
from pydantic_settings import BaseSettings
from pydantic import ConfigDict, field_validator, model_validator

# 获取项目根目录的 .env 文件路径
PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
ENV_FILE_PATH = PROJECT_ROOT / ".env"

class Settings(BaseSettings):
    """应用配置"""
    
    # 基础配置
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
    ALLOWED_HOSTS: List[str] = ["*"]
    
    # 数据库配置
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "postgresql+asyncpg://postgres:password@localhost:5432/inspect_db"
    )
    DATABASE_POOL_SIZE: int = int(os.getenv("DATABASE_POOL_SIZE", "5"))  # 减少连接池大小
    DATABASE_MAX_OVERFLOW: int = int(os.getenv("DATABASE_MAX_OVERFLOW", "10"))  # 减少溢出连接
    DATABASE_POOL_RECYCLE: int = int(os.getenv("DATABASE_POOL_RECYCLE", "3600"))  # 1小时
    DATABASE_ECHO: bool = os.getenv("DATABASE_ECHO", "false").lower() == "true"
    
    # Redis配置
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    
    # 邮件配置
    SMTP_HOST: str = os.getenv("SMTP_HOST", "localhost")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    FROM_EMAIL: str = os.getenv("FROM_EMAIL", "noreply@inspect.local")
    FROM_NAME: str = os.getenv("FROM_NAME", "网络设备巡检系统")
    
    # JWT配置
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", SECRET_KEY)
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # 时区配置
    TIMEZONE: str = os.getenv("TIMEZONE", "UTC")
    
    # CORS配置
    CORS_ORIGINS: Union[str, List[str]] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    
    # 日志配置
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_FORMAT: str = os.getenv("LOG_FORMAT", "dev")  # 改为dev格式便于开发时查看
    LOG_TO_CONSOLE: bool = os.getenv("LOG_TO_CONSOLE", "true").lower() == "true"
    LOG_FILE: str = os.getenv("LOG_FILE", str(PROJECT_ROOT / "logs" / "backend" / "app.log"))
    
    # InfluxDB配置
    INFLUXDB_URL: Optional[str] = os.getenv("INFLUXDB_URL", "")
    INFLUXDB_TOKEN: Optional[str] = os.getenv("INFLUXDB_TOKEN", "")
    INFLUXDB_ORG: Optional[str] = os.getenv("INFLUXDB_ORG", "")
    INFLUXDB_BUCKET: Optional[str] = os.getenv("INFLUXDB_BUCKET", "monitoring")

    # 应用配置
    APP_VERSION: str = os.getenv("APP_VERSION", "1.0.0")
    APP_NAME: str = os.getenv("APP_NAME", "网络设备巡检系统")
    LICENSE_EXPIRY: str = os.getenv("LICENSE_EXPIRY", "2025-12-31")

    @field_validator("ALLOWED_HOSTS", mode="before")
    @classmethod
    def parse_allowed_hosts(cls, v):
        if isinstance(v, str):
            return [host.strip() for host in v.split(",")]
        return v
    
    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        # 处理空值或 None
        if not v or (isinstance(v, str) and v.strip() == ""):
            print("Warning: CORS_ORIGINS is empty, using default values")
            return ["http://localhost:3000", "http://127.0.0.1:3000"]
        
        # 如果已经是列表，直接返回
        if isinstance(v, list):
            return v
        
        # 处理字符串格式
        if isinstance(v, str):
            v = v.strip()
            
            # 尝试解析为 JSON 数组
            if v.startswith('[') and v.endswith(']'):
                try:
                    return json.loads(v)
                except json.JSONDecodeError:
                    print(f"Warning: Failed to parse CORS_ORIGINS as JSON: {v}")
                    pass
            
            # 处理逗号分隔的字符串
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        
        print(f"Warning: Unexpected CORS_ORIGINS type: {type(v)}, using default")
        return ["http://localhost:3000", "http://127.0.0.1:3000"]
    
    model_config = ConfigDict(env_file=str(ENV_FILE_PATH), extra="ignore")
    
    @model_validator(mode="before")
    @classmethod
    def filter_empty_env_vars(cls, values):
        """过滤掉空的环境变量，避免覆盖默认值"""
        if isinstance(values, dict):
            # 创建新的值字典，过滤掉空的环境变量
            filtered_values = {}
            for key, value in values.items():
                if key == "CORS_ORIGINS" and (not value or (isinstance(value, str) and value.strip() == "")):
                    # 跳过空的 CORS_ORIGINS，让它使用默认值
                    continue
                filtered_values[key] = value
            return filtered_values
        return values

# 创建设置实例
settings = Settings()