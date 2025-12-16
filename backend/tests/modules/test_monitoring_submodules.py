"""
监控子模块测试

测试拆分后的监控模块：collector, storage, aggregator
"""
import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch


class TestMetricsCollector:
    """指标采集器测试"""
    
    @pytest.fixture
    def collector(self):
        """创建采集器实例"""
        from src.modules.monitoring.collector import MetricsCollector
        return MetricsCollector()
    
    def test_collector_initialization(self, collector):
        """测试采集器初始化"""
        assert collector.active_monitors == {}
        assert collector._storage is None
        assert collector._notifier is None
    
    def test_set_storage(self, collector):
        """测试设置存储服务"""
        mock_storage = MagicMock()
        collector.set_storage(mock_storage)
        assert collector._storage == mock_storage
    
    def test_set_notifier(self, collector):
        """测试设置通知服务"""
        mock_notifier = MagicMock()
        collector.set_notifier(mock_notifier)
        assert collector._notifier == mock_notifier
    
    @pytest.mark.asyncio
    async def test_start_device_monitoring(self, collector):
        """测试开始设备监控"""
        device_info = {"device_type": "switch", "ip_address": "192.168.1.1"}
        
        result = await collector.start_device_monitoring(1, device_info, interval=60)
        
        assert result is True
        assert 1 in collector.active_monitors
        assert collector.active_monitors[1]["status"] == "running"
    
    @pytest.mark.asyncio
    async def test_start_device_monitoring_already_active(self, collector):
        """测试重复开始监控"""
        device_info = {"device_type": "switch", "ip_address": "192.168.1.1"}
        
        await collector.start_device_monitoring(1, device_info)
        result = await collector.start_device_monitoring(1, device_info)
        
        assert result is False

    @pytest.mark.asyncio
    async def test_stop_device_monitoring(self, collector):
        """测试停止设备监控"""
        device_info = {"device_type": "switch", "ip_address": "192.168.1.1"}
        await collector.start_device_monitoring(1, device_info)
        
        result = await collector.stop_device_monitoring(1)
        
        assert result is True
        assert 1 not in collector.active_monitors
    
    @pytest.mark.asyncio
    async def test_stop_device_monitoring_not_found(self, collector):
        """测试停止不存在的监控"""
        result = await collector.stop_device_monitoring(999)
        assert result is False
    
    @pytest.mark.asyncio
    async def test_collect_device_metrics_switch(self, collector):
        """测试收集交换机指标"""
        device_info = {"device_type": "switch", "ip_address": "192.168.1.1"}
        
        metrics = await collector.collect_device_metrics(device_info)
        
        assert "timestamp" in metrics
        assert "connectivity" in metrics
        assert "cpu_usage" in metrics
        assert "memory_usage" in metrics
        assert "interfaces" in metrics
    
    @pytest.mark.asyncio
    async def test_collect_device_metrics_server(self, collector):
        """测试收集服务器指标"""
        device_info = {"device_type": "server", "ip_address": "192.168.1.10"}
        
        metrics = await collector.collect_device_metrics(device_info)
        
        assert "cpu_usage" in metrics
        assert "memory_usage" in metrics
        assert "disk_usage" in metrics
        assert "load_average" in metrics
    
    def test_get_monitor_status(self, collector):
        """测试获取监控状态"""
        collector.active_monitors[1] = {"status": "running", "device_id": 1}
        
        status = collector.get_monitor_status(1)
        
        assert status is not None
        assert status["status"] == "running"
    
    def test_get_all_monitors_status(self, collector):
        """测试获取所有监控状态"""
        collector.active_monitors[1] = {"status": "running"}
        collector.active_monitors[2] = {"status": "error"}
        
        status = collector.get_all_monitors_status()
        
        assert status["total_devices"] == 2
        assert status["active_monitoring"] == 1
        assert status["error_monitoring"] == 1


class TestMetricsStorage:
    """指标存储服务测试"""
    
    @pytest.fixture
    def storage(self):
        """创建存储服务实例"""
        with patch("src.modules.monitoring.storage.settings") as mock_settings:
            mock_settings.INFLUXDB_URL = None
            mock_settings.INFLUXDB_TOKEN = None
            from src.modules.monitoring.storage import MetricsStorage
            return MetricsStorage()
    
    def test_storage_initialization(self, storage):
        """测试存储服务初始化"""
        assert storage.device_metrics == {}
        assert storage.influx_client is None
    
    @pytest.mark.asyncio
    async def test_store_metrics(self, storage):
        """测试存储指标"""
        metrics = {
            "cpu_usage": 50,
            "memory_usage": 60,
            "timestamp": datetime.now().isoformat()
        }
        
        await storage.store_metrics(1, metrics)
        
        assert 1 in storage.device_metrics
        assert storage.device_metrics[1]["cpu_usage"] == 50
    
    @pytest.mark.asyncio
    async def test_get_current_metrics(self, storage):
        """测试获取当前指标"""
        storage.device_metrics[1] = {"cpu_usage": 50, "collected_at": datetime.now()}
        
        metrics = await storage.get_current_metrics(1)
        
        assert metrics is not None
        assert metrics["cpu_usage"] == 50
    
    @pytest.mark.asyncio
    async def test_get_current_metrics_not_found(self, storage):
        """测试获取不存在的指标"""
        metrics = await storage.get_current_metrics(999)
        assert metrics is None

    @pytest.mark.asyncio
    async def test_get_historical_metrics_mock(self, storage):
        """测试获取历史指标（模拟数据）"""
        start_time = datetime.now() - timedelta(hours=1)
        end_time = datetime.now()
        
        data = await storage.get_historical_metrics(1, start_time, end_time)
        
        assert isinstance(data, list)
        assert len(data) > 0
        assert "timestamp" in data[0]
        assert "metric_type" in data[0]
    
    def test_is_influxdb_available(self, storage):
        """测试InfluxDB可用性检查"""
        assert storage.is_influxdb_available() is False


class TestMetricsAggregator:
    """指标聚合器测试"""
    
    @pytest.fixture
    def aggregator(self):
        """创建聚合器实例"""
        from src.modules.monitoring.aggregator import MetricsAggregator
        return MetricsAggregator()
    
    def test_aggregator_initialization(self, aggregator):
        """测试聚合器初始化"""
        assert aggregator._storage is None
        assert aggregator._collector is None
    
    def test_set_storage(self, aggregator):
        """测试设置存储服务"""
        mock_storage = MagicMock()
        aggregator.set_storage(mock_storage)
        assert aggregator._storage == mock_storage
    
    def test_set_collector(self, aggregator):
        """测试设置采集器"""
        mock_collector = MagicMock()
        aggregator.set_collector(mock_collector)
        assert aggregator._collector == mock_collector
    
    @pytest.mark.asyncio
    async def test_get_network_overview_no_storage(self, aggregator):
        """测试获取网络概览（无存储）"""
        overview = await aggregator.get_network_overview()
        
        assert overview["total_traffic"] == "0 MB/s"
        assert overview["avg_cpu_usage"] == "0%"
        assert overview["active_devices"] == 0
    
    @pytest.mark.asyncio
    async def test_get_network_overview_with_data(self, aggregator):
        """测试获取网络概览（有数据）"""
        mock_storage = MagicMock()
        mock_storage.device_metrics = {
            1: {
                "collected_at": datetime.now(),
                "bandwidth_utilization": 50,
                "cpu_usage": 60
            },
            2: {
                "collected_at": datetime.now(),
                "bandwidth_utilization": 70,
                "cpu_usage": 40
            }
        }
        mock_storage.is_influxdb_available.return_value = False
        aggregator.set_storage(mock_storage)
        
        mock_collector = MagicMock()
        mock_collector.get_all_monitors_status.return_value = {
            "total_devices": 2,
            "active_monitoring": 2,
            "error_monitoring": 0
        }
        aggregator.set_collector(mock_collector)
        
        overview = await aggregator.get_network_overview()
        
        assert overview["active_devices"] == 2
        assert "MB/s" in overview["total_traffic"]
        assert "%" in overview["avg_cpu_usage"]
    
    def test_get_monitoring_status_no_collector(self, aggregator):
        """测试获取监控状态（无采集器）"""
        status = aggregator.get_monitoring_status()
        
        assert status["total_devices"] == 0
        assert status["active_monitoring"] == 0
    
    @pytest.mark.asyncio
    async def test_get_device_summary_no_storage(self, aggregator):
        """测试获取设备摘要（无存储）"""
        summary = await aggregator.get_device_summary(1)
        
        assert "error" in summary
    
    @pytest.mark.asyncio
    async def test_get_device_summary_no_data(self, aggregator):
        """测试获取设备摘要（无数据）"""
        mock_storage = MagicMock()
        mock_storage.get_current_metrics = AsyncMock(return_value=None)
        aggregator.set_storage(mock_storage)
        
        summary = await aggregator.get_device_summary(1)
        
        assert summary["status"] == "no_data"
    
    @pytest.mark.asyncio
    async def test_get_alerts_summary(self, aggregator):
        """测试获取告警摘要"""
        summary = await aggregator.get_alerts_summary()
        
        assert "total_active" in summary
        assert "critical" in summary


class TestMonitoringModuleImports:
    """监控模块导入测试"""
    
    def test_import_collector(self):
        """测试导入采集器"""
        from src.modules.monitoring.collector import MetricsCollector, metrics_collector
        assert MetricsCollector is not None
        assert metrics_collector is not None
    
    def test_import_storage(self):
        """测试导入存储服务"""
        from src.modules.monitoring.storage import MetricsStorage, metrics_storage
        assert MetricsStorage is not None
        assert metrics_storage is not None
    
    def test_import_aggregator(self):
        """测试导入聚合器"""
        from src.modules.monitoring.aggregator import MetricsAggregator, metrics_aggregator
        assert MetricsAggregator is not None
        assert metrics_aggregator is not None
    
    def test_import_from_module_init(self):
        """测试从模块__init__导入"""
        from src.modules.monitoring import (
            MetricsCollector,
            MetricsStorage,
            MetricsAggregator
        )
        assert MetricsCollector is not None
        assert MetricsStorage is not None
        assert MetricsAggregator is not None
