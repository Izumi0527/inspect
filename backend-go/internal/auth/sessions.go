package auth

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/settings"
)

func (s *Service) createSession(
	ctx context.Context,
	userID string,
	sid string,
	refreshToken string,
	refreshExpiresAt time.Time,
	ip string,
	userAgent string,
	policy securityPolicy,
) error {
	if !s.isReady() {
		return errors.New("database not initialized")
	}
	uid := strings.TrimSpace(userID)
	if uid == "" {
		return errors.New("user id is required")
	}
	trimmedSid := strings.TrimSpace(sid)
	if trimmedSid == "" {
		return errors.New("sid is required")
	}

	limit := policy.MaxConcurrentSessions
	if limit <= 0 {
		limit = 3
	}

	var active []settings.UserSession
	_ = s.db.WithContext(ctx).
		Model(&settings.UserSession{}).
		Where("user_id = ? AND is_active = ?", uid, true).
		Order("created_at asc").
		Find(&active).Error

	if len(active) >= limit {
		deactivateCount := len(active) - limit + 1
		ids := make([]string, 0, deactivateCount)
		for i := 0; i < deactivateCount; i++ {
			ids = append(ids, active[i].ID)
		}
		_ = s.db.WithContext(ctx).
			Model(&settings.UserSession{}).
			Where("id IN ?", ids).
			Updates(map[string]interface{}{
				"is_active": false,
			}).Error
	}

	now := time.Now().UTC()
	session := settings.UserSession{
		ID:           trimmedSid,
		UserID:       uid,
		SessionToken: trimmedSid,
		IsActive:     true,
		ExpiresAt:    refreshExpiresAt,
		CreatedAt:    &now,
		LastAccessed: &now,
	}
	if trimmed := strings.TrimSpace(refreshToken); trimmed != "" {
		session.RefreshToken = &trimmed
	}
	if trimmed := strings.TrimSpace(ip); trimmed != "" {
		session.IPAddress = &trimmed
	}
	if trimmed := strings.TrimSpace(userAgent); trimmed != "" {
		session.UserAgent = &trimmed
	}

	return s.db.WithContext(ctx).Create(&session).Error
}

func (s *Service) rotateSessionRefreshToken(ctx context.Context, sid string, refreshToken string, refreshExpiresAt time.Time) error {
	if !s.isReady() {
		return errors.New("database not initialized")
	}
	trimmedSid := strings.TrimSpace(sid)
	if trimmedSid == "" {
		return errors.New("sid is required")
	}

	updates := map[string]interface{}{
		"refresh_token":    strings.TrimSpace(refreshToken),
		"expires_at":       refreshExpiresAt,
		"last_accessed_at": time.Now().UTC(),
	}

	return s.db.WithContext(ctx).
		Model(&settings.UserSession{}).
		Where("session_token = ? AND is_active = ?", trimmedSid, true).
		Updates(updates).Error
}

func (s *Service) deactivateSession(ctx context.Context, sid string) error {
	if !s.isReady() {
		return errors.New("database not initialized")
	}
	trimmedSid := strings.TrimSpace(sid)
	if trimmedSid == "" {
		return nil
	}

	return s.db.WithContext(ctx).
		Model(&settings.UserSession{}).
		Where("session_token = ?", trimmedSid).
		Updates(map[string]interface{}{
			"is_active": false,
		}).Error
}

func (s *Service) validateAccessSession(ctx context.Context, userID string, sid string, policy securityPolicy) error {
	if !s.isReady() {
		return ErrTokenInvalid
	}
	uid := strings.TrimSpace(userID)
	trimmedSid := strings.TrimSpace(sid)
	if uid == "" || trimmedSid == "" {
		return ErrTokenInvalid
	}

	var session settings.UserSession
	err := s.db.WithContext(ctx).
		Model(&settings.UserSession{}).
		Where("session_token = ? AND user_id = ? AND is_active = ?", trimmedSid, uid, true).
		Take(&session).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrTokenInvalid
		}
		return ErrTokenInvalid
	}

	now := time.Now().UTC()
	if !session.ExpiresAt.IsZero() && session.ExpiresAt.Before(now) {
		_ = s.deactivateSession(ctx, trimmedSid)
		return ErrTokenInvalid
	}

	if policy.AutoLogoutEnabled && policy.SessionTimeoutMinutes > 0 {
		if session.LastAccessed != nil {
			if session.LastAccessed.Add(time.Duration(policy.SessionTimeoutMinutes) * time.Minute).Before(now) {
				_ = s.deactivateSession(ctx, trimmedSid)
				return ErrTokenInvalid
			}
		}
	}

	// 更新最后访问时间（尽量降低写放大：30秒内不重复更新）
	if session.LastAccessed == nil || now.Sub(*session.LastAccessed) > 30*time.Second {
		_ = s.db.WithContext(ctx).
			Model(&settings.UserSession{}).
			Where("id = ?", session.ID).
			Updates(map[string]interface{}{
				"last_accessed_at": now,
			}).Error
		session.LastAccessed = &now
	}

	// 并发会话数控制：当策略调整后，下一次请求会即时裁剪多余会话
	if policy.MaxConcurrentSessions > 0 {
		ids := make([]string, 0)
		_ = s.db.WithContext(ctx).
			Model(&settings.UserSession{}).
			Where("user_id = ? AND is_active = ?", uid, true).
			Order("last_accessed_at desc, created_at desc").
			Pluck("id", &ids).Error

		if len(ids) > policy.MaxConcurrentSessions {
			toDeactivate := ids[policy.MaxConcurrentSessions:]
			_ = s.db.WithContext(ctx).
				Model(&settings.UserSession{}).
				Where("id IN ?", toDeactivate).
				Updates(map[string]interface{}{"is_active": false}).Error

			for _, id := range toDeactivate {
				if id == session.ID {
					return ErrTokenInvalid
				}
			}
		}
	}

	return nil
}

func (s *Service) validateRefreshSession(ctx context.Context, sid string, refreshToken string) (*settings.UserSession, error) {
	if !s.isReady() {
		return nil, ErrTokenInvalid
	}
	trimmedSid := strings.TrimSpace(sid)
	trimmedToken := strings.TrimSpace(refreshToken)
	if trimmedSid == "" || trimmedToken == "" {
		return nil, ErrTokenInvalid
	}

	var session settings.UserSession
	err := s.db.WithContext(ctx).
		Model(&settings.UserSession{}).
		Where("session_token = ? AND is_active = ? AND refresh_token = ?", trimmedSid, true, trimmedToken).
		Take(&session).Error
	if err != nil {
		return nil, ErrTokenInvalid
	}

	now := time.Now().UTC()
	if !session.ExpiresAt.IsZero() && session.ExpiresAt.Before(now) {
		_ = s.deactivateSession(ctx, trimmedSid)
		return nil, ErrTokenInvalid
	}

	// 自动登出：刷新令牌同样受会话闲置超时控制（立即生效）
	policy := s.loadSecurityPolicy(ctx)
	if policy.AutoLogoutEnabled && policy.SessionTimeoutMinutes > 0 && session.LastAccessed != nil {
		if session.LastAccessed.Add(time.Duration(policy.SessionTimeoutMinutes) * time.Minute).Before(now) {
			_ = s.deactivateSession(ctx, trimmedSid)
			return nil, ErrTokenInvalid
		}
	}

	// 刷新令牌被使用，更新 last_accessed_at
	_ = s.db.WithContext(ctx).
		Model(&settings.UserSession{}).
		Where("id = ?", session.ID).
		Updates(map[string]interface{}{
			"last_accessed_at": now,
		}).Error

	return &session, nil
}

func newSessionID() string {
	return uuid.NewString()
}

func (s *Service) IssueTokensWithSession(ctx context.Context, user *UserRecord, rememberMe bool, ip string, userAgent string) (string, string, int, int, error) {
	if user == nil {
		return "", "", 0, 0, errors.New("user is nil")
	}
	policy := s.loadSecurityPolicy(ctx)

	sid := newSessionID()

	accessToken, expiresIn, err := s.CreateAccessToken(user.Username, sid, policy.SessionTimeoutMinutes)
	if err != nil {
		return "", "", 0, 0, err
	}

	refreshDays := s.cfg.RefreshTokenExpireDays
	if rememberMe && policy.RememberMeEnabled {
		refreshDays = policy.RememberMeDurationDays
	}
	refreshToken, refreshExpiresAt, err := s.CreateRefreshToken(user.Username, sid, refreshDays)
	if err != nil {
		return "", "", 0, 0, err
	}

	if err := s.createSession(ctx, user.ID, sid, refreshToken, refreshExpiresAt, ip, userAgent, policy); err != nil {
		return "", "", 0, 0, err
	}

	refreshExpiresIn := int(time.Until(refreshExpiresAt).Seconds())
	return accessToken, refreshToken, expiresIn, refreshExpiresIn, nil
}

func (s *Service) RefreshTokensWithSession(ctx context.Context, refreshToken string) (string, string, int, int, *UserRecord, error) {
	claims, err := s.VerifyToken(refreshToken, refreshTokenType)
	if err != nil {
		return "", "", 0, 0, nil, err
	}

	user, err := s.GetUserByUsername(ctx, claims.Subject)
	if err != nil {
		return "", "", 0, 0, nil, err
	}
	if user == nil || !isUserActive(user) {
		return "", "", 0, 0, nil, ErrUserInactive
	}

	sid := strings.TrimSpace(claims.Sid)
	if sid == "" {
		return "", "", 0, 0, nil, ErrTokenInvalid
	}

	session, err := s.validateRefreshSession(ctx, sid, refreshToken)
	if err != nil {
		return "", "", 0, 0, nil, err
	}

	policy := s.loadSecurityPolicy(ctx)

	accessToken, expiresIn, err := s.CreateAccessToken(user.Username, sid, policy.SessionTimeoutMinutes)
	if err != nil {
		return "", "", 0, 0, nil, err
	}

	// 刷新令牌轮换：保持原 expires_at，不做滑动延长，避免无界会话。
	newRefreshToken, err := s.createToken(user.Username, refreshTokenType, sid, session.ExpiresAt)
	if err != nil {
		return "", "", 0, 0, nil, err
	}

	if err := s.rotateSessionRefreshToken(ctx, sid, newRefreshToken, session.ExpiresAt); err != nil {
		return "", "", 0, 0, nil, err
	}

	refreshExpiresIn := int(time.Until(session.ExpiresAt).Seconds())
	return accessToken, newRefreshToken, expiresIn, refreshExpiresIn, user, nil
}

func (s *Service) LogoutSession(ctx context.Context, accessToken string) error {
	claims, err := s.VerifyToken(accessToken, accessTokenType)
	if err != nil {
		return err
	}
	sid := strings.TrimSpace(claims.Sid)
	if sid == "" {
		return ErrTokenInvalid
	}
	return s.deactivateSession(ctx, sid)
}
