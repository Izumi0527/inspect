package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/auth"
)

func requirePermission(c echo.Context, authService *auth.Service, permission string) (*auth.UserRecord, error) {
	if authService == nil {
		return nil, echo.NewHTTPError(http.StatusServiceUnavailable, "auth service not configured")
	}

	token, err := readBearerToken(c)
	if err != nil {
		return nil, err
	}

	user, err := authService.GetActiveUserFromToken(c.Request().Context(), token)
	if err != nil {
		if errors.Is(err, auth.ErrUserInactive) {
			return nil, echo.NewHTTPError(http.StatusBadRequest, "用户已被禁用")
		}
		return nil, echo.NewHTTPError(http.StatusUnauthorized, "Could not validate credentials")
	}

	if strings.TrimSpace(permission) == "" {
		return user, nil
	}

	permissions, err := authService.GetPermissionsByRole(c.Request().Context(), user.Role)
	if err != nil {
		return nil, echo.NewHTTPError(http.StatusInternalServerError, "failed to resolve permissions")
	}

	if !hasPermission(permission, permissions) {
		return nil, echo.NewHTTPError(http.StatusForbidden, fmt.Sprintf("Permission denied: %s", permission))
	}

	return user, nil
}

func hasPermission(permission string, permissions []string) bool {
	for _, item := range permissions {
		if item == permission {
			return true
		}
	}
	return false
}
