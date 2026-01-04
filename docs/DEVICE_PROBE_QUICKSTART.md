# 设备探测功能 - 快速开始

## 功能简介

设备探测功能允许你快速检测网络设备的连接状态：
- ✅ **ICMP探测**：检测设备是否在线（ping）
- ✅ **SNMP探测**：检测SNMP服务是否可用

## 使用步骤

### 1. 启动服务

确保后端服务已启动：
```powershell
.\scripts\development\start-backend.ps1
```

### 2. 访问设备管理页面

打开浏览器访问：
```
http://localhost:3000/devices
```

### 3. 探测设备

在设备列表中，每个设备都有一个"探测"按钮：

1. **点击探测按钮** - 图标为 ⚡ (Activity)
2. **等待探测完成** - 按钮显示加载动画
3. **查看结果** - 显示两个状态图标：
   - 📶 (Wifi) - ICMP在线 / 📵 (WifiOff) - ICMP离线
   - ✅ (CheckCircle) - SNMP成功 / ❌ (XCircle) - SNMP失败

### 4. 查看详细信息

将鼠标悬停在状态图标上，可以看到：
- 响应时间（毫秒）
- 错误信息（如果有）

## 探测结果说明

### ICMP状态

| 图标 | 状态 | 说明 |
|------|------|------|
| 📶 绿色 | 在线 | 设备响应ping请求 |
| 📵 红色 | 离线 | 设备未响应ping请求 |

### SNMP状态

| 图标 | 状态 | 说明 |
|------|------|------|
| ✅ 绿色 | 成功 | SNMP连接成功 |
| ❌ 灰色 | 失败 | SNMP连接失败或未配置 |

## 常见问题

### Q: ICMP显示离线，但设备实际在线？

**可能原因：**
- 设备防火墙阻止ICMP包
- 网络ACL限制
- IP地址配置错误

**解决方案：**
1. 检查设备防火墙设置
2. 验证IP地址是否正确
3. 检查网络连通性

### Q: SNMP显示失败？

**可能原因：**
- SNMP服务未启用
- Community字符串错误
- SNMP版本不匹配
- 防火墙阻止UDP 161端口

**解决方案：**
1. 确认设备SNMP服务已启用
2. 检查设备详情中的SNMP配置：
   - Community字符串
   - SNMP版本（v1/v2c/v3）
   - SNMP端口（默认161）
3. 检查防火墙规则

### Q: 探测速度慢？

**说明：**
- 单次探测最多需要5秒
- ICMP超时：3秒
- SNMP超时：3秒
- 并发执行，实际时间约3-5秒

**优化建议：**
- 使用批量探测功能（未来版本）
- 探测结果会缓存30秒

## API使用示例

### 探测单个设备

```bash
curl -X POST http://localhost:8000/api/v1/devices/27/probe \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

响应示例：
```json
{
  "device_id": 27,
  "ip_address": "192.168.10.1",
  "icmp_reachable": true,
  "icmp_response_time": 12.5,
  "icmp_error": null,
  "snmp_reachable": false,
  "snmp_response_time": null,
  "snmp_error": "No SNMP response received before timeout",
  "snmp_system_info": null,
  "probed_at": "2026-01-04T10:30:00Z"
}
```

### 批量探测设备

```bash
curl -X POST http://localhost:8000/api/v1/devices/batch-probe \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "device_ids": [1, 2, 3, 4, 5],
    "max_concurrent": 20
  }'
```

## 配置SNMP

要使SNMP探测成功，需要正确配置设备的SNMP信息：

### 1. 编辑设备

点击设备的"编辑"按钮

### 2. 配置SNMP

填写以下信息：
- **SNMP Community**：设备的community字符串（如：public）
- **SNMP版本**：选择v1、v2c或v3
- **SNMP端口**：默认161

### 3. 保存并探测

保存设备信息后，点击"探测"按钮测试连接

## 最佳实践

### 1. 定期探测

建议定期探测设备状态：
- 新设备添加后立即探测
- 设备配置更改后探测
- 定期巡检时探测

### 2. 批量操作

对于大量设备：
- 使用批量探测API
- 设置合理的并发数（推荐20）
- 避免同时探测过多设备

### 3. 故障排查

当设备探测失败时：
1. 先检查ICMP状态
2. 如果ICMP在线但SNMP失败，检查SNMP配置
3. 查看详细错误信息
4. 参考故障排查文档

## 下一步

- 📖 阅读[完整功能文档](./device-probe-feature.md)
- 🔧 查看[实现细节](./DEVICE_PROBE_IMPLEMENTATION.md)
- 🧪 运行[测试用例](../backend/tests/test_device_probe.py)

## 反馈与支持

如有问题或建议，请联系开发团队。
