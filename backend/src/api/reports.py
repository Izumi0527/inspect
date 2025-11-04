"""
报表导出API端点
支持PDF和Word格式的各类报表导出
"""
from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import os
import structlog

from src.core.permissions import (
    get_current_active_user, 
    require_permission
)
from src.core.database import get_db_session
from src.services.report_export import report_exporter

logger = structlog.get_logger()
router = APIRouter()

# 请求模型
class ReportExportRequest(BaseModel):
    report_type: str  # device_summary, inspection_report, alert_report, performance_report
    format: str  # pdf, word
    title: Optional[str] = None
    subtitle: Optional[str] = None
    filters: Optional[Dict[str, Any]] = None
    date_range: Optional[Dict[str, str]] = None

class ReportExportResponse(BaseModel):
    success: bool
    message: str
    download_url: Optional[str] = None
    file_size: Optional[int] = None
    expires_at: Optional[datetime] = None

# ============= 报表导出端点 =============

@router.post(\"/export\", response_model=ReportExportResponse, summary=\"导出报表\")
async def export_report(
    request: ReportExportRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_permission(\"reports:export\"))
):
    \"\"\"
    导出指定类型的报表
    
    支持的报表类型：
    - device_summary: 设备汇总报表
    - inspection_report: 巡检结果报表
    - alert_report: 告警统计报表
    - performance_report: 性能分析报表
    
    支持的格式：
    - pdf: PDF格式
    - word: Word文档格式
    \"\"\"
    try:
        # 验证参数
        if request.format not in ['pdf', 'word']:
            raise HTTPException(status_code=400, detail=\"不支持的导出格式\")
        
        if request.report_type not in ['device_summary', 'inspection_report', 'alert_report', 'performance_report']:
            raise HTTPException(status_code=400, detail=\"不支持的报表类型\")
        
        # 获取报表数据
        report_data = await _get_report_data(request.report_type, request.filters, request.date_range)
        
        # 生成报表
        if request.format == 'pdf':
            file_path = await report_exporter.generate_pdf_report(
                report_type=request.report_type,
                data=report_data,
                title=request.title,
                subtitle=request.subtitle
            )
        else:  # word
            file_path = await report_exporter.generate_word_report(
                report_type=request.report_type,
                data=report_data,
                title=request.title,
                subtitle=request.subtitle
            )
        
        # 获取文件信息
        file_size = os.path.getsize(file_path)
        expires_at = datetime.now() + timedelta(hours=24)
        
        # 生成下载URL（这里简化处理，实际应该生成安全的临时URL）
        filename = os.path.basename(file_path)
        download_url = f\"/api/reports/download/{filename}\"
        
        logger.info(\"Report exported successfully\",
                   report_type=request.report_type,
                   format=request.format,
                   file_size=file_size,
                   user_id=current_user[\"id\"])
        
        # 添加后台任务清理临时文件
        background_tasks.add_task(
            _schedule_file_cleanup,
            file_path,
            24  # 24小时后清理
        )
        
        return ReportExportResponse(
            success=True,
            message=\"报表导出成功\",
            download_url=download_url,
            file_size=file_size,
            expires_at=expires_at
        )
        
    except Exception as e:
        logger.error(\"Failed to export report\",
                    report_type=request.report_type,
                    format=request.format,
                    error=str(e))
        raise HTTPException(status_code=500, detail=f\"报表导出失败: {str(e)}\")

@router.get(\"/download/{filename}\", summary=\"下载报表文件\")
async def download_report(
    filename: str,
    current_user: dict = Depends(require_permission(\"reports:download\"))
):
    \"\"\"
    下载生成的报表文件
    \"\"\"
    try:
        file_path = report_exporter.temp_dir / filename
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail=\"文件不存在或已过期\")
        
        # 确定媒体类型
        if filename.endswith('.pdf'):
            media_type = 'application/pdf'
        elif filename.endswith('.docx'):
            media_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        else:
            media_type = 'application/octet-stream'
        
        logger.info(\"Report downloaded\",
                   filename=filename,
                   user_id=current_user[\"id\"])
        
        return FileResponse(
            path=str(file_path),
            media_type=media_type,
            filename=filename
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(\"Failed to download report\",
                    filename=filename,
                    error=str(e))
        raise HTTPException(status_code=500, detail=f\"文件下载失败: {str(e)}\")

@router.get(\"/templates\", summary=\"获取报表模板列表\")
async def get_report_templates(
    current_user: dict = Depends(require_permission(\"reports:read\"))
):
    \"\"\"
    获取可用的报表模板列表
    \"\"\"
    return {
        \"templates\": [
            {
                \"type\": \"device_summary\",
                \"name\": \"设备汇总报表\",
                \"description\": \"包含设备统计信息、状态分布和设备列表\",
                \"fields\": [\"总设备数\", \"在线设备\", \"离线设备\", \"告警设备\", \"设备详情\"]\n            },\n            {\n                \"type\": \"inspection_report\",\n                \"name\": \"巡检结果报表\",\n                \"description\": \"设备巡检任务执行结果和问题汇总\",\n                \"fields\": [\"巡检任务\", \"执行状态\", \"发现问题\", \"处理建议\"]\n            },\n            {\n                \"type\": \"alert_report\",\n                \"name\": \"告警统计报表\", \n                \"description\": \"系统告警统计分析和趋势展示\",\n                \"fields\": [\"告警数量\", \"告警等级\", \"处理状态\", \"趋势分析\"]\n            },\n            {\n                \"type\": \"performance_report\",\n                \"name\": \"性能分析报表\",\n                \"description\": \"设备性能指标分析和优化建议\",\n                \"fields\": [\"CPU使用率\", \"内存使用率\", \"网络流量\", \"性能趋势\"]\n            }\n        ],\n        \"formats\": [\n            {\n                \"type\": \"pdf\",\n                \"name\": \"PDF格式\",\n                \"description\": \"便于打印和存档的PDF文档\",\n                \"mime_type\": \"application/pdf\"\n            },\n            {\n                \"type\": \"word\",\n                \"name\": \"Word文档\",\n                \"description\": \"可编辑的Word文档格式\",\n                \"mime_type\": \"application/vnd.openxmlformats-officedocument.wordprocessingml.document\"\n            }\n        ]\n    }\n\n@router.post(\"/preview\", summary=\"预览报表数据\")\nasync def preview_report_data(\n    report_type: str = Query(..., description=\"报表类型\"),\n    filters: Optional[dict] = None,\n    date_range: Optional[dict] = None,\n    current_user: dict = Depends(require_permission(\"reports:read\"))\n):\n    \"\"\"\n    预览报表数据，不生成文件\n    \"\"\"\n    try:\n        if report_type not in ['device_summary', 'inspection_report', 'alert_report', 'performance_report']:\n            raise HTTPException(status_code=400, detail=\"不支持的报表类型\")\n        \n        # 获取报表数据\n        report_data = await _get_report_data(report_type, filters, date_range)\n        \n        logger.info(\"Report data previewed\",\n                   report_type=report_type,\n                   user_id=current_user[\"id\"])\n        \n        return {\n            \"success\": True,\n            \"report_type\": report_type,\n            \"data\": report_data,\n            \"summary\": {\n                \"total_records\": len(report_data.get('devices', [])),\n                \"generated_at\": datetime.now().isoformat()\n            }\n        }\n        \n    except Exception as e:\n        logger.error(\"Failed to preview report data\",\n                    report_type=report_type,\n                    error=str(e))\n        raise HTTPException(status_code=500, detail=f\"预览数据失败: {str(e)}\")\n\n@router.delete(\"/cleanup\", summary=\"清理过期报表文件\")\nasync def cleanup_expired_reports(\n    hours: int = Query(24, ge=1, le=168, description=\"清理多少小时前的文件\"),\n    current_user: dict = Depends(require_permission(\"reports:admin\"))\n):\n    \"\"\"\n    清理过期的报表文件（管理员权限）\n    \"\"\"\n    try:\n        cleaned_count = await report_exporter.cleanup_old_reports(hours)\n        \n        logger.info(\"Report cleanup completed\",\n                   cleaned_count=cleaned_count,\n                   hours=hours,\n                   admin_user=current_user[\"id\"])\n        \n        return {\n            \"success\": True,\n            \"message\": f\"已清理 {cleaned_count} 个过期报表文件\",\n            \"cleaned_count\": cleaned_count\n        }\n        \n    except Exception as e:\n        logger.error(\"Failed to cleanup reports\",\n                    error=str(e))\n        raise HTTPException(status_code=500, detail=f\"清理报表失败: {str(e)}\")\n\n# ============= 辅助函数 =============\n\nasync def _get_report_data(report_type: str, filters: Optional[Dict[str, Any]], date_range: Optional[Dict[str, str]]) -> Dict[str, Any]:\n    \"\"\"\n    根据报表类型获取相应的数据\n    \"\"\"\n    # 这里应该根据不同的报表类型从数据库获取相应数据\n    # 现在使用模拟数据\n    \n    if report_type == 'device_summary':\n        return {\n            'total': 156,\n            'online': 142,\n            'offline': 8,\n            'warning': 6,\n            'devices': [\n                {\n                    'name': '核心交换机-01',\n                    'ip': '192.168.1.1',\n                    'device_type': 'switch',\n                    'status': 'online',\n                    'location': '数据中心A'\n                },\n                {\n                    'name': '路由器网关-01', \n                    'ip': '192.168.1.254',\n                    'device_type': 'router',\n                    'status': 'warning',\n                    'location': '数据中心A'\n                },\n                {\n                    'name': '防火墙-01',\n                    'ip': '192.168.1.100', \n                    'device_type': 'firewall',\n                    'status': 'online',\n                    'location': '数据中心B'\n                }\n            ]\n        }\n    \n    elif report_type == 'inspection_report':\n        return {\n            'total_inspections': 45,\n            'completed': 42,\n            'failed': 3,\n            'success_rate': 93.3,\n            'inspections': [\n                {\n                    'device_name': '核心交换机-01',\n                    'inspection_time': '2024-01-15 10:30:00',\n                    'status': 'success',\n                    'issues_found': 0\n                }\n            ]\n        }\n    \n    elif report_type == 'alert_report':\n        return {\n            'total_alerts': 128,\n            'critical': 5,\n            'warning': 23,\n            'info': 100,\n            'resolved': 115,\n            'pending': 13\n        }\n    \n    elif report_type == 'performance_report':\n        return {\n            'avg_cpu_usage': 45.2,\n            'avg_memory_usage': 68.7,\n            'network_utilization': 34.8,\n            'performance_score': 85.3\n        }\n    \n    return {}\n\nasync def _schedule_file_cleanup(file_path: str, hours: int):\n    \"\"\"\n    调度文件清理任务\n    \"\"\"\n    import asyncio\n    \n    await asyncio.sleep(hours * 3600)  # 等待指定小时数\n    \n    try:\n        if os.path.exists(file_path):\n            os.remove(file_path)\n            logger.info(\"Temporary report file cleaned up\", file_path=file_path)\n    except Exception as e:\n        logger.error(\"Failed to cleanup temporary file\", file_path=file_path, error=str(e))"