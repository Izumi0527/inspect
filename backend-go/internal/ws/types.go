package ws

type MessageType string

const (
    MessageDeviceStatus   MessageType = "device_status"
    MessageScanProgress   MessageType = "scan_progress"
    MessageAlert          MessageType = "alert"
    MessageSystemStatus   MessageType = "system_status"
    MessageHeartbeat      MessageType = "heartbeat"
    MessageUserNotice     MessageType = "user_notification"
    MessageDeviceMetrics  MessageType = "device_metrics"
    MessageError          MessageType = "error"
)

type ClientMessage struct {
    Type string                 `json:"type"`
    Data map[string]interface{} `json:"data"`
}

type Message struct {
    Type MessageType   `json:"type"`
    Data interface{}   `json:"data"`
}

type Envelope struct {
    Timestamp int64       `json:"timestamp"`
    MessageID string      `json:"message_id"`
    Type      MessageType `json:"type"`
    Data      interface{} `json:"data"`
}
