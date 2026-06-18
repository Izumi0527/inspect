package auth

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/config"
)

const (
	accessTokenType  = "access"
	refreshTokenType = "refresh"

	// ContextUserKey 为请求上下文中存放已认证用户（*UserRecord）的统一键。
	// 全局认证中间件与各 handler 共用，避免重复校验 token。
	ContextUserKey = "auth.user"
)

var (
	ErrTokenInvalid      = errors.New("invalid token")
	ErrTokenTypeMismatch = errors.New("invalid token type")
	ErrUserInactive      = errors.New("inactive user")
	ErrUserLocked        = errors.New("user locked")
)

type Service struct {
	db     *gorm.DB
	cfg    config.Config
	logger *zap.Logger
}

type Claims struct {
	Type string `json:"type"`
	Sid  string `json:"sid,omitempty"`
	jwt.RegisteredClaims
}

type UserRecord struct {
	ID             string     `gorm:"column:id"`
	Username       string     `gorm:"column:username"`
	Email          string     `gorm:"column:email"`
	FullName       *string    `gorm:"column:full_name"`
	Avatar         *string    `gorm:"column:avatar"`
	Role           string     `gorm:"column:role"`
	IsActive       *bool      `gorm:"column:is_active"`
	HashedPassword string     `gorm:"column:hashed_password"`
	LastLoginAt    *time.Time `gorm:"column:last_login_at"`
	LoginAttempts  *int       `gorm:"column:login_attempts"`
	LockedUntil    *time.Time `gorm:"column:locked_until"`
	CreatedAt      *time.Time `gorm:"column:created_at"`
	UpdatedAt      *time.Time `gorm:"column:updated_at"`
}

type UserInfo struct {
	ID          string     `json:"id"`
	Username    string     `json:"username"`
	Email       string     `json:"email"`
	FullName    *string    `json:"full_name,omitempty"`
	Avatar      *string    `json:"avatar,omitempty"`
	Role        string     `json:"role"`
	Permissions []string   `json:"permissions"`
	IsActive    bool       `json:"is_active"`
	LastLoginAt *time.Time `json:"last_login_at,omitempty"`
	CreatedAt   *time.Time `json:"created_at,omitempty"`
	UpdatedAt   *time.Time `json:"updated_at,omitempty"`
}

func NewService(db *gorm.DB, cfg config.Config, logger *zap.Logger) *Service {
	return &Service{
		db:     db,
		cfg:    cfg,
		logger: logger,
	}
}

func (s *Service) AuthenticateUser(ctx context.Context, username string, password string) (*UserRecord, error) {
	user, err := s.GetUserByUsername(ctx, username)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	if !isUserActive(user) {
		return nil, nil
	}

	// 登录锁定检查（安全策略：security.password.max_login_attempts / lockout_duration）
	if isUserLocked(user) {
		return nil, ErrUserLocked
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.HashedPassword), []byte(password)); err != nil {
		// 失败次数累加并可能触发锁定
		policy := s.loadSecurityPolicy(ctx)
		_ = s.onLoginFailed(ctx, user.ID, policy)
		return nil, nil
	}

	// 登录成功：清理失败次数/锁定状态
	_ = s.onLoginSucceeded(ctx, user.ID)
	return user, nil
}

func (s *Service) GetUserByUsername(ctx context.Context, username string) (*UserRecord, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	normalized := strings.ToLower(strings.TrimSpace(username))
	if normalized == "" {
		return nil, gorm.ErrRecordNotFound
	}

	var user UserRecord
	if err := s.db.WithContext(ctx).
		Table("users").
		Select("id, username, email, full_name, avatar, role, is_active, hashed_password, last_login_at, login_attempts, locked_until, created_at, updated_at").
		Where("username = ?", normalized).
		Take(&user).Error; err != nil {
		return nil, err
	}

	return &user, nil
}

func (s *Service) BuildUserInfo(ctx context.Context, user *UserRecord) (UserInfo, error) {
	if user == nil {
		return UserInfo{}, fmt.Errorf("user is nil")
	}

	permissions, err := s.GetPermissionsByRole(ctx, user.Role)
	if err != nil {
		return UserInfo{}, err
	}

	return UserInfo{
		ID:          user.ID,
		Username:    user.Username,
		Email:       user.Email,
		FullName:    user.FullName,
		Avatar:      user.Avatar,
		Role:        user.Role,
		Permissions: permissions,
		IsActive:    isUserActive(user),
		LastLoginAt: user.LastLoginAt,
		CreatedAt:   user.CreatedAt,
		UpdatedAt:   user.UpdatedAt,
	}, nil
}

func (s *Service) GetPermissionsByRole(ctx context.Context, role string) ([]string, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	roleName := strings.TrimSpace(role)
	if roleName == "" {
		return []string{}, nil
	}

	type row struct {
		Name string `gorm:"column:name"`
	}

	rows := make([]row, 0)
	query := `
        SELECT p.name
        FROM roles r
        JOIN role_permissions rp ON rp.role_id = r.id
        JOIN permissions p ON p.id = rp.permission_id
        WHERE r.name = ?
        ORDER BY p.name`

	if err := s.db.WithContext(ctx).Raw(query, roleName).Scan(&rows).Error; err != nil {
		return nil, err
	}

	result := make([]string, 0, len(rows))
	for _, item := range rows {
		if strings.TrimSpace(item.Name) == "" {
			continue
		}
		result = append(result, item.Name)
	}

	return NormalizePermissionList(result), nil
}

func (s *Service) CreateAccessToken(username string, sid string, expireMinutes int) (string, int, error) {
	minutes := expireMinutes
	if minutes <= 0 {
		minutes = s.cfg.AccessTokenExpireMinutes
	}
	expiresIn := minutes * 60
	expireAt := time.Now().UTC().Add(time.Duration(expiresIn) * time.Second)
	token, err := s.createToken(username, accessTokenType, sid, expireAt)
	if err != nil {
		return "", 0, err
	}
	return token, expiresIn, nil
}

func (s *Service) CreateRefreshToken(username string, sid string, expireDays int) (string, time.Time, error) {
	days := expireDays
	if days <= 0 {
		days = s.cfg.RefreshTokenExpireDays
	}
	expireAt := time.Now().UTC().Add(time.Duration(days) * 24 * time.Hour)
	token, err := s.createToken(username, refreshTokenType, sid, expireAt)
	if err != nil {
		return "", time.Time{}, err
	}
	return token, expireAt, nil
}

func (s *Service) VerifyToken(tokenStr string, expectedType string) (*Claims, error) {
	if strings.TrimSpace(tokenStr) == "" {
		return nil, ErrTokenInvalid
	}

	algorithm := strings.TrimSpace(s.cfg.JWTAlgorithm)
	if algorithm == "" {
		algorithm = "HS256"
	}

	key, err := s.jwtKey()
	if err != nil {
		return nil, err
	}

	parser := jwt.NewParser(jwt.WithValidMethods([]string{algorithm}))
	claims := &Claims{}
	token, err := parser.ParseWithClaims(tokenStr, claims, func(_ *jwt.Token) (interface{}, error) {
		return key, nil
	})
	if err != nil || !token.Valid {
		return nil, ErrTokenInvalid
	}

	if strings.TrimSpace(expectedType) != "" && claims.Type != expectedType {
		return nil, ErrTokenTypeMismatch
	}
	if strings.TrimSpace(claims.Subject) == "" {
		return nil, ErrTokenInvalid
	}

	return claims, nil
}

func (s *Service) GetUserFromToken(ctx context.Context, tokenStr string, tokenType string) (*UserRecord, error) {
	claims, err := s.VerifyToken(tokenStr, tokenType)
	if err != nil {
		return nil, err
	}

	user, err := s.GetUserByUsername(ctx, claims.Subject)
	if err != nil {
		return nil, err
	}

	return user, nil
}

func (s *Service) GetActiveUserFromToken(ctx context.Context, tokenStr string) (*UserRecord, error) {
	claims, err := s.VerifyToken(tokenStr, accessTokenType)
	if err != nil {
		return nil, err
	}

	user, err := s.GetUserByUsername(ctx, claims.Subject)
	if err != nil {
		return nil, err
	}
	if !isUserActive(user) {
		return nil, ErrUserInactive
	}

	sid := strings.TrimSpace(claims.Sid)
	if sid == "" {
		return nil, ErrTokenInvalid
	}
	policy := s.loadSecurityPolicy(ctx)
	if err := s.validateAccessSession(ctx, user.ID, sid, policy); err != nil {
		return nil, err
	}

	return user, nil
}

func (s *Service) UpdateLastLogin(ctx context.Context, userID string, ip string) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	if strings.TrimSpace(userID) == "" {
		return fmt.Errorf("user id is required")
	}

	updates := map[string]interface{}{
		"last_login_at": time.Now().UTC(),
	}
	if strings.TrimSpace(ip) != "" {
		updates["last_login_ip"] = strings.TrimSpace(ip)
	}

	return s.db.WithContext(ctx).
		Table("users").
		Where("id = ?", userID).
		Updates(updates).
		Error
}

func (s *Service) createToken(username string, tokenType string, sid string, expiresAt time.Time) (string, error) {
	algorithm := strings.TrimSpace(s.cfg.JWTAlgorithm)
	if algorithm == "" {
		algorithm = "HS256"
	}

	method := jwt.GetSigningMethod(algorithm)
	if method == nil {
		return "", fmt.Errorf("unsupported jwt algorithm: %s", algorithm)
	}

	key, err := s.jwtKey()
	if err != nil {
		return "", err
	}

	claims := Claims{
		Type: tokenType,
		Sid:  strings.TrimSpace(sid),
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   username,
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}

	token := jwt.NewWithClaims(method, claims)
	return token.SignedString(key)
}

func (s *Service) jwtKey() ([]byte, error) {
	secret := strings.TrimSpace(s.cfg.JWTSecretKey)
	if secret == "" {
		secret = strings.TrimSpace(s.cfg.SecretKey)
	}
	if secret == "" {
		return nil, fmt.Errorf("jwt secret not configured")
	}
	return []byte(secret), nil
}

func isUserActive(user *UserRecord) bool {
	if user == nil {
		return false
	}
	if user.IsActive == nil {
		return true
	}
	return *user.IsActive
}

func isUserLocked(user *UserRecord) bool {
	if user == nil || user.LockedUntil == nil {
		return false
	}
	return user.LockedUntil.After(time.Now().UTC())
}

func (s *Service) isReady() bool {
	return s != nil && s.db != nil
}
