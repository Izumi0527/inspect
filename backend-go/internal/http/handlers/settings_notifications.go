package handlers

import (
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/settings"
)

func (h SettingsHandler) GetNotificationConfigs(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	notifications, err := h.Service.ListSettings(c.Request().Context(), "notification")
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "获取通知配置失败")
	}
	email, err := h.Service.ListSettings(c.Request().Context(), "email")
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "获取通知配置失败")
	}

	items := append(notifications, email...)
	return c.JSON(http.StatusOK, settings.SettingListResponse{Items: items, Total: len(items)})
}

func (h SettingsHandler) GetNotificationStats(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	notifications, err := h.Service.ListSettings(c.Request().Context(), "notification")
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "获取通知配置失败")
	}
	email, err := h.Service.ListSettings(c.Request().Context(), "email")
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "获取通知配置失败")
	}

	return c.JSON(http.StatusOK, map[string]int{
		"total_count":        len(notifications) + len(email),
		"notification_count": len(notifications),
		"email_count":        len(email),
	})
}

func (h SettingsHandler) TestEmail(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	payload := map[string]interface{}{}
	_ = c.Bind(&payload)
	recipient := readString(payload, "recipient", "email")
	subject := readString(payload, "subject")
	if strings.TrimSpace(subject) == "" {
		subject = "邮件配置测试"
	}
	content := readString(payload, "content")
	if strings.TrimSpace(content) == "" {
		content = "这是一封测试邮件，用于验证邮件配置是否正确。"
	}

	result := h.Service.TestEmail(settings.TestEmailInput{
		Recipient: recipient,
		Subject:   subject,
		Content:   content,
	})
	return c.JSON(http.StatusOK, result)
}

func (h SettingsHandler) TestSMS(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	payload := map[string]interface{}{}
	_ = c.Bind(&payload)
	phone := readString(payload, "phone_number", "phone", "recipient")
	content := readString(payload, "content")
	if strings.TrimSpace(content) == "" {
		content = "【网络设备巡检系统】这是一条测试短信，用于验证短信配置是否正确。"
	}

	result := h.Service.TestSMS(settings.TestSMSInput{
		PhoneNumber: phone,
		Content:     content,
	})
	return c.JSON(http.StatusOK, result)
}

func (h SettingsHandler) TestWebhook(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "settings service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "system:config"); err != nil {
		return err
	}

	payload := map[string]interface{}{}
	_ = c.Bind(&payload)
	url := readString(payload, "url")
	if strings.TrimSpace(url) == "" {
		url = readString(payload, "webhook_url")
	}
	method := readString(payload, "method")
	if strings.TrimSpace(method) == "" {
		method = "POST"
	}
	headers := readStringMap(payload, "headers")
	body := readInterfaceMap(payload, "payload")
	if len(body) == 0 {
		body = map[string]interface{}{
			"event":     "test",
			"message":   "这是一个测试Webhook请求",
			"timestamp": nil,
		}
	}

	result := h.Service.TestWebhook(settings.TestWebhookInput{
		URL:     url,
		Method:  method,
		Headers: headers,
		Payload: body,
	})
	return c.JSON(http.StatusOK, result)
}
