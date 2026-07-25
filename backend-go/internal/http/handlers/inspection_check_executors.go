package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/devices/cliconn"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
)

// executeSSHCheck 通过 SSH 执行检查项配置的只读命令，并按可选期望值判定结果。
// config: { "command": "display version", "expect": "可选，输出需包含的子串" }
// 设备 SSH 凭据取自 Device（已由 AfterFind 解密）。
func (h InspectionHandler) executeSSHCheck(ctx context.Context, result *inspection.Result, device *devices.Device, item map[string]interface{}) {
	if device == nil {
		result.Status = "skip"
		result.Message = stringPtr("无设备信息，无法执行 SSH 检查")
		return
	}

	config, _ := item["config"].(map[string]interface{})
	command := strings.TrimSpace(readString(config, "command"))
	if command == "" {
		result.Status = "skip"
		result.Message = stringPtr("SSH 检查未配置 command")
		return
	}

	username := stringValue(device.SshUsername)
	if username == "" {
		result.Status = "skip"
		result.Message = stringPtr("设备未配置 SSH 用户名")
		return
	}
	port := 22
	if device.SshPort != nil && *device.SshPort > 0 {
		port = *device.SshPort
	}

	// 密钥认证设备从 tags 提取私钥（AfterFind 已解密）；密码与私钥由
	// sshutil.BuildAuthMethods 统一组合，私钥优先、密码兜底。
	privateKey, keyPassphrase := device.SSHKeyCredentials()
	target := cliconn.Target{
		Protocol:      "ssh",
		Host:          device.IPAddress,
		Port:          port,
		Username:      username,
		Password:      stringValue(device.SshPassword),
		PrivateKey:    privateKey,
		KeyPassphrase: keyPassphrase,
	}

	output, err := cliconn.RunCommand(ctx, target, command, 10*time.Second)
	if err != nil {
		result.Status = "fail"
		msg := fmt.Sprintf("SSH 命令执行失败: %v", err)
		result.Message = &msg
		errStr := err.Error()
		result.ErrorMessage = &errStr
		return
	}

	trimmed := strings.TrimSpace(output)
	if len(trimmed) > 500 {
		trimmed = trimmed[:500] + "..."
	}
	result.ActualValue = &trimmed

	expect := strings.TrimSpace(readString(config, "expect"))
	if expect == "" {
		result.Status = "pass"
		result.Message = stringPtr("SSH 命令执行成功")
		return
	}
	if strings.Contains(output, expect) {
		result.Status = "pass"
		result.Message = stringPtr(fmt.Sprintf("SSH 输出包含期望值「%s」", expect))
	} else {
		result.Status = "fail"
		result.Message = stringPtr(fmt.Sprintf("SSH 输出未包含期望值「%s」", expect))
	}
}

// executeHTTPCheck 对设备发起 HTTP 探测并按可选期望状态码判定结果。
// config: { "url": "可选，默认 http://<设备IP>", "method": "GET", "expect_status": 200 }
func (h InspectionHandler) executeHTTPCheck(ctx context.Context, result *inspection.Result, device *devices.Device, item map[string]interface{}) {
	if device == nil {
		result.Status = "skip"
		result.Message = stringPtr("无设备信息，无法执行 HTTP 检查")
		return
	}

	config, _ := item["config"].(map[string]interface{})
	rawURL := strings.TrimSpace(readString(config, "url"))
	if rawURL == "" {
		rawURL = fmt.Sprintf("http://%s", device.IPAddress)
	}
	method := strings.ToUpper(strings.TrimSpace(readString(config, "method")))
	if method == "" {
		method = http.MethodGet
	}
	expectStatus := 0
	if v, ok := config["expect_status"].(float64); ok {
		expectStatus = int(v)
	}

	reqCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, method, rawURL, nil)
	if err != nil {
		result.Status = "fail"
		msg := fmt.Sprintf("HTTP 请求构造失败: %v", err)
		result.Message = &msg
		return
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		result.Status = "fail"
		msg := fmt.Sprintf("HTTP 请求失败: %v", err)
		result.Message = &msg
		errStr := err.Error()
		result.ErrorMessage = &errStr
		return
	}
	defer resp.Body.Close()

	actual := fmt.Sprintf("%d", resp.StatusCode)
	result.ActualValue = &actual

	if expectStatus > 0 {
		if resp.StatusCode == expectStatus {
			result.Status = "pass"
			result.Message = stringPtr(fmt.Sprintf("HTTP 状态码符合预期: %d", resp.StatusCode))
		} else {
			result.Status = "fail"
			result.Message = stringPtr(fmt.Sprintf("HTTP 状态码 %d，预期 %d", resp.StatusCode, expectStatus))
		}
		return
	}
	if resp.StatusCode >= 200 && resp.StatusCode < 400 {
		result.Status = "pass"
		result.Message = stringPtr(fmt.Sprintf("HTTP 可达，状态码 %d", resp.StatusCode))
	} else {
		result.Status = "fail"
		result.Message = stringPtr(fmt.Sprintf("HTTP 状态码异常: %d", resp.StatusCode))
	}
}
