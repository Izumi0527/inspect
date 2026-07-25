package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/settings"
)

func (h SettingsHandler) GetSettingsHealth(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "monitoring:read"); err != nil {
		return err
	}

	resp, err := h.Service.GetSystemHealth(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "获取系统健康状态失败")
	}
	return c.JSON(http.StatusOK, resp)
}

// GetDisplayPreferences 返回登录用户可读的展示偏好（时区 + 12/24 小时制 + 应用名称）。
// 有意仅要求登录而不要求 system:config：这几项是非敏感配置，且需要对所有用户的
// 前端展示生效；/settings/general 的 system:config 门槛会让普通用户 403。
func (h SettingsHandler) GetDisplayPreferences(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, ""); err != nil {
		return err
	}

	ctx := c.Request().Context()

	timezone := "Asia/Shanghai"
	if item, err := h.Service.GetSetting(ctx, "system.timezone"); err == nil && item != nil {
		if v, ok := item.Value.(string); ok && strings.TrimSpace(v) != "" {
			timezone = strings.TrimSpace(v)
		}
	}

	timeFormat := "24h"
	if item, err := h.Service.GetSetting(ctx, "user_preference.time_format"); err == nil && item != nil {
		if v, ok := item.Value.(string); ok {
			normalized := strings.ToLower(strings.TrimSpace(v))
			if normalized == "12h" || normalized == "24h" {
				timeFormat = normalized
			}
		}
	}

	applicationName := "网络设备巡检系统"
	if item, err := h.Service.GetSetting(ctx, "system.application_name"); err == nil && item != nil {
		if v, ok := item.Value.(string); ok && strings.TrimSpace(v) != "" {
			applicationName = strings.TrimSpace(v)
		}
	}

	return c.JSON(http.StatusOK, map[string]string{
		"timezone":         timezone,
		"time_format":      timeFormat,
		"application_name": applicationName,
	})
}

func (h SettingsHandler) GetGeneralConfigs(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	// 只返回通用配置页真正消费的四个类别；notification/email 走 /settings/notifications。
	categories := []string{"system", "inspection", "report", "user_preference"}
	items := make([]settings.SettingItem, 0)
	hasVersion := false
	for _, category := range categories {
		list, err := h.Service.ListSettings(c.Request().Context(), category)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "获取通用配置失败")
		}
		for _, item := range list {
			if item.Key == "system.version" {
				hasVersion = true
			}
		}
		items = append(items, list...)
	}

	// system.version 无种子行：合成只读项，取后端二进制版本（安装包构建时注入）。
	if !hasVersion {
		items = append(items, settings.SettingItem{
			Key:      "system.version",
			Value:    h.Service.AppVersion(),
			Category: "system",
			Type:     "string",
			Label:    "系统版本",
			Readonly: true,
		})
	}

	return c.JSON(http.StatusOK, settings.SettingListResponse{Items: items, Total: len(items)})
}

func (h SettingsHandler) GetGeneralStats(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	categories := []string{"system", "notification", "email", "inspection", "report", "user_preference"}
	stats := map[string]interface{}{"total_count": 0, "by_category": map[string]int{}}
	byCategory := stats["by_category"].(map[string]int)

	for _, category := range categories {
		list, err := h.Service.ListSettings(c.Request().Context(), category)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "获取统计信息失败")
		}
		byCategory[category] = len(list)
		stats["total_count"] = stats["total_count"].(int) + len(list)
	}

	return c.JSON(http.StatusOK, stats)
}

func (h SettingsHandler) GetAllSettings(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	category := strings.TrimSpace(c.QueryParam("category"))
	items, err := h.Service.ListSettings(c.Request().Context(), category)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "获取配置失败")
	}

	return c.JSON(http.StatusOK, items)
}

func (h SettingsHandler) GetSetting(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	key := c.Param("key")
	item, err := h.Service.GetSetting(c.Request().Context(), key)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "配置项不存在")
	}

	return c.JSON(http.StatusOK, item)
}

func (h SettingsHandler) UpdateSetting(c echo.Context) error {
	return h.updateSettingWithKey(c, c.Param("key"))
}

func (h SettingsHandler) UpdateSettingAlias(c echo.Context) error {
	return h.updateSettingWithKey(c, c.Param("key"))
}

func (h SettingsHandler) updateSettingWithKey(c echo.Context, key string) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	payload := map[string]interface{}{}
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	value, ok := payload["value"]
	if !ok {
		return echo.NewHTTPError(http.StatusBadRequest, "请求体必须包含 value")
	}

	user, _ := requirePermission(c, h.Auth, "")
	updatedBy := ""
	if user != nil {
		updatedBy = user.ID
	}

	item, err := h.Service.UpsertSetting(c.Request().Context(), key, value, updatedBy)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.JSON(http.StatusOK, item)
}

func (h SettingsHandler) BulkUpdateSettings(c echo.Context) error {
	return h.bulkUpdateSettings(c)
}

func (h SettingsHandler) BulkUpdateSettingsAlias(c echo.Context) error {
	return h.bulkUpdateSettings(c)
}

func (h SettingsHandler) bulkUpdateSettings(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	payload := map[string]interface{}{}
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	settingsValue, ok := payload["settings"]
	if !ok {
		return echo.NewHTTPError(http.StatusBadRequest, "请求体必须包含 settings")
	}

	settingsMap, ok := settingsValue.(map[string]interface{})
	if !ok {
		return echo.NewHTTPError(http.StatusBadRequest, "settings 必须为对象")
	}

	user, _ := requirePermission(c, h.Auth, "")
	updatedBy := ""
	if user != nil {
		updatedBy = user.ID
	}

	resp, err := h.Service.BulkUpdateSettings(c.Request().Context(), settingsMap, updatedBy)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "批量更新配置失败")
	}

	return c.JSON(http.StatusOK, resp)
}

func (h SettingsHandler) ResetSetting(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	key := c.Param("key")
	user, _ := requirePermission(c, h.Auth, "")
	updatedBy := ""
	if user != nil {
		updatedBy = user.ID
	}

	success, err := h.Service.ResetSetting(c.Request().Context(), key, updatedBy)
	if err != nil || !success {
		return echo.NewHTTPError(http.StatusNotFound, "设置项不存在或重置失败")
	}

	return c.JSON(http.StatusOK, map[string]string{"message": "设置已重置为默认值", "key": key})
}

func (h SettingsHandler) GetSettingCategories(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	includeConfigs := strings.ToLower(strings.TrimSpace(c.QueryParam("include_configs"))) == "true"
	groups, err := h.Service.ListSettingGroups(c.Request().Context(), includeConfigs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "获取设置类别失败")
	}

	return c.JSON(http.StatusOK, groups)
}

func (h SettingsHandler) GeneralConfigExportDisabled(c echo.Context) error {
	return echo.NewHTTPError(http.StatusNotFound, "通用配置导出接口已下线")
}

func (h SettingsHandler) GeneralConfigImportDisabled(c echo.Context) error {
	return echo.NewHTTPError(http.StatusNotFound, "通用配置导入接口已下线")
}

func (h SettingsHandler) ExportConfig(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	resp, err := h.Service.ExportConfig(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "导出配置失败")
	}

	return c.JSON(http.StatusOK, resp)
}

func (h SettingsHandler) ImportConfig(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	payload, overwrite, err := parseImportPayload(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	user, _ := requirePermission(c, h.Auth, "")
	updatedBy := ""
	if user != nil {
		updatedBy = user.ID
	}

	resp, err := h.Service.ImportConfig(c.Request().Context(), payload, overwrite, updatedBy)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "导入配置失败")
	}

	return c.JSON(http.StatusOK, resp)
}

func (h SettingsHandler) GetSystemInfo(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	resp, err := h.Service.GetSystemInfo(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "获取系统信息失败")
	}

	return c.JSON(http.StatusOK, resp)
}

func (h SettingsHandler) SystemSettingsUpdate(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	payload := map[string]interface{}{}
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	settingsMap := map[string]interface{}{}
	if value, ok := payload["settings"]; ok {
		if cast, ok := value.(map[string]interface{}); ok {
			settingsMap = cast
		}
	}
	if value, ok := payload["config_data"]; ok {
		if cast, ok := value.(map[string]interface{}); ok {
			settingsMap = cast
		}
	}
	if len(settingsMap) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "未提供配置数据")
	}

	user, _ := requirePermission(c, h.Auth, "")
	updatedBy := ""
	if user != nil {
		updatedBy = user.ID
	}

	resp, err := h.Service.BulkUpdateSettings(c.Request().Context(), settingsMap, updatedBy)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "更新系统配置失败")
	}

	return c.JSON(http.StatusOK, resp)
}

func parseImportPayload(c echo.Context) (map[string]interface{}, bool, error) {
	contentType := c.Request().Header.Get("Content-Type")
	if strings.Contains(contentType, "multipart/form-data") {
		file, err := c.FormFile("file")
		if err != nil {
			return nil, false, err
		}
		src, err := file.Open()
		if err != nil {
			return nil, false, err
		}
		defer src.Close()

		data, err := io.ReadAll(src)
		if err != nil {
			return nil, false, err
		}

		var payload settings.ExportConfigResponse
		if err := json.Unmarshal(data, &payload); err != nil {
			return nil, false, err
		}
		return payload.ConfigData, true, nil
	}

	payload := map[string]interface{}{}
	if err := c.Bind(&payload); err != nil {
		return nil, false, err
	}

	overwrite := true
	if value, ok := payload["overwrite"].(bool); ok {
		overwrite = value
	}

	configValue, ok := payload["config_data"]
	if !ok {
		return nil, overwrite, fmt.Errorf("config_data is required")
	}

	configMap, ok := configValue.(map[string]interface{})
	if !ok {
		return nil, overwrite, fmt.Errorf("config_data must be object")
	}

	return configMap, overwrite, nil
}
