"""
巡检模块服务测试
"""
import pytest


class TestInspectionServiceImport:
    """巡检服务导入测试"""

    def test_import_inspection_module(self):
        """测试导入巡检模块"""
        from src.modules.inspection import router
        assert router is not None

    def test_import_inspection_service(self):
        """测试导入巡检服务"""
        from src.modules.inspection.service import inspection_service
        assert inspection_service is not None


class TestInspectionSchemas:
    """巡检数据模式测试"""

    def test_import_inspection_schemas(self):
        """测试导入巡检schemas"""
        from src.modules.inspection.schemas import (
            InspectionTaskCreate,
            InspectionTaskResponse,
            InspectionStatus,
        )
        assert InspectionTaskCreate is not None
        assert InspectionTaskResponse is not None
        assert InspectionStatus is not None

    def test_inspection_status_enum(self):
        """测试巡检状态枚举"""
        from src.modules.inspection.schemas import InspectionStatus
        assert hasattr(InspectionStatus, "PENDING")
        assert hasattr(InspectionStatus, "RUNNING")
        assert hasattr(InspectionStatus, "COMPLETED")
