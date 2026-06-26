package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/devices/cliconn"
)

type cliTestRequest struct {
	DeviceID       *int   `json:"device_id"` // 可选：编辑已存在设备、密码留空时用于回退取库内凭据
	Protocol       string `json:"protocol"`
	Host           string `json:"host"`
	Port           int    `json:"port"`
	Username       string `json:"username"`
	Password       string `json:"password"`
	EnablePassword string `json:"enable_password"`
}

// TestCLIConnection 测试设备 CLI（SSH/Telnet）连接连通性。
// 使用请求体中的连接参数，支持编辑中/未保存的设备；仅验证登录认证，不执行业务命令。
func (h DevicesHandler) TestCLIConnection(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "devices:read"); err != nil {
		return err
	}

	var req cliTestRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "请求参数无效")
	}

	protocol := strings.ToLower(strings.TrimSpace(req.Protocol))
	if protocol != "ssh" && protocol != "telnet" {
		return echo.NewHTTPError(http.StatusBadRequest, "protocol 必须为 ssh 或 telnet")
	}
	host := strings.TrimSpace(req.Host)
	if host == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "host 不能为空")
	}
	if strings.TrimSpace(req.Username) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "username 不能为空")
	}

	// 端口缺省按协议补默认值
	port := req.Port
	if port <= 0 || port > 65535 {
		if protocol == "ssh" {
			port = 22
		} else {
			port = 23
		}
	}

	password := req.Password
	enablePassword := req.EnablePassword
	// 编辑已存在设备且密码留空：用 device_id 回退取库内凭据，避免要求用户重输密码
	if password == "" && req.DeviceID != nil && h.Service != nil {
		if dev, err := h.Service.GetDeviceRecord(c.Request().Context(), *req.DeviceID); err == nil {
			if protocol == "ssh" && dev.SshPassword != nil {
				password = *dev.SshPassword
			}
			if protocol == "telnet" && dev.TelnetPassword != nil {
				password = *dev.TelnetPassword
			}
			if enablePassword == "" && dev.EnablePassword != nil {
				enablePassword = *dev.EnablePassword
			}
		}
	}

	result := cliconn.TestConnection(
		c.Request().Context(),
		cliconn.Target{
			Protocol:       protocol,
			Host:           host,
			Port:           port,
			Username:       req.Username,
			Password:       password,
			EnablePassword: enablePassword,
		},
		8*time.Second,
	)

	return c.JSON(http.StatusOK, result)
}
