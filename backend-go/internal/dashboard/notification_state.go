package dashboard

import "time"

// UserNotificationState 用于保存用户维度的通知已读/清空状态（后端持久化）。
// 说明：
// - notification_id 与 Notification.ID 对齐（例如 alert-123、report-9）。
// - read_at 表示已读时间；dismissed_at 表示已清空（隐藏）时间。
type UserNotificationState struct {
	ID             int        `gorm:"column:id;primaryKey;autoIncrement"`
	UserID         string     `gorm:"column:user_id;size:36;not null;uniqueIndex:uni_user_notification_state_user_notification;priority:1;index:idx_user_notification_state_user"`
	NotificationID string     `gorm:"column:notification_id;size:100;not null;uniqueIndex:uni_user_notification_state_user_notification;priority:2"`
	ReadAt         *time.Time `gorm:"column:read_at;index:idx_user_notification_state_read"`
	DismissedAt    *time.Time `gorm:"column:dismissed_at;index:idx_user_notification_state_dismissed"`
	CreatedAt      *time.Time `gorm:"column:created_at"`
	UpdatedAt      *time.Time `gorm:"column:updated_at"`
}

func (UserNotificationState) TableName() string {
	return "user_notification_states"
}
