"""
报表API辅助函数和通用工具
提供数据转换、分页处理等通用功能
"""
from typing import Dict, Any, Optional, List
from datetime import datetime
from pydantic import BaseModel, Field

from src.models.report import ReportTemplate


# ============================================================================
# 常量定义
# ============================================================================

class ReportConstants:
    """报表相关常量"""
    DEFAULT_THEME = "default"
    TEMPLATE_TYPE = "template"
    CUSTOM_TYPE = "custom"
    DEFAULT_PAGE_SIZE = 20
    MAX_PAGE_SIZE = 100


# ============================================================================
# 分页辅助类
# ============================================================================

class PaginationParams(BaseModel):
    """分页参数"""
    page: int = Field(1, ge=1, description="页码")
    page_size: int = Field(
        ReportConstants.DEFAULT_PAGE_SIZE,
        ge=1,
        le=ReportConstants.MAX_PAGE_SIZE,
        description="每页数量"
    )

    @property
    def offset(self) -> int:
        """计算偏移量"""
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        """获取限制数量"""
        return self.page_size


class PaginatedResponse:
    """分页响应辅助类"""

    @staticmethod
    def create(
        items: List[Any],
        total: int,
        page: int,
        page_size: int
    ) -> Dict[str, Any]:
        """
        创建标准分页响应

        Args:
            items: 数据列表
            total: 总数量
            page: 当前页码
            page_size: 每页数量

        Returns:
            标准分页响应字典
        """
        return {
            "items": items,
            "total": total,
            "page": page,
            "pageSize": page_size,
            "totalPages": (total + page_size - 1) // page_size,
            "hasNext": page * page_size < total,
            "hasPrev": page > 1
        }


# ============================================================================
# 日期范围辅助类
# ============================================================================

class DateRangeParams(BaseModel):
    """日期范围参数"""
    start_date: Optional[datetime] = Field(None, description="开始日期")
    end_date: Optional[datetime] = Field(None, description="结束日期")

    def validate_range(self) -> bool:
        """验证日期范围有效性"""
        if self.start_date and self.end_date:
            return self.start_date <= self.end_date
        return True

    def to_iso_dict(self) -> Dict[str, Optional[str]]:
        """转换为ISO格式字典"""
        return {
            "startDate": self.start_date.isoformat() if self.start_date else None,
            "endDate": self.end_date.isoformat() if self.end_date else None
        }


# ============================================================================
# 模板转换辅助函数
# ============================================================================

def convert_template_to_frontend(
    template: ReportTemplate,
    include_usage: bool = True
) -> Dict[str, Any]:
    """
    将 ReportTemplate 模型转换为前端期望的格式

    Args:
        template: ReportTemplate 模型实例
        include_usage: 是否包含使用统计信息(lastUsed, usageCount)

    Returns:
        转换后的字典(camelCase格式)

    Example:
        >>> template = ReportTemplate(id=1, name="测试报表")
        >>> result = convert_template_to_frontend(template)
        >>> result['id']  # "1"
        >>> result['name']  # "测试报表"
    """
    # 基础信息
    result = {
        "id": str(template.id),
        "name": template.name,
        "description": template.description or "",
        "type": (
            ReportConstants.TEMPLATE_TYPE
            if template.is_default
            else ReportConstants.CUSTOM_TYPE
        ),
        "reportType": (
            template.report_type.value
            if template.report_type
            else ReportConstants.CUSTOM_TYPE
        ),
        "theme": template.theme or ReportConstants.DEFAULT_THEME,
        "createdAt": (
            template.created_at.isoformat()
            if template.created_at
            else None
        ),
        "updatedAt": (
            template.updated_at.isoformat()
            if template.updated_at
            else None
        ),
        "createdBy": template.created_by or "",
        "isDefault": template.is_default,
        "isActive": template.is_active,
    }

    # 可选的品牌信息
    if template.logo_url is not None:
        result["logoUrl"] = template.logo_url
    if template.header_text is not None:
        result["headerText"] = template.header_text
    if template.footer_text is not None:
        result["footerText"] = template.footer_text

    # 配置信息(确保不为None)
    result["config"] = template.config if template.config else {}
    result["chartConfigs"] = (
        template.chart_configs if template.chart_configs else []
    )
    result["tableConfigs"] = (
        template.table_configs if template.table_configs else []
    )

    # 使用统计(如果需要)
    if include_usage:
        # TODO: 从Report表统计实际使用情况
        result["lastUsed"] = None
        result["usageCount"] = 0

    return result


def convert_templates_to_frontend(
    templates: List[ReportTemplate],
    include_usage: bool = True
) -> List[Dict[str, Any]]:
    """
    批量转换 ReportTemplate 列表为前端格式

    Args:
        templates: ReportTemplate 模型实例列表
        include_usage: 是否包含使用统计信息

    Returns:
        转换后的字典列表
    """
    return [
        convert_template_to_frontend(template, include_usage)
        for template in templates
    ]


# ============================================================================
# 搜索辅助函数
# ============================================================================

def build_search_pattern(keyword: str) -> str:
    """
    构建SQL ILIKE搜索模式

    Args:
        keyword: 搜索关键词

    Returns:
        SQL ILIKE模式字符串 (%keyword%)
    """
    return f"%{keyword.strip()}%"


# ============================================================================
# 数据验证辅助函数
# ============================================================================

def validate_config_ownership(
    template: ReportTemplate,
    user_id: str,
    allow_admin: bool = True
) -> bool:
    """
    验证用户是否有权限操作该配置

    Args:
        template: 报表模板
        user_id: 用户ID
        allow_admin: 是否允许管理员操作

    Returns:
        是否有权限
    """
    # 默认模板不允许编辑
    if template.is_default:
        return False

    # 创建者可以编辑
    if template.created_by == user_id:
        return True

    # TODO: 可以添加管理员权限检查
    # if allow_admin and is_admin(user_id):
    #     return True

    return False


# ============================================================================
# 报表导出辅助函数
# ============================================================================

import secrets
import os
from pathlib import Path
from datetime import timedelta


def generate_download_token() -> str:
    """
    生成安全的下载令牌

    Returns:
        32字节的URL安全随机令牌
    """
    return secrets.token_urlsafe(32)


def get_file_size(file_path: str) -> int:
    """
    获取文件大小

    Args:
        file_path: 文件路径

    Returns:
        文件大小（字节）
    """
    try:
        return os.path.getsize(file_path)
    except Exception:
        return 0


def generate_file_name(
    report_type: str,
    format: str,
    timestamp: Optional[str] = None
) -> str:
    """
    生成文件名

    Args:
        report_type: 报表类型 (inspection/trend/statistics/custom)
        format: 文件格式 (xlsx/pdf/docx)
        timestamp: 时间戳（可选）

    Returns:
        文件名
    """
    if not timestamp:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    # 中文报表类型映射
    type_names = {
        "inspection": "巡检报表",
        "trend": "趋势分析",
        "statistics": "统计报表",
        "custom": "自定义报表"
    }

    type_name = type_names.get(report_type, "报表")
    return f"{type_name}_{timestamp}.{format}"


def create_export_response(
    report_type: str,
    file_format: str,
    file_name: Optional[str],
    base_url: str,
    temp_dir: Path,
    token_expiry_minutes: int = 15
) -> Dict[str, Any]:
    """
    创建标准的导出响应

    处理导出报表的通用流程：
    1. 生成文件名
    2. 创建临时文件路径
    3. 生成下载令牌
    4. 构建响应数据

    Args:
        report_type: 报表类型 (inspection/trend/statistics/custom)
        file_format: 文件格式 (excel/pdf/word)
        file_name: 文件名（可选，自动生成）
        base_url: 基础URL
        temp_dir: 临时目录
        token_expiry_minutes: 令牌过期时间（分钟，默认15）

    Returns:
        包含文件路径、下载URL、令牌等信息的响应字典

    Example:
        >>> response = create_export_response(
        ...     report_type="inspection",
        ...     file_format="excel",
        ...     file_name=None,
        ...     base_url="http://localhost:8000",
        ...     temp_dir=Path("backend/temp/reports")
        ... )
        >>> response.keys()
        dict_keys(['file_path', 'file_name', 'download_token', 'expires_at', 'file_url'])
    """
    # 格式扩展名映射
    format_extensions = {
        "excel": "xlsx",
        "pdf": "pdf",
        "word": "docx"
    }

    extension = format_extensions.get(file_format, "xlsx")

    # 生成文件名
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    generated_file_name = file_name or generate_file_name(
        report_type,
        extension,
        timestamp
    )

    # 构建文件路径
    file_path = str(temp_dir / f"{timestamp}_{generated_file_name}")

    # 生成下载令牌
    download_token = generate_download_token()

    # 计算过期时间
    expires_at = datetime.now() + timedelta(minutes=token_expiry_minutes)

    # 生成下载URL
    file_url = f"{base_url}/api/reports/download?token={download_token}"

    return {
        "file_path": file_path,
        "file_name": generated_file_name,
        "download_token": download_token,
        "expires_at": expires_at,
        "file_url": file_url,
        "format": file_format
    }
