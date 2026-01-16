package settings

import (
	"context"
	"strings"
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
	recipient := strings.TrimSpace(input.Recipient)
	if recipient == "" {
		recipient = s.getSettingString(context.Background(), "notification.email.sender_email", "")
	}
	if recipient == "" {
		return TestEmailResponse{Success: false, Message: "未提供测试邮箱"}
	}

	return TestEmailResponse{Success: true, Message: "测试请求已记录，未实际发送"}
}

func (s *Service) TestSMS(input TestSMSInput) TestSMSResponse {
	phone := strings.TrimSpace(input.PhoneNumber)
	if phone == "" {
		phone = s.getSettingString(context.Background(), "notification.sms.test_phone", "")
	}
	if phone == "" {
		return TestSMSResponse{Success: false, Message: "未提供测试手机号", SmsID: nil}
	}

	return TestSMSResponse{Success: true, Message: "测试请求已记录，未实际发送", SmsID: nil}
}

func (s *Service) TestWebhook(input TestWebhookInput) TestWebhookResponse {
	url := strings.TrimSpace(input.URL)
	if url == "" {
		url = s.getSettingString(context.Background(), "notification.webhook.url", "")
	}
	if url == "" {
		return TestWebhookResponse{Success: false, Message: "未提供Webhook地址"}
	}

	return TestWebhookResponse{Success: true, Message: "测试请求已记录，未实际发送"}
}
