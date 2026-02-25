package handlers_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/logs"
	"github.com/your-org/inspect-system/backend-go/internal/settings"
	"gorm.io/gorm"
)

type fakeSettingsGetter struct {
	values map[string]interface{}
}

func (f fakeSettingsGetter) GetSetting(_ context.Context, key string) (*settings.SettingItem, error) {
	if f.values == nil {
		return nil, gorm.ErrRecordNotFound
	}
	v, ok := f.values[key]
	if !ok {
		return nil, gorm.ErrRecordNotFound
	}
	return &settings.SettingItem{Key: key, Value: v}, nil
}

type fakeSyslogRuntime struct {
	applied     bool
	lastConfig  logs.SyslogConfig
	lastStatus  logs.SyslogStatus
	applyErr    error
	statusValue logs.SyslogStatus
}

func (f *fakeSyslogRuntime) Status() logs.SyslogStatus {
	return f.statusValue
}

func (f *fakeSyslogRuntime) Apply(_ context.Context, cfg logs.SyslogConfig) (logs.SyslogStatus, error) {
	f.applied = true
	f.lastConfig = cfg
	if f.applyErr != nil {
		return logs.SyslogStatus{}, f.applyErr
	}
	f.lastStatus = logs.SyslogStatus{Running: cfg.Enabled, Config: cfg}
	return f.lastStatus, nil
}

func TestLogsHandler_SyslogEndpoints_Permission(t *testing.T) {
	readOnlyAuth, readOnlyToken := newAuthServiceWithPermissions(t, []string{"monitoring:read"})
	adminAuth, adminToken := newAuthServiceWithPermissions(t, []string{"system:config"})

	h := handlers.LogsHandler{Auth: readOnlyAuth}
	ctx := newEchoContext(http.MethodGet, "/api/v1/logs/syslog/status", readOnlyToken)
	err := h.GetSyslogStatus(ctx)
	assertHTTPErrorCode(t, err, http.StatusForbidden)

	h = handlers.LogsHandler{Auth: readOnlyAuth}
	ctx = newEchoContext(http.MethodPost, "/api/v1/logs/syslog/apply", readOnlyToken)
	err = h.ApplySyslogConfig(ctx)
	assertHTTPErrorCode(t, err, http.StatusForbidden)

	receiver := &fakeSyslogRuntime{}
	h = handlers.LogsHandler{Auth: adminAuth, Syslog: receiver, Settings: fakeSettingsGetter{}}
	ctx = newEchoContext(http.MethodGet, "/api/v1/logs/syslog/status", adminToken)
	err = h.GetSyslogStatus(ctx)
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
}

func TestLogsHandler_ApplySyslogConfig_ShouldReadSettingsAndApply(t *testing.T) {
	adminAuth, adminToken := newAuthServiceWithPermissions(t, []string{"system:config"})

	receiver := &fakeSyslogRuntime{}
	h := handlers.LogsHandler{
		Auth:     adminAuth,
		Syslog:   receiver,
		Settings: fakeSettingsGetter{values: map[string]interface{}{
			"logs.syslog.enabled":                  true,
			"logs.syslog.protocol":                 "both",
			"logs.syslog.host":                     "0.0.0.0",
			"logs.syslog.port":                     5514,
			"logs.syslog.max_message_bytes":        8192,
			"logs.syslog.alerts.enabled":           true,
			"logs.syslog.alerts.max_new_per_minute": 30,
		}},
	}

	ctx := newEchoContext(http.MethodPost, "/api/v1/logs/syslog/apply", adminToken)
	err := h.ApplySyslogConfig(ctx)
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if !receiver.applied {
		t.Fatalf("expected receiver.Apply called")
	}
	if receiver.lastConfig.Port != 5514 {
		t.Fatalf("Port=%d, want 5514", receiver.lastConfig.Port)
	}
	if receiver.lastConfig.Protocol != "both" {
		t.Fatalf("Protocol=%q, want %q", receiver.lastConfig.Protocol, "both")
	}
	if !receiver.lastConfig.Enabled {
		t.Fatalf("Enabled=false, want true")
	}
}
