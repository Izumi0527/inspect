package auth

import (
	"context"
	"testing"
)

func TestGetSettingIntFromMap(t *testing.T) {
	settings := map[string]string{
		"security.session.timeout":  "45",
		"security.password.min":     "10.7",
		"security.password.invalid": "abc",
	}

	if got := getSettingIntFromMap(settings, "security.session.timeout", 30); got != 45 {
		t.Fatalf("expected 45, got %d", got)
	}
	if got := getSettingIntFromMap(settings, "security.password.min", 8); got != 10 {
		t.Fatalf("expected 10 from json number, got %d", got)
	}
	if got := getSettingIntFromMap(settings, "security.password.invalid", 8); got != 8 {
		t.Fatalf("expected fallback 8, got %d", got)
	}
	if got := getSettingIntFromMap(settings, "security.password.missing", 8); got != 8 {
		t.Fatalf("expected fallback 8 for missing key, got %d", got)
	}
}

func TestGetSettingBoolFromMap(t *testing.T) {
	settings := map[string]string{
		"security.session.auto_logout_enabled": "true",
		"security.session.remember_me_enabled": "false",
		"security.session.invalid":             "not-bool",
	}

	if got := getSettingBoolFromMap(settings, "security.session.auto_logout_enabled", false); !got {
		t.Fatalf("expected true, got false")
	}
	if got := getSettingBoolFromMap(settings, "security.session.remember_me_enabled", true); got {
		t.Fatalf("expected false, got true")
	}
	if got := getSettingBoolFromMap(settings, "security.session.invalid", true); !got {
		t.Fatalf("expected fallback true, got false")
	}
	if got := getSettingBoolFromMap(settings, "security.session.missing", false); got {
		t.Fatalf("expected fallback false, got true")
	}
}

func TestLoadSecurityPolicyDefaultsWhenServiceNotReady(t *testing.T) {
	service := &Service{}
	policy := service.loadSecurityPolicy(context.Background())

	if policy.SessionTimeoutMinutes != 30 {
		t.Fatalf("expected default session timeout 30, got %d", policy.SessionTimeoutMinutes)
	}
	if !policy.AutoLogoutEnabled {
		t.Fatalf("expected default auto logout enabled")
	}
	if policy.RememberMeDurationDays != 7 {
		t.Fatalf("expected default remember me duration 7, got %d", policy.RememberMeDurationDays)
	}
	if policy.MaxConcurrentSessions != 3 {
		t.Fatalf("expected default max concurrent sessions 3, got %d", policy.MaxConcurrentSessions)
	}
	if policy.PasswordMinLength != 8 {
		t.Fatalf("expected default password min length 8, got %d", policy.PasswordMinLength)
	}
	if policy.MaxLoginAttempts != 5 {
		t.Fatalf("expected default max login attempts 5, got %d", policy.MaxLoginAttempts)
	}
	if policy.LockoutDurationMinutes != 15 {
		t.Fatalf("expected default lockout duration 15, got %d", policy.LockoutDurationMinutes)
	}
}
