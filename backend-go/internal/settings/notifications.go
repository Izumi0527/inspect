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

	return TestSMSResponse{Success: false, Message: "短信发送暂未实现（当前版本仅支持邮件）", SmsID: nil}
}
