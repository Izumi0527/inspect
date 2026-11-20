package monitoring

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// MaxUserPinnedDevices 限制单用户星标关注设备上限，防止大屏关注池无限膨胀。
const MaxUserPinnedDevices = 50

var (
	ErrPinLimitExceeded = errors.New("星标关注设备已达上限（最多 50 台）")
	ErrInvalidPinAction = errors.New("invalid pin action")
)

// PinnedDeviceItem 表示用户星标关注的设备摘要。
type PinnedDeviceItem struct {
	DeviceID  int       `json:"device_id"`
	Name      string    `json:"name"`
	IPAddress string    `json:"ip_address"`
	Status    string    `json:"status"`
	PinnedAt  time.Time `json:"pinned_at"`
}

// PinnedDevicesResponse 表示用户星标关注列表响应。
type PinnedDevicesResponse struct {
	DeviceIDs []int              `json:"device_ids"`
	Items     []PinnedDeviceItem `json:"items"`
	Total     int                `json:"total"`
	Limit     int                `json:"limit"`
}

// ListUserPinnedDevices 查询指定用户的星标关注设备列表。
func (w *MetricsWriter) ListUserPinnedDevices(ctx context.Context, userID string) (PinnedDevicesResponse, error) {
	resp := PinnedDevicesResponse{
		DeviceIDs: []int{},
		Items:     []PinnedDeviceItem{},
		Limit:     MaxUserPinnedDevices,
	}
	if w == nil || w.db == nil {
		return resp, fmt.Errorf("database not initialized")
	}
	uid := strings.TrimSpace(userID)
	if uid == "" {
		return resp, fmt.Errorf("user_id is required")
	}

	type pinRow struct {
		DeviceID  int       `gorm:"column:device_id"`
		Name      string    `gorm:"column:name"`
		IPAddress string    `gorm:"column:ip_address"`
		Status    string    `gorm:"column:status"`
		CreatedAt time.Time `gorm:"column:created_at"`
	}
	rows := make([]pinRow, 0)
	if err := w.db.WithContext(ctx).
		Table("user_pinned_devices AS p").
		Select("p.device_id, d.name, d.ip_address, d.status, p.created_at").
		Joins("JOIN devices AS d ON d.id = p.device_id").
		Where("p.user_id = ?", uid).
		Order("p.created_at DESC, p.device_id ASC").
		Scan(&rows).Error; err != nil {
		return resp, err
	}

	for _, r := range rows {
		resp.DeviceIDs = append(resp.DeviceIDs, r.DeviceID)
		resp.Items = append(resp.Items, PinnedDeviceItem{
			DeviceID:  r.DeviceID,
			Name:      r.Name,
			IPAddress: r.IPAddress,
			Status:    r.Status,
			PinnedAt:  r.CreatedAt.UTC(),
		})
	}
	resp.Total = len(resp.Items)
	return resp, nil
}

// PinDeviceForUser 在事务中校验设备存在性与单用户 50 台上限后添加星标。
func (w *MetricsWriter) PinDeviceForUser(ctx context.Context, userID string, deviceID int) error {
	if w == nil || w.db == nil {
		return fmt.Errorf("database not initialized")
	}
	uid := strings.TrimSpace(userID)
	if uid == "" {
		return fmt.Errorf("user_id is required")
	}
	if deviceID <= 0 {
		return fmt.Errorf("invalid device_id")
	}

	return w.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var foundID int
		if err := tx.Table("devices").Select("id").Where("id = ?", deviceID).Take(&foundID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrDeviceNotFound
			}
			return err
		}

		var existingCount int64
		if err := tx.Table("user_pinned_devices").
			Where("user_id = ? AND device_id = ?", uid, deviceID).
			Count(&existingCount).Error; err != nil {
			return err
		}
		if existingCount > 0 {
			return nil
		}

		var totalCount int64
		if err := tx.Table("user_pinned_devices").
			Where("user_id = ?", uid).
			Count(&totalCount).Error; err != nil {
			return err
		}
		if totalCount >= MaxUserPinnedDevices {
			return ErrPinLimitExceeded
		}

		pin := UserPinnedDevice{
			UserID:    uid,
			DeviceID:  deviceID,
			CreatedAt: time.Now().UTC(),
		}
		return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&pin).Error
	})
}

// UnpinDeviceForUser 移除当前用户的指定设备星标。
func (w *MetricsWriter) UnpinDeviceForUser(ctx context.Context, userID string, deviceID int) error {
	if w == nil || w.db == nil {
		return fmt.Errorf("database not initialized")
	}
	uid := strings.TrimSpace(userID)
	if uid == "" {
		return fmt.Errorf("user_id is required")
	}
	if deviceID <= 0 {
		return fmt.Errorf("invalid device_id")
	}

	return w.db.WithContext(ctx).
		Where("user_id = ? AND device_id = ?", uid, deviceID).
		Delete(&UserPinnedDevice{}).Error
}

// BatchPinDevicesForUser 在事务中批量添加或移除当前用户的星标设备。
func (w *MetricsWriter) BatchPinDevicesForUser(ctx context.Context, userID string, action string, deviceIDs []int) (int, error) {
	if w == nil || w.db == nil {
		return 0, fmt.Errorf("database not initialized")
	}
	uid := strings.TrimSpace(userID)
	if uid == "" {
		return 0, fmt.Errorf("user_id is required")
	}
	cleanIDs := dedupePositiveInts(deviceIDs)
	if len(cleanIDs) == 0 {
		return 0, fmt.Errorf("device_ids is required")
	}

	normalizedAction := strings.ToLower(strings.TrimSpace(action))
	switch normalizedAction {
	case "unpin", "remove":
		res := w.db.WithContext(ctx).
			Where("user_id = ? AND device_id IN ?", uid, cleanIDs).
			Delete(&UserPinnedDevice{})
		return int(res.RowsAffected), res.Error
	case "pin", "add", "":
		// 继续执行添加逻辑
	default:
		return 0, ErrInvalidPinAction
	}

	var affected int
	err := w.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var existingDeviceIDs []int
		if err := tx.Table("devices").
			Where("id IN ?", cleanIDs).
			Pluck("id", &existingDeviceIDs).Error; err != nil {
			return err
		}
		if len(existingDeviceIDs) == 0 {
			return ErrDeviceNotFound
		}

		var alreadyPinned []int
		if err := tx.Table("user_pinned_devices").
			Where("user_id = ?", uid).
			Pluck("device_id", &alreadyPinned).Error; err != nil {
			return err
		}

		pinnedSet := make(map[int]struct{}, len(alreadyPinned))
		for _, id := range alreadyPinned {
			pinnedSet[id] = struct{}{}
		}

		toInsert := make([]UserPinnedDevice, 0, len(existingDeviceIDs))
		now := time.Now().UTC()
		for _, id := range existingDeviceIDs {
			if _, ok := pinnedSet[id]; ok {
				continue
			}
			toInsert = append(toInsert, UserPinnedDevice{
				UserID:    uid,
				DeviceID:  id,
				CreatedAt: now,
			})
		}

		if len(alreadyPinned)+len(toInsert) > MaxUserPinnedDevices {
			return ErrPinLimitExceeded
		}
		if len(toInsert) == 0 {
			return nil
		}

		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&toInsert).Error; err != nil {
			return err
		}
		affected = len(toInsert)
		return nil
	})
	return affected, err
}

func dedupePositiveInts(raw []int) []int {
	if len(raw) == 0 {
		return nil
	}
	seen := make(map[int]struct{}, len(raw))
	out := make([]int, 0, len(raw))
	for _, id := range raw {
		if id <= 0 {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}
