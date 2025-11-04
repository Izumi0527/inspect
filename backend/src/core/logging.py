import structlog
import sys
import logging
import logging.handlers
from pathlib import Path
from src.core.config import settings

def setup_logging():
    """配置结构化日志 - 同时输出到控制台和文件"""

    # 确保控制台输出使用UTF-8编码（特别是Windows）
    import io
    if hasattr(sys.stdout, 'reconfigure'):
        try:
            sys.stdout.reconfigure(encoding='utf-8')
            sys.stderr.reconfigure(encoding='utf-8')
        except Exception:
            pass

    # 确保日志目录存在
    log_file = Path(settings.LOG_FILE)
    log_file.parent.mkdir(parents=True, exist_ok=True)

    # 清除现有的处理器，避免重复
    root_logger = logging.getLogger()
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # 设置根日志级别
    log_level = getattr(logging, settings.LOG_LEVEL.upper())
    root_logger.setLevel(log_level)

    # 创建处理器
    handlers = []

    # 1. 控制台处理器（仅在需要时添加）
    if getattr(settings, 'LOG_TO_CONSOLE', True):
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(log_level)
        console_formatter = logging.Formatter(
            '%(message)s'
        )
        console_handler.setFormatter(console_formatter)
        handlers.append(console_handler)

    # 2. 文件处理器（支持轮转）
    file_handler = logging.handlers.RotatingFileHandler(
        settings.LOG_FILE,
        maxBytes=100*1024*1024,  # 100MB
        backupCount=5,
        encoding='utf-8'
    )
    file_handler.setLevel(log_level)
    file_formatter = logging.Formatter(
        '%(message)s'
    )
    file_handler.setFormatter(file_formatter)
    handlers.append(file_handler)

    # 添加所有处理器到根logger
    for handler in handlers:
        root_logger.addHandler(handler)

    # 配置structlog处理器
    if settings.LOG_FORMAT == "json":
        processors = [
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer()
        ]
    else:
        processors = [
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="%Y-%m-%d %H:%M:%S"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.dev.ConsoleRenderer(colors=True)
        ]

    structlog.configure(
        processors=processors,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # 输出初始化信息
    logger = structlog.get_logger("logging_setup")
    logger.info("日志系统初始化完成",
               log_level=settings.LOG_LEVEL,
               log_file=str(settings.LOG_FILE),
               console_output=getattr(settings, 'LOG_TO_CONSOLE', True),
               log_format=settings.LOG_FORMAT)