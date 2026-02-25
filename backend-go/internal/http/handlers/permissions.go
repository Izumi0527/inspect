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
