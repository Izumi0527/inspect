package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/auth"
)

type AuthHandler struct {
	Service *auth.Service
}

type loginRequest struct {
	Username   string `json:"username"`
	Password   string `json:"password"`
	RememberMe *bool  `json:"remember_me,omitempty"`
}

type loginResponse struct {
	AccessToken  string       `json:"access_token"`
	RefreshToken string       `json:"refresh_token"`
	TokenType    string       `json:"token_type"`
	ExpiresIn    int          `json:"expires_in"`
	User         auth.UserInfo `json:"user"`
}

type refreshTokenRequest struct {
	RefreshToken string `json:"refresh_token"`
}

func (h AuthHandler) Register(group *echo.Group) {
	group.POST("/auth/login", h.Login)
	group.POST("/auth/refresh", h.RefreshToken)
	group.POST("/auth/logout", h.Logout)
	group.GET("/auth/me", h.Me)
	group.GET("/auth/profile", h.Profile)
	group.GET("/auth/verify", h.Verify)
}

func (h AuthHandler) Login(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "auth service not configured")
	}

	var req loginRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if strings.TrimSpace(req.Username) == "" || strings.TrimSpace(req.Password) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "username and password are required")
	}

	user, err := h.Service.AuthenticateUser(c.Request().Context(), req.Username, req.Password)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to authenticate user")
	}
	if user == nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "用户名或密码错误")
	}

	accessToken, expiresIn, err := h.Service.CreateAccessToken(user.Username)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create access token")
	}

	refreshToken, err := h.Service.CreateRefreshToken(user.Username)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create refresh token")
	}

	userInfo, err := h.Service.BuildUserInfo(c.Request().Context(), user)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to build user info")
	}

	_ = h.Service.UpdateLastLogin(c.Request().Context(), user.ID, c.RealIP())

	return c.JSON(http.StatusOK, loginResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		TokenType:    "bearer",
		ExpiresIn:    expiresIn,
		User:         userInfo,
	})
}

func (h AuthHandler) RefreshToken(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "auth service not configured")
	}

	var req refreshTokenRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if strings.TrimSpace(req.RefreshToken) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "refresh_token is required")
	}

	claims, err := h.Service.VerifyToken(req.RefreshToken, "refresh")
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "刷新令牌无效或已过期")
	}

	user, err := h.Service.GetUserByUsername(c.Request().Context(), claims.Subject)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "用户不存在或已被禁用")
	}
	if user == nil || !authUserActive(user) {
		return echo.NewHTTPError(http.StatusUnauthorized, "用户不存在或已被禁用")
	}

	accessToken, expiresIn, err := h.Service.CreateAccessToken(user.Username)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create access token")
	}

	refreshToken, err := h.Service.CreateRefreshToken(user.Username)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create refresh token")
	}

	userInfo, err := h.Service.BuildUserInfo(c.Request().Context(), user)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to build user info")
	}

	return c.JSON(http.StatusOK, loginResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		TokenType:    "bearer",
		ExpiresIn:    expiresIn,
		User:         userInfo,
	})
}

func (h AuthHandler) Logout(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "auth service not configured")
	}

	_, err := h.requireActiveUser(c)
	if err != nil {
		return err
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"message": "登出成功",
	})
}

func (h AuthHandler) Me(c echo.Context) error {
	return h.profileResponse(c)
}

func (h AuthHandler) Profile(c echo.Context) error {
	return h.profileResponse(c)
}

func (h AuthHandler) Verify(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "auth service not configured")
	}

	token, err := readBearerToken(c)
	if err != nil {
		return err
	}

	user, err := h.Service.GetUserFromToken(c.Request().Context(), token, "access")
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "Could not validate credentials")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"valid": true,
		"user": map[string]interface{}{
			"id":       user.ID,
			"username": user.Username,
			"role":     user.Role,
		},
	})
}

func (h AuthHandler) profileResponse(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "auth service not configured")
	}

	user, err := h.requireActiveUser(c)
	if err != nil {
		return err
	}

	info, err := h.Service.BuildUserInfo(c.Request().Context(), user)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to build user info")
	}

	return c.JSON(http.StatusOK, info)
}

func (h AuthHandler) requireActiveUser(c echo.Context) (*auth.UserRecord, error) {
	token, err := readBearerToken(c)
	if err != nil {
		return nil, err
	}

	user, err := h.Service.GetActiveUserFromToken(c.Request().Context(), token)
	if err != nil {
		if errors.Is(err, auth.ErrUserInactive) {
			return nil, echo.NewHTTPError(http.StatusBadRequest, "用户已被禁用")
		}
		return nil, echo.NewHTTPError(http.StatusUnauthorized, "Could not validate credentials")
	}

	return user, nil
}

func readBearerToken(c echo.Context) (string, error) {
	raw := strings.TrimSpace(c.Request().Header.Get("Authorization"))
	if raw == "" {
		return "", echo.NewHTTPError(http.StatusUnauthorized, "Authorization header missing")
	}

	parts := strings.Fields(raw)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return "", echo.NewHTTPError(http.StatusUnauthorized, "Invalid authorization header")
	}

	token := strings.TrimSpace(parts[1])
	if token == "" {
		return "", echo.NewHTTPError(http.StatusUnauthorized, "Invalid authorization token")
	}

	return token, nil
}

func authUserActive(user *auth.UserRecord) bool {
	if user == nil {
		return false
	}
	if user.IsActive == nil {
		return true
	}
	return *user.IsActive
}
