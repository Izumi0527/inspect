package alerts_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/your-org/inspect-system/backend-go/internal/alerts"
	"github.com/your-org/inspect-system/backend-go/internal/sshutil"
)

// SSHHostKeyAlertBridge：任一 SSH 连接点 TOFU 校验失败 → 产生（或累计）一条
// security/warning 告警；重置指纹记录 → 自动解除。去重保证日志采集每轮失败不刷屏。

type fakeHostKeyAlertStore struct {
	nextID  int
	devices map[int]string
	alerts  map[int]alerts.Alert
}

func (s *fakeHostKeyAlertStore) GetDeviceName(_ context.Context, deviceID int) (string, error) {
	if s.devices == nil {
		return "", nil
	}
	return s.devices[deviceID], nil
}

func (s *fakeHostKeyAlertStore) FindActiveAlertByTitle(_ context.Context, deviceID int, category string, title string) (*alerts.Alert, error) {
	for _, a := range s.alerts {
		if a.DeviceID != deviceID || a.Category != category || a.Title != title {
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

func (s *fakeHostKeyAlertStore) CreateAlert(_ context.Context, alert alerts.Alert) (int, error) {
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

func (s *fakeHostKeyAlertStore) UpdateAlertOccurrence(_ context.Context, alertID int, message string, occurredAt time.Time) error {
	a := s.alerts[alertID]
	a.Message = message
	if a.OccurrenceCount == nil {
		v := 0
		a.OccurrenceCount = &v
	}
	*a.OccurrenceCount++
	a.LastOccurred = &occurredAt
	s.alerts[alertID] = a
	return nil
}

func (s *fakeHostKeyAlertStore) ResolveActiveByMetric(_ context.Context, deviceID int, metricName string, resolvedAt time.Time) ([]int, error) {
	var ids []int
	for id, a := range s.alerts {
		if a.DeviceID != deviceID {
			continue
		}
		if a.MetricName == nil || *a.MetricName != metricName {
			continue
		}
		if a.Status != "open" && a.Status != "acknowledged" {
			continue
		}
		a.Status = "resolved"
		a.ResolvedAt = &resolvedAt
		s.alerts[id] = a
		ids = append(ids, id)
	}
	return ids, nil
}

func sampleMismatch() sshutil.HostKeyMismatch {
	return sshutil.HostKeyMismatch{
		DeviceID:            21,
		RecordedFingerprint: "SHA256:g8e2/vJVyjdqBhOfml+UbRnCIz6MXWnehBIpdQv4hSg",
		RecordedAlgorithm:   "ssh-rsa",
		CurrentFingerprint:  "SHA256:wEKHys5N4eJxNHXplKZShGgi0/MzEfJRaGp7k33QOJ8",
		CurrentAlgorithm:    "ssh-rsa",
	}
}

func TestSSHHostKeyAlertBridge_CreateThenUpdateByDevice(t *testing.T) {
	store := &fakeHostKeyAlertStore{
		devices: map[int]string{21: "测试"},
		alerts:  map[int]alerts.Alert{},
	}
	bridge := alerts.NewSSHHostKeyAlertBridgeWithDeps(store, nil, nil)

	if err := bridge.NotifyHostKeyMismatch(context.Background(), sampleMismatch()); err != nil {
		t.Fatalf("NotifyHostKeyMismatch: %v", err)
	}
	if len(store.alerts) != 1 {
		t.Fatalf("首次通知应创建一条告警，实际 %d 条", len(store.alerts))
	}

	var created alerts.Alert
	for _, a := range store.alerts {
		created = a
	}
	if created.Category != "security" || created.Severity != "warning" {
		t.Fatalf("category/severity = %s/%s, want security/warning", created.Category, created.Severity)
	}
	if created.MetricName == nil || *created.MetricName != "ssh_host_key_fingerprint" {
		t.Fatalf("metric_name 应为类型标记 ssh_host_key_fingerprint，实际 %v", created.MetricName)
	}
	if !strings.Contains(created.Title, "测试") || !strings.Contains(created.Title, "指纹变化") {
		t.Fatalf("title = %q", created.Title)
	}
	if !strings.Contains(created.Message, "SHA256:wEKHys5N4eJxNHXplKZShGgi0/MzEfJRaGp7k33QOJ8") {
		t.Fatalf("message 应含当前指纹: %q", created.Message)
	}
	if created.Status != "open" {
		t.Fatalf("status = %q, want open", created.Status)
	}

	// 第二次通知（同设备）：去重累计，不新建
	if err := bridge.NotifyHostKeyMismatch(context.Background(), sampleMismatch()); err != nil {
		t.Fatalf("NotifyHostKeyMismatch(second): %v", err)
	}
	if len(store.alerts) != 1 {
		t.Fatalf("重复通知不应新建告警，实际 %d 条", len(store.alerts))
	}
	for _, a := range store.alerts {
		if a.OccurrenceCount == nil || *a.OccurrenceCount != 2 {
			t.Fatalf("occurrence_count = %v, want 2", a.OccurrenceCount)
		}
	}
}

func TestSSHHostKeyAlertBridge_ResolveAfterReset(t *testing.T) {
	store := &fakeHostKeyAlertStore{
		devices: map[int]string{21: "测试"},
		alerts:  map[int]alerts.Alert{},
	}
	bridge := alerts.NewSSHHostKeyAlertBridgeWithDeps(store, nil, nil)

	if err := bridge.NotifyHostKeyMismatch(context.Background(), sampleMismatch()); err != nil {
		t.Fatalf("NotifyHostKeyMismatch: %v", err)
	}
	if err := bridge.ResolveHostKeyMismatch(context.Background(), 21); err != nil {
		t.Fatalf("ResolveHostKeyMismatch: %v", err)
	}
	for _, a := range store.alerts {
		if a.Status != "resolved" || a.ResolvedAt == nil {
			t.Fatalf("重置后告警应解除: status=%q resolved_at=%v", a.Status, a.ResolvedAt)
		}
	}

	// 解除后再次通知：旧告警已 resolved 不命中去重，应新建
	if err := bridge.NotifyHostKeyMismatch(context.Background(), sampleMismatch()); err != nil {
		t.Fatalf("NotifyHostKeyMismatch(after resolve): %v", err)
	}
	if len(store.alerts) != 2 {
		t.Fatalf("解除后再次通知应新建告警，实际 %d 条", len(store.alerts))
	}
}

func TestSSHHostKeyAlertBridge_ResolveWithoutActiveAlertIsNoop(t *testing.T) {
	store := &fakeHostKeyAlertStore{alerts: map[int]alerts.Alert{}}
	bridge := alerts.NewSSHHostKeyAlertBridgeWithDeps(store, nil, nil)

	if err := bridge.ResolveHostKeyMismatch(context.Background(), 21); err != nil {
		t.Fatalf("无告警时解除不应报错: %v", err)
	}
	if len(store.alerts) != 0 {
		t.Fatalf("不应产生任何告警，实际 %d 条", len(store.alerts))
	}
}
