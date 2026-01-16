# WebSocket 协议契约（兼容性基线）

本文档用于固定现有 WebSocket 协议与消息结构，供 Go 后端保持完全兼容。

## 连接与订阅

- 连接端点：`/api/v1/ws/{user_id}`
- 可选查询参数：`rooms`（逗号分隔）
  - 支持房间：`device_status`、`alerts`、`system`、`scan_progress`、`device_metrics`

### 连接确认消息
连接建立后服务端立即发送：

```json
{
  "timestamp": 1736210000,
  "message_id": "msg_1736210000000",
  "type": "system_status",
  "data": {
    "status": "connected",
    "connection_id": "conn_1736210000000_1",
    "server_time": 1736210000
  }
}
```

## 消息外层封装
所有服务端下行消息统一包含以下字段：

- `timestamp`: Unix 秒级时间戳
- `message_id`: 服务端生成的消息 ID
- `type`: 消息类型（见下文）
- `data`: 业务负载

## 客户端上行消息

### 心跳
```json
{ "type": "heartbeat", "data": {} }
```
响应（服务端）：
```json
{
  "type": "heartbeat",
  "data": { "status": "ok" }
}
```

### 订阅房间
```json
{ "type": "subscribe", "data": { "room": "device_status" } }
```
响应（服务端）：
```json
{
  "type": "system_status",
  "data": { "action": "subscribe", "room": "device_status", "success": true }
}
```

### 取消订阅
```json
{ "type": "unsubscribe", "data": { "room": "device_status" } }
```
响应（服务端）：
```json
{
  "type": "system_status",
  "data": { "action": "unsubscribe", "room": "device_status", "success": true }
}
```

## 服务端下行消息类型

- `device_status`
  - 设备状态变更通知
  - `data` 示例：`{ "device_id": 1, "status": "online", ... }`
- `scan_progress`
  - 扫描进度
  - `data` 示例：`{ "scan_id": "xxx", "progress": 30, "status": "running" }`
- `alert`
  - 告警通知
  - `data` 示例：`{ "alert_type": "cpu", "severity": "critical", "message": "..." }`
- `system_status`
  - 系统事件通知 / 订阅反馈
  - `data` 示例：`{ "event_type": "device_created", "message": "..." }`
- `user_notification`
  - 用户个人通知
  - `data` 示例：`{ "notification_type": "...", "message": "..." }`
- `device_metrics`
  - 设备性能指标
  - `data` 示例：`{ "device_id": 1, "metrics": { ... } }`
- `error`
  - 错误消息
  - `data` 示例：`{ "message": "Invalid JSON format" }`

## 管理类 HTTP 接口（用于调试/运维）

- `GET /api/v1/ws/stats`：获取连接统计
- `POST /api/v1/ws/broadcast`：广播消息（需管理员）
- `POST /api/v1/ws/send-to-user/{user_id}`：点对点发送
- `POST /api/v1/ws/send-to-room/{room}`：房间内广播

## 参考实现

- `backend-go/internal/ws/handler.go`
- `backend-go/internal/ws/manager.go`
- `backend-go/internal/ws/types.go`
