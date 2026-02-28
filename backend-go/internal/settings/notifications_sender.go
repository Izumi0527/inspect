package settings

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/mail"
	"net/smtp"
	"strings"
	"time"
)

type smtpConfig struct {
	Host        string
	Port        int
	Username    string
	Password    string
	UseTLS      bool // STARTTLS
	UseSSL      bool // Implicit TLS (SMTPS)
	SenderName  string
	SenderEmail string
}

// EmailNotificationsEnabled 判断是否启用邮件通知（作为全局总开关）。
func (s *Service) EmailNotificationsEnabled(ctx context.Context) bool {
	if !s.isReady() {
		return false
	}
	enabled := s.getSettingBool(ctx, "notification.email.enabled", false)
	if !enabled {
		enabled = s.getSettingBool(ctx, "notification.email_enabled", false)
	}
	return enabled
}

// WebhookNotificationsEnabled 判断是否启用 Webhook 通知（作为全局总开关）。
func (s *Service) WebhookNotificationsEnabled(ctx context.Context) bool {
	if !s.isReady() {
		return false
	}
	return s.getSettingBool(ctx, "notification.webhook.enabled", false)
}

func (s *Service) loadSMTPConfig(ctx context.Context) smtpConfig {
	host := s.getSettingString(ctx, "notification.email.smtp_host", "")
	if host == "" {
		host = s.getSettingString(ctx, "email.smtp_server", "")
	}

	port := s.getSettingInt(ctx, "notification.email.smtp_port", 587)
	if port == 587 {
		if legacy := s.getSettingInt(ctx, "email.smtp_port", 0); legacy > 0 {
			port = legacy
		}
	}

	username := s.getSettingString(ctx, "notification.email.smtp_user", "")
	if username == "" {
		username = s.getSettingString(ctx, "email.smtp_username", "")
	}
	password := s.getSettingString(ctx, "notification.email.smtp_password", "")
	if password == "" {
		password = s.getSettingString(ctx, "email.smtp_password", "")
	}

	useTLS := s.getSettingBool(ctx, "notification.email.smtp_use_tls", true)
	useSSL := s.getSettingBool(ctx, "email.use_ssl", false)

	senderEmail := s.getSettingString(ctx, "notification.email.sender_email", "")
	if senderEmail == "" {
		senderEmail = s.getSettingString(ctx, "email.sender_email", "")
	}
	if senderEmail == "" {
		senderEmail = username
	}
	senderName := s.getSettingString(ctx, "notification.email.sender_name", "")
	if senderName == "" {
		senderName = s.getSettingString(ctx, "email.sender_name", "")
	}

	return smtpConfig{
		Host:        host,
		Port:        port,
		Username:    username,
		Password:    password,
		UseTLS:      useTLS,
		UseSSL:      useSSL || port == 465,
		SenderName:  senderName,
		SenderEmail: senderEmail,
	}
}

func buildEmailMessage(from mail.Address, to mail.Address, subject string, content string) []byte {
	subject = strings.TrimSpace(subject)
	if subject == "" {
		subject = "通知"
	}

	body := strings.TrimSpace(content)
	if body == "" {
		body = "（空内容）"
	}

	var buf bytes.Buffer
	buf.WriteString(fmt.Sprintf("From: %s\r\n", from.String()))
	buf.WriteString(fmt.Sprintf("To: %s\r\n", to.String()))
	buf.WriteString(fmt.Sprintf("Subject: %s\r\n", subject))
	buf.WriteString("MIME-Version: 1.0\r\n")
	buf.WriteString("Content-Type: text/plain; charset=\"UTF-8\"\r\n")
	buf.WriteString("Content-Transfer-Encoding: 8bit\r\n")
	buf.WriteString("\r\n")
	buf.WriteString(body)
	buf.WriteString("\r\n")
	return buf.Bytes()
}

func sendSMTP(ctx context.Context, cfg smtpConfig, to string, subject string, content string) error {
	_ = ctx // net/smtp 不支持 ctx，这里保留参数便于未来替换实现

	host := strings.TrimSpace(cfg.Host)
	if host == "" {
		return fmt.Errorf("SMTP服务器未配置")
	}
	if cfg.Port <= 0 {
		return fmt.Errorf("SMTP端口未配置")
	}
	if strings.TrimSpace(cfg.SenderEmail) == "" {
		return fmt.Errorf("发件人邮箱未配置")
	}

	recipient := strings.TrimSpace(to)
	if recipient == "" {
		return fmt.Errorf("收件人不能为空")
	}

	from := mail.Address{Name: strings.TrimSpace(cfg.SenderName), Address: strings.TrimSpace(cfg.SenderEmail)}
	toAddr := mail.Address{Address: recipient}
	msg := buildEmailMessage(from, toAddr, subject, content)

	addr := fmt.Sprintf("%s:%d", host, cfg.Port)

	var client *smtp.Client
	var err error

	tlsCfg := &tls.Config{
		ServerName:         host,
		MinVersion:         tls.VersionTLS12,
		InsecureSkipVerify: false,
	}

	if cfg.UseSSL {
		conn, dialErr := tls.Dial("tcp", addr, tlsCfg)
		if dialErr != nil {
			return dialErr
		}
		client, err = smtp.NewClient(conn, host)
	} else {
		client, err = smtp.Dial(addr)
	}
	if err != nil {
		return err
	}
	defer client.Close()

	if cfg.UseTLS && !cfg.UseSSL {
		if err := client.StartTLS(tlsCfg); err != nil {
			return err
		}
	}

	if strings.TrimSpace(cfg.Username) != "" {
		auth := smtp.PlainAuth("", cfg.Username, cfg.Password, host)
		if err := client.Auth(auth); err != nil {
			return err
		}
	}

	if err := client.Mail(cfg.SenderEmail); err != nil {
		return err
	}
	if err := client.Rcpt(recipient); err != nil {
		return err
	}

	writer, err := client.Data()
	if err != nil {
		return err
	}
	if _, err := writer.Write(msg); err != nil {
		_ = writer.Close()
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}

	return client.Quit()
}

// SendEmail 使用系统配置的 SMTP 发送邮件（供告警触发等场景复用）。
func (s *Service) SendEmail(ctx context.Context, to string, subject string, content string) error {
	if !s.isReady() {
		return fmt.Errorf("settings service not initialized")
	}
	cfg := s.loadSMTPConfig(ctx)
	return sendSMTP(ctx, cfg, to, subject, content)
}

type webhookConfig struct {
	Enabled    bool
	URL        string
	Method     string
	Headers    map[string]string
	AuthType   string
	AuthToken  string
	RetryCount int
	TimeoutSec int
}

func (s *Service) loadWebhookConfig(ctx context.Context) webhookConfig {
	enabled := s.getSettingBool(ctx, "notification.webhook.enabled", false)
	url := s.getSettingString(ctx, "notification.webhook.url", "")
	method := strings.ToUpper(strings.TrimSpace(s.getSettingString(ctx, "notification.webhook.method", "POST")))
	if method == "" {
		method = "POST"
	}

	retryCount := s.getSettingInt(ctx, "notification.webhook.retry_count", 3)
	timeoutSec := s.getSettingInt(ctx, "notification.webhook.timeout", 30)

	authType := strings.TrimSpace(s.getSettingString(ctx, "notification.webhook.auth_type", "none"))
	authToken := strings.TrimSpace(s.getSettingString(ctx, "notification.webhook.auth_token", ""))

	headers := map[string]string{}
	if item, err := s.GetSetting(ctx, "notification.webhook.headers"); err == nil && item != nil && item.Value != nil {
		switch v := item.Value.(type) {
		case map[string]interface{}:
			for k, raw := range v {
				key := strings.TrimSpace(k)
				if key == "" {
					continue
				}
				if str, ok := raw.(string); ok {
					headers[key] = str
				} else if raw != nil {
					headers[key] = fmt.Sprint(raw)
				}
			}
		case map[string]string:
			for k, value := range v {
				key := strings.TrimSpace(k)
				if key == "" {
					continue
				}
				headers[key] = value
			}
		case string:
			text := strings.TrimSpace(v)
			if text != "" {
				tmp := map[string]interface{}{}
				if json.Unmarshal([]byte(text), &tmp) == nil {
					for k, raw := range tmp {
						key := strings.TrimSpace(k)
						if key == "" {
							continue
						}
						if str, ok := raw.(string); ok {
							headers[key] = str
						} else if raw != nil {
							headers[key] = fmt.Sprint(raw)
						}
					}
				}
			}
		}
	}

	return webhookConfig{
		Enabled:    enabled,
		URL:        url,
		Method:     method,
		Headers:    headers,
		AuthType:   authType,
		AuthToken:  authToken,
		RetryCount: retryCount,
		TimeoutSec: timeoutSec,
	}
}

type WebhookSendInput struct {
	URL     string
	Method  string
	Headers map[string]string
	Payload map[string]interface{}
}

type WebhookSendResult struct {
	StatusCode     int
	ResponseBody   string
	ResponseTimeMs int
}

func applyAuthHeader(headers map[string]string, authType string, token string) {
	authType = strings.ToLower(strings.TrimSpace(authType))
	token = strings.TrimSpace(token)
	if token == "" {
		return
	}

	switch authType {
	case "bearer":
		if _, ok := headers["Authorization"]; !ok {
			headers["Authorization"] = fmt.Sprintf("Bearer %s", token)
		}
	case "basic":
		if _, ok := headers["Authorization"]; !ok {
			headers["Authorization"] = fmt.Sprintf("Basic %s", token)
		}
	case "apikey":
		if _, ok := headers["X-API-Key"]; !ok {
			headers["X-API-Key"] = token
		}
	}
}

func doWebhookOnce(ctx context.Context, client *http.Client, method string, url string, headers map[string]string, payload map[string]interface{}) (WebhookSendResult, error) {
	if strings.TrimSpace(url) == "" {
		return WebhookSendResult{}, fmt.Errorf("Webhook地址不能为空")
	}

	if payload == nil {
		payload = map[string]interface{}{}
	}
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return WebhookSendResult{}, err
	}

	req, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return WebhookSendResult{}, err
	}

	hasContentType := false
	for k, v := range headers {
		if strings.EqualFold(k, "Content-Type") {
			hasContentType = true
		}
		req.Header.Set(k, v)
	}
	if !hasContentType {
		req.Header.Set("Content-Type", "application/json")
	}

	start := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		return WebhookSendResult{}, err
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(io.LimitReader(resp.Body, 32*1024))
	cost := time.Since(start)

	return WebhookSendResult{
		StatusCode:     resp.StatusCode,
		ResponseBody:   string(data),
		ResponseTimeMs: int(cost.Milliseconds()),
	}, nil
}

// SendWebhook 使用系统配置发送 Webhook（供告警触发/测试等场景复用）。
func (s *Service) SendWebhook(ctx context.Context, input WebhookSendInput) (WebhookSendResult, error) {
	cfg := s.loadWebhookConfig(ctx)

	url := strings.TrimSpace(input.URL)
	if url == "" {
		url = strings.TrimSpace(cfg.URL)
	}
	method := strings.ToUpper(strings.TrimSpace(input.Method))
	if method == "" {
		method = strings.ToUpper(strings.TrimSpace(cfg.Method))
	}
	if method == "" {
		method = "POST"
	}

	headers := map[string]string{}
	for k, v := range cfg.Headers {
		headers[k] = v
	}
	for k, v := range input.Headers {
		key := strings.TrimSpace(k)
		if key == "" {
			continue
		}
		headers[key] = v
	}
	applyAuthHeader(headers, cfg.AuthType, cfg.AuthToken)

	timeout := time.Duration(cfg.TimeoutSec) * time.Second
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	client := &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			Proxy: http.ProxyFromEnvironment,
			DialContext: (&net.Dialer{
				Timeout: 10 * time.Second,
			}).DialContext,
			TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12},
		},
	}

	attempts := 1
	if cfg.RetryCount > 0 {
		attempts = 1 + cfg.RetryCount
	}

	var lastErr error
	var lastResult WebhookSendResult
	for i := 0; i < attempts; i++ {
		result, err := doWebhookOnce(ctx, client, method, url, headers, input.Payload)
		lastResult = result
		if err == nil && result.StatusCode > 0 && result.StatusCode < 500 {
			return result, nil
		}
		if err == nil && result.StatusCode >= 500 {
			lastErr = fmt.Errorf("webhook返回错误状态码: %d", result.StatusCode)
		} else if err != nil {
			lastErr = err
		}

		// 4xx 不重试
		if err == nil && result.StatusCode >= 400 && result.StatusCode < 500 {
			break
		}

		if i < attempts-1 {
			time.Sleep(time.Duration(i+1) * 300 * time.Millisecond)
		}
	}

	if lastErr == nil {
		lastErr = fmt.Errorf("webhook发送失败")
	}
	return lastResult, lastErr
}
