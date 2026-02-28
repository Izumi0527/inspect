package settings

import (
	"context"
	"strings"
	"time"
)

type TestEmailInput struct {
	Recipient string `json:"recipient"`
	Subject   string `json:"subject"`
	Content   string `json:"content"`
}

type TestEmailResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type TestSMSInput struct {
	PhoneNumber string `json:"phone_number"`
	Content     string `json:"content"`
}

type TestSMSResponse struct {
	Success bool    `json:"success"`
	Message string  `json:"message"`
	SmsID   *string `json:"sms_id"`
}

type TestWebhookInput struct {
	URL     string                 `json:"url"`
	Method  string                 `json:"method"`
	Headers map[string]string      `json:"headers"`
	Payload map[string]interface{} `json:"payload"`
}

type TestWebhookResponse struct {
	Success        bool    `json:"success"`
	Message        string  `json:"message"`
	StatusCode     *int    `json:"status_code"`
	ResponseBody   *string `json:"response_body"`
	ResponseTimeMs *int    `json:"response_time_ms"`
}

func (s *Service) TestEmail(input TestEmailInput) TestEmailResponse {
	ctx := context.Background()

	recipient := strings.TrimSpace(input.Recipient)
	if recipient == "" {
		recipient = s.getSettingString(ctx, "notification.email.test_recipient", "")
	}
	if recipient == "" {
		recipient = s.getSettingString(ctx, "notification.email.sender_email", "")
	}
	if recipient == "" {
		return TestEmailResponse{Success: false, Message: "未提供测试邮箱（recipient 为空，且未配置 notification.email.test_recipient）"}
	}

	subject := strings.TrimSpace(input.Subject)
	if subject == "" {
		subject = "邮件配置测试"
	}
	content := strings.TrimSpace(input.Content)
	if content == "" {
		content = "这是一封测试邮件，用于验证邮件配置是否正确。"
	}

	cfg := s.loadSMTPConfig(ctx)
	if err := sendSMTP(ctx, cfg, recipient, subject, content); err != nil {
		return TestEmailResponse{Success: false, Message: "发送失败：" + err.Error()}
	}
	return TestEmailResponse{Success: true, Message: "测试邮件已发送"}
}

func (s *Service) TestSMS(input TestSMSInput) TestSMSResponse {
	phone := strings.TrimSpace(input.PhoneNumber)
	if phone == "" {
		phone = s.getSettingString(context.Background(), "notification.sms.test_phone", "")
	}
	if phone == "" {
		return TestSMSResponse{Success: false, Message: "未提供测试手机号", SmsID: nil}
	}

	return TestSMSResponse{Success: false, Message: "短信发送暂未实现（当前版本仅支持邮件/Webhook）", SmsID: nil}
}

func (s *Service) TestWebhook(input TestWebhookInput) TestWebhookResponse {
	ctx := context.Background()

	payload := input.Payload
	if payload == nil {
		payload = map[string]interface{}{}
	}
	payload["timestamp"] = time.Now().UTC().Format(time.RFC3339)

	result, err := s.SendWebhook(ctx, WebhookSendInput{
		URL:     strings.TrimSpace(input.URL),
		Method:  strings.TrimSpace(input.Method),
		Headers: input.Headers,
		Payload: payload,
	})
	if err != nil {
		statusCode := result.StatusCode
		return TestWebhookResponse{
			Success: false,
			Message: "发送失败：" + err.Error(),
			StatusCode: func() *int {
				if statusCode > 0 {
					return &statusCode
				}
				return nil
			}(),
			ResponseBody: func() *string {
				if strings.TrimSpace(result.ResponseBody) != "" {
					v := result.ResponseBody
					return &v
				}
				return nil
			}(),
			ResponseTimeMs: func() *int {
				if result.ResponseTimeMs > 0 {
					v := result.ResponseTimeMs
					return &v
				}
				return nil
			}(),
		}
	}

	statusCode := result.StatusCode
	body := result.ResponseBody
	cost := result.ResponseTimeMs

	return TestWebhookResponse{
		Success:        true,
		Message:        "Webhook 测试请求已发送",
		StatusCode:     &statusCode,
		ResponseBody:   &body,
		ResponseTimeMs: &cost,
	}
}
