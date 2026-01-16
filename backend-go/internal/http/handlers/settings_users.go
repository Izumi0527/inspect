package handlers

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/settings"
)

func (h SettingsHandler) GetUsers(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "users:read"); err != nil {
		return err
	}

	page, _ := strconv.Atoi(c.QueryParam("page"))
	pageSize, _ := strconv.Atoi(c.QueryParam("page_size"))

	query := settings.UserQuery{
		Page:      page,
		PageSize:  pageSize,
		Search:    strings.TrimSpace(c.QueryParam("search")),
		Keyword:   strings.TrimSpace(c.QueryParam("keyword")),
		Role:      strings.TrimSpace(c.QueryParam("role")),
		Status:    strings.TrimSpace(c.QueryParam("status")),
		SortBy:    strings.TrimSpace(c.QueryParam("sort_by")),
		SortOrder: strings.TrimSpace(c.QueryParam("sort_order")),
	}

	resp, err := h.Service.ListUsers(c.Request().Context(), query)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "获取用户列表失败")
	}

	return c.JSON(http.StatusOK, resp)
}

func (h SettingsHandler) GetUserStats(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "users:read"); err != nil {
		return err
	}

	resp, err := h.Service.GetUserStats(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "获取用户统计失败")
	}

	return c.JSON(http.StatusOK, resp)
}

func (h SettingsHandler) GetUser(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "users:read"); err != nil {
		return err
	}

	userID := c.Param("user_id")
	user, err := h.Service.GetUserByID(c.Request().Context(), userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "用户不存在")
	}

	return c.JSON(http.StatusOK, user)
}

func (h SettingsHandler) CreateUser(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "users:create"); err != nil {
		return err
	}

	payload := map[string]interface{}{}
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	user, _ := requirePermission(c, h.Auth, "")
	createdBy := ""
	if user != nil {
		createdBy = user.ID
	}

	created, err := h.Service.CreateUser(c.Request().Context(), payload, createdBy)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.JSON(http.StatusCreated, created)
}

func (h SettingsHandler) UpdateUser(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "users:update"); err != nil {
		return err
	}

	payload := map[string]interface{}{}
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	userID := c.Param("user_id")
	user, err := h.Service.UpdateUser(c.Request().Context(), userID, payload)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.JSON(http.StatusOK, user)
}

func (h SettingsHandler) DeleteUser(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	currentUser, err := requirePermission(c, h.Auth, "users:delete")
	if err != nil {
		return err
	}

	userID := c.Param("user_id")
	if currentUser != nil && userID == currentUser.ID {
		return echo.NewHTTPError(http.StatusBadRequest, "不能删除自己的账户")
	}

	if err := h.Service.DeleteUser(c.Request().Context(), userID); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.NoContent(http.StatusNoContent)
}

func (h SettingsHandler) ChangeUserPassword(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "users:update"); err != nil {
		return err
	}

	payload := map[string]interface{}{}
	_ = c.Bind(&payload)

	newPassword := readString(payload, "new_password", "newPassword")
	if strings.TrimSpace(newPassword) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "new_password is required")
	}

	userID := c.Param("user_id")
	if err := h.Service.ChangePassword(c.Request().Context(), userID, newPassword); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, map[string]interface{}{"success": true})
}

func (h SettingsHandler) ActivateUser(c echo.Context) error {
	return h.setUserActive(c, true)
}

func (h SettingsHandler) DeactivateUser(c echo.Context) error {
	return h.setUserActive(c, false)
}

func (h SettingsHandler) setUserActive(c echo.Context, active bool) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "users:update"); err != nil {
		return err
	}

	userID := c.Param("user_id")
	if err := h.Service.SetUserActive(c.Request().Context(), userID, active); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"success": true})
}

func (h SettingsHandler) LockUser(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "users:update"); err != nil {
		return err
	}

	userID := c.Param("user_id")
	if err := h.Service.LockUser(c.Request().Context(), userID); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"success": true})
}

func (h SettingsHandler) UnlockUser(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "users:update"); err != nil {
		return err
	}

	userID := c.Param("user_id")
	if err := h.Service.UnlockUser(c.Request().Context(), userID); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"success": true})
}

func (h SettingsHandler) BatchUsers(c echo.Context) error {
	return h.batchUsersInternal(c)
}

func (h SettingsHandler) BatchUsersAlias(c echo.Context) error {
	return h.batchUsersInternal(c)
}

func (h SettingsHandler) BatchUsersLegacy(c echo.Context) error {
	return h.batchUsersInternal(c)
}

func (h SettingsHandler) batchUsersInternal(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "users:update"); err != nil {
		return err
	}

	payload := map[string]interface{}{}
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	userIDs := readStringSlice(payload, "user_ids", "userIds")
	if len(userIDs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "user_ids is required")
	}

	operation := readString(payload, "operation", "type")
	params := map[string]interface{}{}
	if raw, ok := payload["params"].(map[string]interface{}); ok {
		params = raw
	}

	resp, err := h.Service.BatchOperateUsers(c.Request().Context(), userIDs, operation, params)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, resp)
}

func (h SettingsHandler) ImportUsers(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "users:create"); err != nil {
		return err
	}

	users, forcePasswordChange, err := parseImportUsersPayload(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	operator, _ := requirePermission(c, h.Auth, "")
	createdBy := ""
	if operator != nil {
		createdBy = operator.ID
	}

	resp, err := h.Service.ImportUsers(c.Request().Context(), users, forcePasswordChange, createdBy)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "用户导入失败")
	}

	return c.JSON(http.StatusOK, resp)
}

func parseImportUsersPayload(c echo.Context) ([]settings.ImportUserPayload, bool, error) {
	contentType := c.Request().Header.Get("Content-Type")
	payload := map[string]interface{}{}

	if strings.Contains(contentType, "multipart/form-data") {
		file, err := c.FormFile("file")
		if err != nil {
			return nil, false, fmt.Errorf("导入文件不能为空")
		}
		src, err := file.Open()
		if err != nil {
			return nil, false, fmt.Errorf("读取导入文件失败")
		}
		defer src.Close()

		data, err := io.ReadAll(src)
		if err != nil {
			return nil, false, fmt.Errorf("读取导入文件失败")
		}

		forceValue, hasForce := parseBoolValue(readString(map[string]interface{}{
			"forcePasswordChange": c.FormValue("forcePasswordChange"),
			"force_password_change": c.FormValue("force_password_change"),
		}, "forcePasswordChange", "force_password_change"))

		if isLikelyJSONFile(file.Filename, data) {
			if err := json.Unmarshal(data, &payload); err != nil {
				return nil, false, fmt.Errorf("导入文件解析失败")
			}

			usersValue, ok := payload["users"]
			if !ok {
				return nil, false, fmt.Errorf("缺少 users 字段")
			}

			users, err := decodeImportUsers(usersValue)
			if err != nil {
				return nil, false, err
			}

			forcePasswordChange := readBoolWithDefault(payload, "forcePasswordChange", "force_password_change", false)
			if hasForce {
				forcePasswordChange = forceValue
			}
			return users, forcePasswordChange, nil
		}

		users, err := decodeImportUsersCSV(data)
		if err != nil {
			return nil, false, err
		}

		if hasForce {
			return users, forceValue, nil
		}
		return users, false, nil
	} else {
		if err := c.Bind(&payload); err != nil {
			return nil, false, fmt.Errorf("请求体解析失败")
		}
	}

	usersValue, ok := payload["users"]
	if !ok {
		return nil, false, fmt.Errorf("缺少 users 字段")
	}

	users, err := decodeImportUsers(usersValue)
	if err != nil {
		return nil, false, err
	}

	forcePasswordChange := readBoolWithDefault(payload, "forcePasswordChange", "force_password_change", false)
	return users, forcePasswordChange, nil
}

func decodeImportUsers(value interface{}) ([]settings.ImportUserPayload, error) {
	rawList, ok := value.([]interface{})
	if !ok {
		return nil, fmt.Errorf("users 必须为数组")
	}

	users := make([]settings.ImportUserPayload, 0, len(rawList))
	for _, raw := range rawList {
		item, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		var forceValue *bool
		if parsed, ok := readBool(item, "force_password_change", "forcePasswordChange"); ok {
			forceValue = &parsed
		}
		users = append(users, settings.ImportUserPayload{
			Username: readString(item, "username"),
			Email:    readString(item, "email"),
			FullName: readString(item, "full_name", "fullName"),
			Role:     normalizeUserRole(readString(item, "role")),
			Password: readString(item, "password"),
			Status:   normalizeUserStatus(readString(item, "status")),
			ForcePasswordChange: forceValue,
		})
	}

	if len(users) == 0 {
		return nil, fmt.Errorf("users 不能为空")
	}

	return users, nil
}

func decodeImportUsersCSV(data []byte) ([]settings.ImportUserPayload, error) {
	clean := bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
	reader := csv.NewReader(bytes.NewReader(clean))
	reader.TrimLeadingSpace = true
	reader.FieldsPerRecord = -1
	reader.LazyQuotes = true

	headers, err := reader.Read()
	if err != nil {
		return nil, fmt.Errorf("CSV 表头解析失败")
	}

	normalizedHeaders := make([]string, len(headers))
	hasExplicitUsername := false
	for i, header := range headers {
		normalized := normalizeCSVHeader(header)
		normalizedHeaders[i] = normalized
		if field, ok := userImportHeaderAlias[normalized]; ok && field == "username" {
			hasExplicitUsername = true
		}
	}

	fieldMap := make([]string, len(headers))
	for i, normalized := range normalizedHeaders {
		if normalized == "name" {
			if hasExplicitUsername {
				fieldMap[i] = "fullName"
			} else {
				fieldMap[i] = "username"
			}
			continue
		}
		if field, ok := userImportHeaderAlias[normalized]; ok {
			fieldMap[i] = field
		}
	}

	hasUsername := false
	hasEmail := false
	for _, field := range fieldMap {
		if field == "username" {
			hasUsername = true
		}
		if field == "email" {
			hasEmail = true
		}
	}

	if !hasUsername || !hasEmail {
		return nil, fmt.Errorf("CSV 必须包含用户名和邮箱列")
	}

	users := make([]settings.ImportUserPayload, 0)
	for {
		row, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("CSV 内容解析失败")
		}
		payload := settings.ImportUserPayload{}
		for i, cell := range row {
			if i >= len(fieldMap) {
				continue
			}
			field := fieldMap[i]
			value := strings.TrimSpace(cell)
			if value == "" || field == "" {
				continue
			}
			switch field {
			case "username":
				payload.Username = value
			case "email":
				payload.Email = value
			case "fullName":
				payload.FullName = value
			case "role":
				payload.Role = normalizeUserRole(value)
			case "password":
				payload.Password = value
			case "status":
				payload.Status = normalizeUserStatus(value)
			case "forcePasswordChange":
				if parsed, ok := parseBoolValue(value); ok {
					payload.ForcePasswordChange = &parsed
				}
			}
		}

		if strings.TrimSpace(payload.Username) == "" && strings.TrimSpace(payload.Email) == "" {
			continue
		}
		users = append(users, payload)
	}

	if len(users) == 0 {
		return nil, fmt.Errorf("CSV 没有有效数据")
	}

	return users, nil
}

var userImportHeaderAlias = map[string]string{
	"username": "username",
	"user_name": "username",
	"user": "username",
	"account": "username",
	"login": "username",
	"用户": "username",
	"用户名": "username",
	"账号": "username",
	"登录名": "username",

	"email": "email",
	"email_address": "email",
	"mail": "email",
	"邮箱": "email",
	"邮箱地址": "email",
	"电子邮箱": "email",

	"fullname": "fullName",
	"full_name": "fullName",
	"fullnamecn": "fullName",
	"姓名": "fullName",
	"真实姓名": "fullName",
	"昵称": "fullName",

	"role": "role",
	"角色": "role",
	"权限角色": "role",

	"password": "password",
	"passwd": "password",
	"pwd": "password",
	"密码": "password",

	"status": "status",
	"状态": "status",
	"账号状态": "status",
	"启用状态": "status",

	"forcepasswordchange": "forcePasswordChange",
	"force_password_change": "forcePasswordChange",
	"force_password": "forcePasswordChange",
	"force_password_reset": "forcePasswordChange",
	"强制改密": "forcePasswordChange",
	"强制修改密码": "forcePasswordChange",
	"首次改密": "forcePasswordChange",
}

func normalizeCSVHeader(header string) string {
	value := strings.TrimSpace(strings.TrimPrefix(header, "\ufeff"))
	if value == "" {
		return ""
	}
	normalized := strings.ToLower(value)
	normalized = strings.ReplaceAll(normalized, " ", "")
	normalized = strings.ReplaceAll(normalized, "-", "_")
	normalized = strings.ReplaceAll(normalized, ".", "_")
	return normalized
}

func normalizeUserRole(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	lower := strings.ToLower(trimmed)
	switch lower {
	case "admin", "administrator", "管理员", "超级管理员":
		return "admin"
	case "operator", "ops", "运维", "操作员":
		return "operator"
	case "viewer", "readonly", "read_only", "只读", "查看者", "访客":
		return "viewer"
	default:
		return lower
	}
}

func normalizeUserStatus(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	lower := strings.ToLower(trimmed)
	switch lower {
	case "active", "enable", "enabled", "启用", "正常", "有效":
		return "active"
	case "inactive", "disable", "disabled", "停用", "禁用":
		return "inactive"
	case "locked", "lock", "冻结", "锁定":
		return "locked"
	default:
		return lower
	}
}

func parseBoolValue(value string) (bool, bool) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return false, false
	}
	lower := strings.ToLower(trimmed)
	switch lower {
	case "1", "true", "yes", "y", "on", "是", "启用":
		return true, true
	case "0", "false", "no", "n", "off", "否", "禁用":
		return false, true
	default:
		return false, false
	}
}

func isLikelyJSONFile(filename string, data []byte) bool {
	name := strings.ToLower(strings.TrimSpace(filename))
	if strings.HasSuffix(name, ".json") {
		return true
	}
	if strings.HasSuffix(name, ".csv") {
		return false
	}

	trimmed := bytes.TrimSpace(data)
	if len(trimmed) == 0 {
		return false
	}
	return trimmed[0] == '{' || trimmed[0] == '['
}

func (h SettingsHandler) GetUserPermissions(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "users:read"); err != nil {
		return err
	}

	userID := c.Param("user_id")
	user, err := h.Service.GetUserByID(c.Request().Context(), userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "用户不存在")
	}

	permissions, err := h.Service.ListPermissionsByRoleName(c.Request().Context(), user.Role)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "获取权限失败")
	}

	return c.JSON(http.StatusOK, permissions)
}
