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
)

var (
	ErrTokenInvalid      = errors.New("invalid token")
	ErrTokenTypeMismatch = errors.New("invalid token type")
	ErrUserInactive      = errors.New("inactive user")
)

type Service struct {
	db     *gorm.DB
	cfg    config.Config
	logger *zap.Logger
}

type Claims struct {
	Type string `json:"type"`
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
	if err := bcrypt.CompareHashAndPassword([]byte(user.HashedPassword), []byte(password)); err != nil {
		return nil, nil
	}
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
		Select("id, username, email, full_name, avatar, role, is_active, hashed_password, last_login_at, created_at, updated_at").
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

	return result, nil
}

func (s *Service) CreateAccessToken(username string) (string, int, error) {
	expiresIn := s.cfg.AccessTokenExpireMinutes * 60
	expireAt := time.Now().UTC().Add(time.Duration(expiresIn) * time.Second)
	token, err := s.createToken(username, accessTokenType, expireAt)
	if err != nil {
		return "", 0, err
	}
	return token, expiresIn, nil
}

func (s *Service) CreateRefreshToken(username string) (string, error) {
	expireAt := time.Now().UTC().Add(time.Duration(s.cfg.RefreshTokenExpireDays) * 24 * time.Hour)
	return s.createToken(username, refreshTokenType, expireAt)
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
	user, err := s.GetUserFromToken(ctx, tokenStr, accessTokenType)
	if err != nil {
		return nil, err
	}
	if !isUserActive(user) {
		return nil, ErrUserInactive
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

func (s *Service) createToken(username string, tokenType string, expiresAt time.Time) (string, error) {
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
