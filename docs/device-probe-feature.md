# 设备探测功能文档

## 功能概述

设备探测功能允许用户实时检测网络设备的连接状态，包括：

1. **ICMP探测**：通过ping检测设备是否在线
2. **SNMP连接测试**：检测SNMP服务是否可用

## 功能特性

### 后端实现

#### 1. 设备探测服务 (`backend/src/services/device/probe.py`)

- **ICMP Ping探测**
  - 跨平台支持（Windows/Linux）
  - 3秒超时
  - 解析响应时间
  
- **SNMP连接测试**
  - 支持SNMP v1/v2c/v3
  - 获取系统描述信息
  - 3秒超时，1次重试
  
- **批量探测**
  - 支持并发探测（默认20个并发）
  - 自动限流避免网络拥塞
  
- **结果缓存**
  - 30秒缓存TTL
  - 减少重复探测

#### 2. API端点

**单设备探测**
```
POST /api/v1/devices/{device_id}/probe
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

**批量探测**
```
POST /api/v1/devices/batch-probe
```

请求体：
```json
{
  "device_ids": [1, 2, 3, 4, 5],
  "max_concurrent": 20
}
```

响应示例：
```json
{
  "total": 5,
  "probed": 5,
  "results": [...]
}
```

### 前端实现

#### 1. 探测按钮组件 (`DeviceProbeButton`)

特性：
- 一键探测设备
- 实时显示探测状态
- 图标化显示ICMP和SNMP状态
- Toast通知探测结果

使用示例：
```tsx
<DeviceProbeButton
  deviceId={device.id}
  deviceName={device.name}
  size="sm"
  variant="ghost"
  onProbeComplete={(result) => {
    console.log('探测完成:', result)
  }}
/>
```

#### 2. 探测状态显示组件 (`DeviceProbeStatus`)

特性：
- 详细显示ICMP和SNMP状态
- 显示响应时间
- 显示错误信息

使用示例：
```tsx
<DeviceProbeStatus
  result={probeResult}
  loading={isProbing}
/>
```

## 使用场景

### 1. 设备管理页面

在设备列表中，每个设备都有一个"探测"按钮：
- 点击按钮立即探测设备
- 显示ICMP和SNMP连接状态
- 显示响应时间

### 2. 设备详情页面

可以在设备详情页面添加探测功能：
- 查看详细的探测结果
- 显示历史探测记录
- 设置自动探测间隔

### 3. 批量操作

可以批量探测多个设备：
- 选择多个设备
- 一键批量探测
- 查看汇总结果

## 状态说明

### ICMP状态

- ✅ **在线**：设备响应ping请求
  - 显示响应时间（毫秒）
  
- ❌ **离线**：设备未响应ping请求
  - 显示错误信息

### SNMP状态

- ✅ **成功**：SNMP连接成功
  - 显示响应时间（毫秒）
  - 显示系统描述信息
  
- ❌ **失败**：SNMP连接失败
  - 显示错误信息（超时、认证失败等）
  
- ⚪ **未配置**：设备未配置SNMP community

## 故障排查

### ICMP探测失败

可能原因：
1. 设备真的离线
2. 防火墙阻止ICMP包
3. 网络不可达
4. IP地址错误

解决方案：
- 检查设备电源和网络连接
- 检查防火墙规则
- 验证IP地址配置

### SNMP探测失败

可能原因：
1. SNMP服务未启用
2. Community字符串错误
3. SNMP版本不匹配
4. SNMP ACL限制
5. UDP 161端口被阻止

解决方案：
- 确认设备SNMP服务已启用
- 验证Community字符串
- 检查SNMP版本配置
- 检查SNMP ACL配置
- 检查防火墙UDP 161端口

## 性能优化

### 缓存机制

- 探测结果缓存30秒
- 减少重复探测
- 提高响应速度

### 并发控制

- 批量探测默认20个并发
- 可配置最大并发数（1-50）
- 避免网络拥塞

### 超时设置

- ICMP超时：3秒
- SNMP超时：3秒
- 总超时：5秒

## 安全考虑

1. **权限控制**
   - 需要 `devices:read` 权限
   - 记录探测操作日志

2. **频率限制**
   - 使用缓存避免频繁探测
   - 批量探测限制并发数

3. **敏感信息保护**
   - SNMP community不在日志中明文显示
   - 探测结果不包含密码信息

## 未来扩展

1. **定时探测**
   - 设置自动探测间隔
   - 探测结果历史记录
   - 状态变化告警

2. **更多协议支持**
   - SSH连接测试
   - HTTP/HTTPS探测
   - Telnet连接测试

3. **探测报告**
   - 生成探测报告
   - 导出探测结果
   - 趋势分析

4. **智能探测**
   - 根据设备类型选择探测方式
   - 自适应超时时间
   - 失败自动重试
