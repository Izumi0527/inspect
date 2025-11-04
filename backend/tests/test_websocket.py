#!/usr/bin/env python3
"""
WebSocket功能测试脚本
"""
import asyncio
import json
import sys
import time
from pathlib import Path

# 添加项目根目录到Python路径
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

import websockets
from websockets.exceptions import ConnectionClosedError, InvalidStatusCode
import structlog

logger = structlog.get_logger()


class WebSocketTestClient:
    """WebSocket测试客户端"""
    
    def __init__(self, base_url: str = "ws://localhost:8000"):
        self.base_url = base_url
        self.websocket = None
        self.connected = False
        self.messages_received = []
    
    async def connect(self, user_id: str, rooms: str = None, token: str = "test-token"):
        """连接WebSocket服务器"""
        url = f"{self.base_url}/api/v1/ws/{user_id}"
        params = []
        
        if rooms:
            params.append(f"rooms={rooms}")
        
        if params:
            url += "?" + "&".join(params)
        
        print(f"🔄 连接WebSocket: {url}")
        
        try:
            self.websocket = await websockets.connect(url)
            self.connected = True
            print(f"✅ WebSocket连接成功: {user_id}")
            return True
            
        except (ConnectionRefusedError, InvalidStatusCode) as e:
            print(f"❌ WebSocket连接失败: {e}")
            return False
        except Exception as e:
            print(f"❌ 连接错误: {e}")
            return False
    
    async def disconnect(self):
        """断开连接"""
        if self.websocket and self.connected:
            await self.websocket.close()
            self.connected = False
            print("🔌 WebSocket连接已断开")
    
    async def send_message(self, message_type: str, data: dict = None):
        """发送消息"""
        if not self.connected or not self.websocket:
            print("❌ WebSocket未连接")
            return False
        
        message = {
            "type": message_type,
            "data": data or {},
            "timestamp": int(time.time())
        }
        
        try:
            await self.websocket.send(json.dumps(message, ensure_ascii=False))
            print(f"📤 发送消息: {message_type}")
            return True
        except Exception as e:
            print(f"❌ 发送消息失败: {e}")
            return False
    
    async def receive_messages(self, timeout: float = 5.0):
        """接收消息"""
        if not self.connected or not self.websocket:
            return []
        
        messages = []
        start_time = time.time()
        
        try:
            while time.time() - start_time < timeout:
                try:
                    # 设置较短的超时时间以便检查总体超时
                    message = await asyncio.wait_for(
                        self.websocket.recv(), 
                        timeout=0.5
                    )
                    
                    try:
                        parsed_message = json.loads(message)
                        messages.append(parsed_message)
                        self.messages_received.append(parsed_message)
                        print(f"📥 收到消息: {parsed_message.get('type', 'unknown')}")
                    except json.JSONDecodeError:
                        print(f"❌ 消息解析失败: {message}")
                        
                except asyncio.TimeoutError:
                    continue
                    
        except ConnectionClosedError:
            print("⚠️ 连接已关闭")
            self.connected = False
        except Exception as e:
            print(f"❌ 接收消息错误: {e}")
        
        return messages
    
    async def send_heartbeat(self):
        """发送心跳"""
        return await self.send_message("heartbeat")
    
    async def subscribe_room(self, room: str):
        """订阅房间"""
        return await self.send_message("subscribe", {"room": room})
    
    async def unsubscribe_room(self, room: str):
        """取消订阅房间"""
        return await self.send_message("unsubscribe", {"room": room})


async def test_basic_connection():
    """测试基本连接功能"""
    print("\n" + "="*50)
    print("🔄 测试基本WebSocket连接")
    print("="*50)
    
    client = WebSocketTestClient()
    
    # 测试连接
    success = await client.connect("test_user_1", "device_status,alerts")
    if not success:
        print("❌ 基本连接测试失败")
        return False
    
    # 接收连接确认消息
    messages = await client.receive_messages(timeout=2.0)
    if not messages:
        print("❌ 未收到连接确认消息")
        await client.disconnect()
        return False
    
    # 检查连接确认消息
    connection_msg = messages[0]
    if connection_msg.get("type") != "system_status":
        print(f"❌ 连接确认消息类型错误: {connection_msg.get('type')}")
        await client.disconnect()
        return False
    
    print("✅ 基本连接测试通过")
    await client.disconnect()
    return True


async def test_heartbeat():
    """测试心跳功能"""
    print("\n" + "="*50)
    print("🔄 测试心跳功能")
    print("="*50)
    
    client = WebSocketTestClient()
    
    if not await client.connect("test_user_2"):
        print("❌ 心跳测试连接失败")
        return False
    
    # 等待连接确认
    await client.receive_messages(timeout=1.0)
    
    # 发送心跳
    success = await client.send_heartbeat()
    if not success:
        print("❌ 发送心跳失败")
        await client.disconnect()
        return False
    
    # 接收心跳响应
    messages = await client.receive_messages(timeout=2.0)
    heartbeat_response = None
    for msg in messages:
        if msg.get("type") == "heartbeat":
            heartbeat_response = msg
            break
    
    if not heartbeat_response:
        print("❌ 未收到心跳响应")
        await client.disconnect()
        return False
    
    if heartbeat_response.get("data", {}).get("status") != "ok":
        print(f"❌ 心跳响应状态错误: {heartbeat_response}")
        await client.disconnect()
        return False
    
    print("✅ 心跳测试通过")
    await client.disconnect()
    return True


async def test_room_subscription():
    """测试房间订阅功能"""
    print("\n" + "="*50)
    print("🔄 测试房间订阅功能")
    print("="*50)
    
    client = WebSocketTestClient()
    
    if not await client.connect("test_user_3"):
        print("❌ 房间订阅测试连接失败")
        return False
    
    # 等待连接确认
    await client.receive_messages(timeout=1.0)
    
    # 测试订阅房间
    success = await client.subscribe_room("device_status")
    if not success:
        print("❌ 订阅房间失败")
        await client.disconnect()
        return False
    
    # 接收订阅确认
    messages = await client.receive_messages(timeout=2.0)
    subscribe_response = None
    for msg in messages:
        if (msg.get("type") == "system_status" and 
            msg.get("data", {}).get("action") == "subscribe"):
            subscribe_response = msg
            break
    
    if not subscribe_response:
        print("❌ 未收到订阅确认")
        await client.disconnect()
        return False
    
    # 测试取消订阅
    success = await client.unsubscribe_room("device_status")
    if not success:
        print("❌ 取消订阅房间失败")
        await client.disconnect()
        return False
    
    # 接收取消订阅确认
    messages = await client.receive_messages(timeout=2.0)
    unsubscribe_response = None
    for msg in messages:
        if (msg.get("type") == "system_status" and 
            msg.get("data", {}).get("action") == "unsubscribe"):
            unsubscribe_response = msg
            break
    
    if not unsubscribe_response:
        print("❌ 未收到取消订阅确认")
        await client.disconnect()
        return False
    
    print("✅ 房间订阅测试通过")
    await client.disconnect()
    return True


async def test_multiple_clients():
    """测试多客户端连接"""
    print("\n" + "="*50)
    print("🔄 测试多客户端连接")
    print("="*50)
    
    clients = []
    
    try:
        # 创建多个客户端连接
        for i in range(3):
            client = WebSocketTestClient()
            if await client.connect(f"test_user_{i+10}", "alerts"):
                clients.append(client)
                # 等待连接确认
                await client.receive_messages(timeout=1.0)
        
        if len(clients) < 3:
            print(f"❌ 只有{len(clients)}个客户端连接成功，预期3个")
            return False
        
        # 测试各客户端发送心跳
        for i, client in enumerate(clients):
            success = await client.send_heartbeat()
            if not success:
                print(f"❌ 客户端{i+1}发送心跳失败")
                return False
        
        # 接收所有心跳响应
        for i, client in enumerate(clients):
            messages = await client.receive_messages(timeout=2.0)
            heartbeat_received = any(
                msg.get("type") == "heartbeat" for msg in messages
            )
            if not heartbeat_received:
                print(f"❌ 客户端{i+1}未收到心跳响应")
                return False
        
        print("✅ 多客户端测试通过")
        return True
        
    finally:
        # 清理所有连接
        for client in clients:
            await client.disconnect()


async def test_connection_stats():
    """测试连接统计API"""
    print("\n" + "="*50)
    print("🔄 测试连接统计API")
    print("="*50)
    
    import aiohttp
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get("http://localhost:8000/api/v1/ws/stats") as response:
                if response.status == 200:
                    stats = await response.json()
                    print(f"📊 当前连接统计: {stats}")
                    print("✅ 连接统计API测试通过")
                    return True
                else:
                    print(f"❌ 连接统计API返回错误: {response.status}")
                    return False
    except Exception as e:
        print(f"❌ 连接统计API测试失败: {e}")
        return False


async def main():
    """主测试函数"""
    print("🚀 WebSocket功能测试开始")
    print("请确保后端服务器正在运行 (python start_backend.py)")
    print("\n等待3秒后开始测试...")
    await asyncio.sleep(3)
    
    tests = [
        ("基本连接测试", test_basic_connection),
        ("心跳功能测试", test_heartbeat),
        ("房间订阅测试", test_room_subscription),
        ("多客户端测试", test_multiple_clients),
        ("连接统计测试", test_connection_stats),
    ]
    
    passed = 0
    failed = 0
    
    for test_name, test_func in tests:
        try:
            if await test_func():
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"❌ {test_name}发生异常: {e}")
            failed += 1
    
    print("\n" + "="*50)
    print("📋 WebSocket测试总结")
    print("="*50)
    print(f"✅ 通过: {passed}")
    print(f"❌ 失败: {failed}")
    print(f"📊 成功率: {passed/(passed+failed)*100:.1f}%")
    
    if failed == 0:
        print("\n🎉 所有WebSocket测试通过！")
    else:
        print(f"\n⚠️ 有{failed}个测试失败，请检查后端服务状态")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n⏹️ 测试被用户中断")