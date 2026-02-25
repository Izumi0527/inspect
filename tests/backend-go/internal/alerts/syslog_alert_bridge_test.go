package alerts_test

import (
	"context"
	"testing"
	"time"

	"github.com/your-org/inspect-system/backend-go/internal/alerts"
	"github.com/your-org/inspect-system/backend-go/internal/logs"
)

type fakeSyslogAlertStore struct {
	nextID  int
	devices map[int]string
	alerts  map[int]alerts.Alert
}

func (s *fakeSyslogAlertStore) GetDeviceName(_ context.Context, deviceID int) (string, error) {
	if s.devices == nil {
		return "", nil
	}
	return s.devices[deviceID], nil
}

func (s *fakeSyslogAlertStore) FindActiveAlertByTitle(_ context.Context, deviceID int, category string, title string) (*alerts.Alert, error) {
	for _, a := range s.alerts {
		if a.DeviceID != deviceID {
			continue
		}
		if a.Category != category {
			continue
		}
		if a.Title != title {
			continue
		}
		if a.Status != "open" && a.Status != "acknowledged" {
			continue
		}
		copy := a
		return &copy, nil
	}
	return nil, nil
}

func (s *fakeSyslogAlertStore) CreateAlert(_ context.Context, alert alerts.Alert) (int, error) {
	if s.alerts == nil {
		s.alerts = map[int]alerts.Alert{}
	}
	if s.nextID <= 0 {
		s.nextID = 1
	}
	alert.ID = s.nextID
	s.nextID++
	s.alerts[alert.ID] = alert
	return alert.ID, nil
}

func (s *fakeSyslogAlertStore) UpdateAlertOccurrence(_ context.Context, alertID int, message string, occurredAt time.Time) error {
	a := s.alerts[alertID]
	a.Message = message
	if a.OccurrenceCount == nil {
		v := 0
		a.OccurrenceCount = &v
	}
	*a.OccurrenceCount++
	a.LastOccurred = &occurredAt
	a.UpdatedAt = &occurredAt
	s.alerts[alertID] = a
	return nil
}

type fakeSyslogLimiter struct {
	countByDevice map[int]int
}

func (l *fakeSyslogLimiter) AllowNew(_ context.Context, deviceID int, maxPerMinute int) (bool, error) {
	if maxPerMinute <= 0 {
		return true, nil
	}
	if l.countByDevice == nil {
		l.countByDevice = map[int]int{}
	}
	l.countByDevice[deviceID]++
	return l.countByDevice[deviceID] <= maxPerMinute, nil
}

func TestSyslogAlertBridge_ShouldCreateThenUpdateByTitle(t *testing.T) {
	store := &fakeSyslogAlertStore{
		devices: map[int]string{1: "dev-1"},
		alerts:  map[int]alerts.Alert{},
	}
	limiter := &fakeSyslogLimiter{}
	bridge := alerts.NewSyslogAlertBridgeWithDeps(store, limiter, nil, nil)

	outcome, err := bridge.CreateSyslogAlert(context.Background(), logs.SyslogAlertInput{
		DeviceID:        1,
		Level:           "warning",
		Facility:        "system",
		Process:         "sshd",
		Message:         "first",
		SourceIP:        "127.0.0.1",
		MaxNewPerMinute: 30,
	})
	if err != nil {
		t.Fatalf("CreateSyslogAlert: %v", err)
	}
	if outcome != logs.SyslogAlertOutcomeCreated {
		t.Fatalf("outcome=%q, want %q", outcome, logs.SyslogAlertOutcomeCreated)
	}
	if len(store.alerts) != 1 {
		t.Fatalf("alerts=%d, want 1", len(store.alerts))
	}

	outcome, err = bridge.CreateSyslogAlert(context.Background(), logs.SyslogAlertInput{
		DeviceID:        1,
		Level:           "warning",
		Facility:        "system",
		Process:         "sshd",
		Message:         "second",
		SourceIP:        "127.0.0.1",
		MaxNewPerMinute: 30,
	})
	if err != nil {
		t.Fatalf("CreateSyslogAlert: %v", err)
	}
	if outcome != logs.SyslogAlertOutcomeUpdated {
		t.Fatalf("outcome=%q, want %q", outcome, logs.SyslogAlertOutcomeUpdated)
	}
	if len(store.alerts) != 1 {
		t.Fatalf("alerts=%d, want 1", len(store.alerts))
	}
}

func TestSyslogAlertBridge_RateLimit_ShouldCreateOrUpdateStormAlert(t *testing.T) {
	store := &fakeSyslogAlertStore{
		devices: map[int]string{2: "dev-2"},
		alerts:  map[int]alerts.Alert{},
	}
	limiter := &fakeSyslogLimiter{}
	bridge := alerts.NewSyslogAlertBridgeWithDeps(store, limiter, nil, nil)

	outcome, err := bridge.CreateSyslogAlert(context.Background(), logs.SyslogAlertInput{
		DeviceID:        2,
		Level:           "warning",
		Facility:        "system",
		Process:         "p1",
		Message:         "a",
		SourceIP:        "127.0.0.1",
		MaxNewPerMinute: 1,
	})
	if err != nil {
		t.Fatalf("CreateSyslogAlert: %v", err)
	}
	if outcome != logs.SyslogAlertOutcomeCreated {
		t.Fatalf("outcome=%q, want %q", outcome, logs.SyslogAlertOutcomeCreated)
	}

	outcome, err = bridge.CreateSyslogAlert(context.Background(), logs.SyslogAlertInput{
		DeviceID:        2,
		Level:           "warning",
		Facility:        "system",
		Process:         "p2", // 不同标题 -> 需要创建新告警，触发限流
		Message:         "b",
		SourceIP:        "127.0.0.1",
		MaxNewPerMinute: 1,
	})
	if err != nil {
		t.Fatalf("CreateSyslogAlert: %v", err)
	}
	if outcome != logs.SyslogAlertOutcomeRateLimited {
		t.Fatalf("outcome=%q, want %q", outcome, logs.SyslogAlertOutcomeRateLimited)
	}
	if len(store.alerts) != 2 {
		t.Fatalf("alerts=%d, want 2 (one specific + one storm)", len(store.alerts))
	}
}

