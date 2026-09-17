package ws

// RoomNotifications 承载"通知中心某个来源有记录变成终态"的轻量事件。
// 事件只说明哪个源的哪条记录变成了什么状态，不含业务数据，因此任何已登录用户都可订阅；
// 前端收到后重新经 /dashboard/notifications 按权限拉取，敏感信息仍由该接口把关。
const RoomNotifications = "notifications"

type NotificationSource string

const (
	NotificationSourceInspection NotificationSource = "inspection"
	NotificationSourceReport     NotificationSource = "report"
	NotificationSourceScan       NotificationSource = "scan"
)

type NotificationChange struct {
	Source NotificationSource `json:"source"`
	ID     string             `json:"id"`
	Status string             `json:"status"`
}

// RoomPublisher 是各业务服务向房间推送所需的最小能力，*Manager 满足该接口；
// 服务在未注入发布器（如单测、离线脚本）时静默跳过。
type RoomPublisher interface {
	SendToRoom(room string, message Message) int
}

func PublishNotificationChange(publisher RoomPublisher, change NotificationChange) {
	if publisher == nil {
		return
	}
	publisher.SendToRoom(RoomNotifications, Message{
		Type: MessageNotification,
		Data: change,
	})
}
