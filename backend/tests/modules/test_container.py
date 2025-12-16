"""
依赖注入容器测试
"""
import pytest


class TestContainer:
    """Container 测试"""

    def test_container_import(self):
        """测试容器导入"""
        try:
            from src.core.container import Container, container
            assert Container is not None
            assert container is not None
        except ImportError as e:
            if "dependency_injector" in str(e):
                pytest.skip("dependency_injector not installed")
            raise

    def test_get_container(self):
        """测试获取容器实例"""
        try:
            from src.core.container import get_container
            container = get_container()
            assert container is not None
        except ImportError as e:
            if "dependency_injector" in str(e):
                pytest.skip("dependency_injector not installed")
            raise

    def test_container_config(self):
        """测试容器配置"""
        try:
            from src.core.container import Container
            container = Container()
            assert container.config is not None
        except ImportError as e:
            if "dependency_injector" in str(e):
                pytest.skip("dependency_injector not installed")
            raise


class TestDependencies:
    """依赖注入函数测试"""

    def test_get_alert_repository(self):
        """测试获取告警Repository"""
        from src.core.dependencies import get_alert_repository
        repo = get_alert_repository()
        assert repo is not None

    def test_get_alert_service(self):
        """测试获取告警Service"""
        from src.core.dependencies import get_alert_service
        service = get_alert_service()
        assert service is not None

    def test_get_container_dependency(self):
        """测试获取容器依赖"""
        try:
            from src.core.dependencies import get_container
            container = get_container()
            assert container is not None
        except ImportError as e:
            if "dependency_injector" in str(e):
                pytest.skip("dependency_injector not installed")
            raise

    def test_get_cache_service(self):
        """测试获取缓存服务"""
        from src.core.dependencies import get_cache_service
        service = get_cache_service()
        assert service is not None
