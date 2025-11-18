"""
快速测试导入是否正常
"""
import sys
import os

# 设置UTF-8编码
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_imports():
    """测试关键模块导入"""
    try:
        print("1. 测试导入 settings schemas...")
        from src.schemas.settings.general import (
            SettingItem, BulkUpdateRequest, BulkUpdateResponse,
            ExportConfigResponse, ImportConfigRequest, ImportConfigResponse
        )
        print("✓ Schemas 导入成功")

        print("\n2. 测试导入 settings service...")
        from src.services.settings.general_service import general_settings_service
        print("✓ Service 导入成功")

        print("\n3. 测试导入 settings API router...")
        from src.api.settings import router as settings_router
        print("✓ Settings router 导入成功")

        print("\n4. 测试导入 general API router...")
        from src.api.settings.general import router as general_router
        print("✓ General router 导入成功")

        print("\n5. 测试导入主 API router...")
        from src.api import api_router
        print("✓ Main API router 导入成功")

        print("\n" + "="*60)
        print("✅ 所有导入测试通过！")
        print("="*60)
        return True

    except Exception as e:
        print(f"\n❌ 导入失败: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_imports()
    sys.exit(0 if success else 1)
