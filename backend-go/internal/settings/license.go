package settings

import (
	"context"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"
)

const licenseSettingKey = "system.license"

type License struct {
	ID         string   `json:"id"`
	Type       string   `json:"type"`
	Holder     string   `json:"holder"`
	Email      string   `json:"email"`
	MaxDevices int      `json:"maxDevices"`
	MaxUsers   int      `json:"maxUsers"`
	Features   []string `json:"features"`
	IssueDate  string   `json:"issueDate"`
	ExpiryDate string   `json:"expiryDate"`
	Status     string   `json:"status"`
	Signature  string   `json:"signature"`
}

func (s *Service) GetLicense(ctx context.Context) (License, error) {
	if !s.isReady() {
		return License{}, errors.New("database not initialized")
	}

	item, err := s.GetSetting(ctx, licenseSettingKey)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return defaultLicense(), nil
		}
		return License{}, err
	}

	return normalizeLicense(item.Value), nil
}

func normalizeLicense(raw interface{}) License {
	payload, _ := raw.(map[string]interface{})
	license := License{
		ID:         readString(payload, "id"),
		Type:       readString(payload, "type"),
		Holder:     readString(payload, "holder", "name"),
		Email:      readString(payload, "email"),
		Features:   readStringSlice(payload, "features"),
		IssueDate:  readString(payload, "issue_date", "issueDate", "issued_at", "issuedAt"),
		ExpiryDate: readString(payload, "expiry_date", "expiryDate", "expires_at", "expiresAt"),
		Status:     readString(payload, "status"),
		Signature:  readString(payload, "signature"),
	}

	if value, ok := readInt(payload, "max_devices", "maxDevices"); ok {
		license.MaxDevices = value
	}
	if value, ok := readInt(payload, "max_users", "maxUsers"); ok {
		license.MaxUsers = value
	}

	license = ensureLicenseDefaults(license)
	return license
}

func ensureLicenseDefaults(license License) License {
	if strings.TrimSpace(license.ID) == "" {
		if strings.TrimSpace(license.Signature) == "" {
			license.ID = "license-unset"
		} else {
			license.ID = "license-" + generateSettingID(license.Signature)
		}
	}
	if strings.TrimSpace(license.Type) == "" {
		license.Type = "trial"
	}
	if strings.TrimSpace(license.Holder) == "" {
		license.Holder = "未配置"
	}
	if strings.TrimSpace(license.IssueDate) == "" {
		license.IssueDate = time.Now().UTC().Format(time.RFC3339)
	}
	license.Status = normalizeLicenseStatus(license)
	return license
}

func normalizeLicenseStatus(license License) string {
	raw := strings.ToLower(strings.TrimSpace(license.Status))
	switch raw {
	case "active", "expired", "invalid":
		return raw
	}

	expiry := strings.TrimSpace(license.ExpiryDate)
	if expiry != "" {
		if parsed, err := parseTimeValue(expiry); err == nil {
			if parsed.Before(time.Now().UTC()) {
				return "expired"
			}
			return "active"
		}
	}

	if strings.TrimSpace(license.Signature) != "" {
		return "active"
	}

	return "invalid"
}

func defaultLicense() License {
	return License{
		ID:         "license-unset",
		Type:       "trial",
		Holder:     "未配置",
		Email:      "",
		MaxDevices: 0,
		MaxUsers:   0,
		Features:   []string{},
		IssueDate:  "",
		ExpiryDate: "",
		Status:     "invalid",
		Signature:  "",
	}
}

func licenseToMap(license License) map[string]interface{} {
	return map[string]interface{}{
		"id":         license.ID,
		"type":       license.Type,
		"holder":     license.Holder,
		"email":      license.Email,
		"maxDevices": license.MaxDevices,
		"maxUsers":   license.MaxUsers,
		"features":   license.Features,
		"issueDate":  license.IssueDate,
		"expiryDate": license.ExpiryDate,
		"status":     license.Status,
		"signature":  license.Signature,
	}
}
