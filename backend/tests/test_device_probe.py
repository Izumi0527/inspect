"""
设备探测服务测试
"""
import pytest
import asyncio
from src.services.device.probe import DeviceProbeService, ProbeResult


@pytest.mark.asyncio
async def test_probe_icmp():
    """测试ICMP探测"""
    service = DeviceProbeService()
    
    # 测试本地回环地址（应该总是可达）
    result = await service._probe_icmp("127.0.0.1")
    
    assert result["reachable"] is True
    assert result.get("response_time") is not None
    assert result.get("error") is None


@pytest.mark.asyncio
async def test_probe_icmp_unreachable():
    """测试ICMP探测不可达地址"""
    service = DeviceProbeService()
    
    # 测试一个不存在的地址
    result = await service._probe_icmp("192.0.2.1")  # TEST-NET-1
    
    assert result["reachable"] is False
    assert result.get("error") is not None


@pytest.mark.asyncio
async def test_probe_snmp_no_community():
    """测试SNMP探测无community"""
    service = DeviceProbeService()
    
    result = await service._probe_snmp(
        ip_address="127.0.0.1",
        snmp_community=None,
        snmp_version="2c",
        snmp_port=161
    )
    
    assert result["reachable"] is False
    assert "not configured" in result.get("error", "").lower()


@pytest.mark.asyncio
async def test_probe_device():
    """测试完整设备探测"""
    service = DeviceProbeService()
    
    result = await service.probe_device(
        device_id=1,
        ip_address="127.0.0.1",
        snmp_community="public",
        snmp_version="2c",
        snmp_port=161,
        use_cache=False
    )
    
    assert isinstance(result, ProbeResult)
    assert result.device_id == 1
    assert result.ip_address == "127.0.0.1"
    assert result.icmp_reachable is True
    assert result.probed_at is not None


@pytest.mark.asyncio
async def test_batch_probe_devices():
    """测试批量探测"""
    service = DeviceProbeService()
    
    devices = [
        {
            "id": 1,
            "ip_address": "127.0.0.1",
            "snmp_community": "public",
            "snmp_version": "2c",
            "snmp_port": 161
        },
        {
            "id": 2,
            "ip_address": "192.0.2.1",  # TEST-NET-1
            "snmp_community": "public",
            "snmp_version": "2c",
            "snmp_port": 161
        }
    ]
    
    results = await service.batch_probe_devices(devices, max_concurrent=2)
    
    assert len(results) == 2
    assert 1 in results
    assert 2 in results
    assert results[1].icmp_reachable is True
    assert results[2].icmp_reachable is False


@pytest.mark.asyncio
async def test_probe_cache():
    """测试探测缓存"""
    service = DeviceProbeService()
    
    # 第一次探测
    result1 = await service.probe_device(
        device_id=1,
        ip_address="127.0.0.1",
        snmp_community="public",
        use_cache=True
    )
    
    # 第二次探测（应该使用缓存）
    result2 = await service.probe_device(
        device_id=1,
        ip_address="127.0.0.1",
        snmp_community="public",
        use_cache=True
    )
    
    # 两次结果应该相同（来自缓存）
    assert result1.probed_at == result2.probed_at
    
    # 清除缓存
    service.clear_cache(device_id=1)
    
    # 第三次探测（不使用缓存）
    result3 = await service.probe_device(
        device_id=1,
        ip_address="127.0.0.1",
        snmp_community="public",
        use_cache=False
    )
    
    # 时间应该不同
    assert result1.probed_at != result3.probed_at


if __name__ == "__main__":
    # 运行简单测试
    async def main():
        service = DeviceProbeService()
        
        print("测试ICMP探测...")
        result = await service._probe_icmp("127.0.0.1")
        print(f"结果: {result}")
        
        print("\n测试完整设备探测...")
        probe_result = await service.probe_device(
            device_id=1,
            ip_address="127.0.0.1",
            snmp_community="public"
        )
        print(f"ICMP可达: {probe_result.icmp_reachable}")
        print(f"ICMP响应时间: {probe_result.icmp_response_time}ms")
        print(f"SNMP可达: {probe_result.snmp_reachable}")
        if probe_result.snmp_error:
            print(f"SNMP错误: {probe_result.snmp_error}")
    
    asyncio.run(main())
