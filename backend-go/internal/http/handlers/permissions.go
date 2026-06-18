package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"reflect"
	"strings"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/auth"
)

type PermissionService interface {
	GetActiveUserFromToken(ctx context.Context, tokenStr string) (*auth.UserRecord, error)
	GetPermissionsByRole(ctx context.Context, role string) ([]string, error)
}

const (
	authContextUserKey        = auth.ContextUserKey
	authContextPermissionsKey = "auth.permissions"
)

func isNilPermissionService(service PermissionService) bool {
	if service == nil {
		return true
	}
	value := reflect.ValueOf(service)
	switch value.Kind() {
	case reflect.Ptr, reflect.Interface, reflect.Slice, reflect.Map, reflect.Func:
		return value.IsNil()
	default:
		return false
	}
}

func requirePermission(c echo.Context, authService PermissionService, permission string) (*auth.UserRecord, error) {
	if isNilPermissionService(authService) {
		return nil, echo.NewHTTPError(http.StatusServiceUnavailable, "auth service not configured")
	}

	user, ok := c.Get(authContextUserKey).(*auth.UserRecord)
	if !ok || user == nil {
		token, err := readBearerToken(c)
		if err != nil {
			return nil, err
		}

		user, err = authService.GetActiveUserFromToken(c.Request().Context(), token)
		if err != nil {
			if errors.Is(err, auth.ErrUserInactive) {
				return nil, echo.NewHTTPError(http.StatusBadRequest, "用户已被禁用")
			}
			return nil, echo.NewHTTPError(http.StatusUnauthorized, "Could not validate credentials")
		}
		c.Set(authContextUserKey, user)
	}

	if strings.TrimSpace(permission) == "" {
		return user, nil
	}

	permissions, err := getCurrentPermissions(c, authService, user)
	if err != nil {
		return nil, err
	}

	if !hasPermission(permission, permissions) {
		return nil, echo.NewHTTPError(http.StatusForbidden, fmt.Sprintf("Permission denied: %s", permission))
	}

	return user, nil
}

func getCurrentPermissions(c echo.Context, authService PermissionService, user *auth.UserRecord) ([]string, error) {
	if permissions, ok := c.Get(authContextPermissionsKey).([]string); ok {
		normalized := auth.NormalizePermissionList(permissions)
		c.Set(authContextPermissionsKey, normalized)
		return normalized, nil
	}

	if user == nil {
		var err error
		user, err = requirePermission(c, authService, "")
		if err != nil {
			return nil, err
		}
	}

	if isNilPermissionService(authService) {
		return nil, echo.NewHTTPError(http.StatusServiceUnavailable, "auth service not configured")
	}

	permissions, err := authService.GetPermissionsByRole(c.Request().Context(), user.Role)
	if err != nil {
		return nil, echo.NewHTTPError(http.StatusInternalServerError, "failed to resolve permissions")
	}

	normalized := auth.NormalizePermissionList(permissions)
	c.Set(authContextPermissionsKey, normalized)
	return normalized, nil
}

func hasPermission(permission string, permissions []string) bool {
	required := auth.NormalizePermissionName(permission)
	if required == "" {
		return true
	}
	for _, item := range permissions {
		if auth.NormalizePermissionName(item) == required {
			return true
		}
	}
	return false
}
