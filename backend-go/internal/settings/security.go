package settings

import (
	"context"
	"fmt"
	"time"
)

func (s *Service) ListActiveSessions(ctx context.Context) (SessionListResponse, error) {
	if !s.isReady() {
		return SessionListResponse{}, fmt.Errorf("database not initialized")
	}

	rows := make([]struct {
		SessionToken string
		UserID       string
		Username     *string
		IPAddress    *string
		UserAgent    *string
		CreatedAt    *time.Time
		LastAccessed *time.Time
		ExpiresAt    *time.Time
		IsActive     bool
	}, 0)

	query := `
		SELECT s.session_token, s.user_id, u.username, s.ip_address, s.user_agent,
		       s.created_at, s.last_accessed_at, s.expires_at, s.is_active
		FROM user_sessions s
		LEFT JOIN users u ON u.id = s.user_id
		WHERE s.is_active = true AND s.expires_at > ?
		ORDER BY s.last_accessed_at DESC`

	if err := s.db.WithContext(ctx).Raw(query, time.Now().UTC()).Scan(&rows).Error; err != nil {
		return SessionListResponse{}, err
	}

	sessions := make([]SessionInfo, 0, len(rows))
	for _, row := range rows {
		sessions = append(sessions, SessionInfo{
			SessionID:    row.SessionToken,
			UserID:       row.UserID,
			Username:     safeString(row.Username),
			IPAddress:    row.IPAddress,
			UserAgent:    row.UserAgent,
			CreatedAt:    row.CreatedAt,
			LastActivity: row.LastAccessed,
			ExpiresAt:    row.ExpiresAt,
			IsActive:     row.IsActive,
		})
	}

	return SessionListResponse{Total: len(sessions), Sessions: sessions}, nil
}
