package settings

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

const passwordHistoryCountKey = "security.password.password_history_count"

// passwordReusedRecently 判断新口令是否与任一近期哈希匹配；无法解析的哈希直接跳过。
func passwordReusedRecently(newPassword string, recentHashes []string) bool {
	for _, hash := range recentHashes {
		if strings.TrimSpace(hash) == "" {
			continue
		}
		if bcrypt.CompareHashAndPassword([]byte(hash), []byte(newPassword)) == nil {
			return true
		}
	}
	return false
}

// rejectRecentPasswordReuse 按策略 N（0 表示不限制）拒绝与“当前口令 + 最近 N-1 次历史口令”
// 重复的新口令。返回当前口令哈希供改密后归档。
func (s *Service) rejectRecentPasswordReuse(ctx context.Context, userID string, newPassword string) (currentHash string, err error) {
	var user User
	if err := s.db.WithContext(ctx).
		Select("hashed_password").
		Where("id = ?", userID).
		Take(&user).Error; err != nil {
		return "", err
	}
	currentHash = user.HashedPassword

	historyCount := s.getSettingInt(ctx, passwordHistoryCountKey, 5)
	if historyCount <= 0 {
		return currentHash, nil
	}

	recent := []string{currentHash}
	if historyCount > 1 {
		var rows []UserPasswordHistory
		if err := s.db.WithContext(ctx).
			Where("user_id = ?", userID).
			Order("created_at desc").
			Limit(historyCount - 1).
			Find(&rows).Error; err != nil {
			return "", err
		}
		for _, row := range rows {
			recent = append(recent, row.HashedPassword)
		}
	}

	if passwordReusedRecently(newPassword, recent) {
		return "", fmt.Errorf("新密码不能与最近 %d 次使用过的密码相同", historyCount)
	}
	return currentHash, nil
}

// archivePasswordHash 把改密前的旧哈希写入历史表；写入失败只影响下次历史比对，不回滚改密。
func (s *Service) archivePasswordHash(ctx context.Context, userID string, oldHash string) error {
	if strings.TrimSpace(oldHash) == "" {
		return nil
	}
	now := time.Now().UTC()
	return s.db.WithContext(ctx).Create(&UserPasswordHistory{
		ID:             uuid.NewString(),
		UserID:         userID,
		HashedPassword: oldHash,
		CreatedAt:      &now,
	}).Error
}
