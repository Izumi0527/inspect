package monitoring_test

import (
	"context"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"runtime"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/labstack/echo/v4"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

func TestCustomCollector_SSRF_RejectsForbiddenIPsAndHostnames(t *testing.T) {
	forbidden := []string{
		"127.0.0.1",
		"127.0.1.1",
		"::1",
		"169.254.169.254",
		"fe80::1",
		"0.0.0.0",
		"localhost",
		"metadata.google.internal",
		"",
	}
	for _, target := range forbidden {
		if _, err := monitoring.ValidateCollectTargetIP(target); err == nil {
			t.Fatalf("expected target %q to be rejected", target)
		}
		if ip := net.ParseIP(target); ip != nil {
			if _, err := monitoring.NewSafeHTTPClient(ip, 5*time.Second); !errors.Is(err, monitoring.ErrForbiddenTargetIP) {
				t.Fatalf("expected NewSafeHTTPClient(%q) to return ErrForbiddenTargetIP, got: %v", target, err)
			}
		}
	}

	valid := []string{"10.1.2.3", "192.168.10.20", "172.16.0.1", "2001:db8::10"}
	for _, target := range valid {
		ip, err := monitoring.ValidateCollectTargetIP(target)
		if err != nil {
			t.Fatalf("expected valid IP %q, got error: %v", target, err)
		}
		client, err := monitoring.NewSafeHTTPClient(ip, 10*time.Second)
		if err != nil {
			t.Fatalf("NewSafeHTTPClient(%q) failed: %v", target, err)
		}
		if client.Timeout > monitoring.MaxHTTPCollectTimeout {
			t.Fatalf("client timeout = %v, want <= %v", client.Timeout, monitoring.MaxHTTPCollectTimeout)
		}
		req := httptest.NewRequest(http.MethodGet, "http://10.1.2.3/health", nil)
		if !errors.Is(client.CheckRedirect(req, nil), http.ErrUseLastResponse) {
			t.Fatalf("expected CheckRedirect to return http.ErrUseLastResponse")
		}
	}
}

func TestCustomCollector_SSRF_RejectsDangerousHTTPPaths(t *testing.T) {
	collector := monitoring.NewCustomCollector(nil)
	dev := devices.Device{ID: 1, IPAddress: "10.0.0.1"}

	badPaths := []string{
		"status",
		"/api@169.254.169.254",
		"//169.254.169.254/latest",
		"http://127.0.0.1/admin",
		"/health\r\nHost: evil",
	}
	for _, p := range badPaths {
		_, err := collector.CollectItem(context.Background(), dev, monitoring.MonitorItem{
			Protocol:   "http",
			HTTPScheme: "http",
			HTTPPort:   80,
			HTTPPath:   p,
		}, nil)
		if err == nil {
			t.Fatalf("expected dangerous http_path %q to be rejected", p)
		}
	}
}

func TestCustomCollector_HTTP_BlocksRedirectAndTruncatesBody(t *testing.T) {
	redirectHits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/redirect":
			http.Redirect(w, r, "/secret", http.StatusFound)
		case "/secret":
			redirectHits++
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("SECRET"))
		case "/large":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(strings.Repeat("A", 100*1024)))
		default:
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("OK"))
		}
	}))
	defer srv.Close()

	_, portStr, _ := net.SplitHostPort(srv.Listener.Addr().String())
	port := 0
	for _, ch := range portStr {
		port = port*10 + int(ch-'0')
	}

	// 测试环境仅将本地 httptest.Server 连接到受测 CheckRedirect 与 LimitReader 逻辑
	collector := &monitoring.CustomCollector{
		HTTPClientFn: func(targetIP net.IP, timeout time.Duration) (*http.Client, error) {
			return &http.Client{
				Timeout: timeout,
				Transport: &http.Transport{
					DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
						return (&net.Dialer{Timeout: timeout}).DialContext(ctx, network, srv.Listener.Addr().String())
					},
				},
				CheckRedirect: func(req *http.Request, via []*http.Request) error {
					return http.ErrUseLastResponse
				},
			}, nil
		},
	}

	dev := devices.Device{ID: 1, IPAddress: "10.20.30.40"}

	// 1. 302 重定向必须被拦截，且目标 /secret 绝不被请求
	_, err := collector.CollectItem(context.Background(), dev, monitoring.MonitorItem{
		Protocol:   "http",
		HTTPScheme: "http",
		HTTPPort:   port,
		HTTPPath:   "/redirect",
	}, nil)
	if err == nil {
		t.Fatalf("expected 302 redirect to be blocked")
	}
	if redirectHits != 0 {
		t.Fatalf("redirect target was followed (%d hits), expected 0", redirectHits)
	}

	// 2. 响应体 > 64KB 必须截断
	res, err := collector.CollectItem(context.Background(), dev, monitoring.MonitorItem{
		Protocol:   "http",
		HTTPScheme: "http",
		HTTPPort:   port,
		HTTPPath:   "/large",
	}, nil)
	if err != nil {
		t.Fatalf("large body collect failed: %v", err)
	}
	if len(res.RawValue) != monitoring.MaxHTTPResponseBodySize {
		t.Fatalf("raw body length = %d, want truncated %d", len(res.RawValue), monitoring.MaxHTTPResponseBodySize)
	}
}

func TestCustomCollector_CredentialsNotSerializedToJSON(t *testing.T) {
	community := "super-secret-community"
	dev := devices.Device{
		IPAddress:     "10.0.0.5",
		SnmpCommunity: &community,
	}
	creds := dev.BuildSNMPTargetCredentials()
	raw, err := json.Marshal(creds)
	if err != nil {
		t.Fatalf("marshal creds failed: %v", err)
	}
	if strings.Contains(string(raw), community) {
		t.Fatalf("SNMP community leaked in JSON: %s", string(raw))
	}
}

func TestCustomCollector_TestItemEndpoint_RequiresMonitoringControl(t *testing.T) {
	h := handlers.MonitoringHandler{
		Writer: monitoring.NewMetricsWriter(nil, nil, zap.NewNop()),
		Auth:   stubTemplatePermService{perms: []string{"monitoring:read"}},
	}

	e := echo.New()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/monitoring/items/test", strings.NewReader(`{"device_id":1,"item":{"item_key":"k1","name":"n1","protocol":"icmp","interval_sec":60}}`))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	req.Header.Set(echo.HeaderAuthorization, "Bearer token")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if err := h.TestMonitoringItem(c); err != nil {
		e.HTTPErrorHandler(err, c)
	}
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403, body=%s", rec.Code, rec.Body.String())
	}
}

func TestLatestMetrics_UpsertTruncatesRawTextTo512Runes(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	longText := strings.Repeat("测", 1000)
	matcher := &captureStringArg{}
	mock.ExpectExec(`(?is)INSERT INTO device_latest_metrics .* ON CONFLICT .* DO UPDATE SET .*`).
		WithArgs(
			1, "http.body", "", "http.body", "custom",
			nil, nil, matcher, nil, sqlmock.AnyArg(), sqlmock.AnyArg(),
		).
		WillReturnResult(sqlmock.NewResult(0, 1))

	if err := writer.UpsertLatestMetrics(context.Background(), []monitoring.DeviceLatestMetric{
		{
			DeviceID:   1,
			MetricName: "http.body",
			RawText:    &longText,
		},
	}); err != nil {
		t.Fatalf("UpsertLatestMetrics failed: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sqlmock expectations: %v", err)
	}
	if got := utf8.RuneCountInString(matcher.val); got != monitoring.MaxLatestMetricRawTextRunes {
		t.Fatalf("truncated raw_text rune count = %d, want %d", got, monitoring.MaxLatestMetricRawTextRunes)
	}
}

type captureStringArg struct {
	val string
}

func (c *captureStringArg) Match(v driver.Value) bool {
	if s, ok := v.(string); ok {
		c.val = s
		return true
	}
	return false
}

func TestCustomCollector_ICMP_NilProbeServiceDoesNotLeakGoroutine(t *testing.T) {
	before := runtime.NumGoroutine()
	collector := monitoring.NewCustomCollector(nil)
	dev := devices.Device{ID: 1, IPAddress: "10.255.255.254"}

	for i := 0; i < 3; i++ {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
		_, _ = collector.CollectItem(ctx, dev, monitoring.MonitorItem{
			Protocol: "icmp",
		}, nil)
		cancel()
	}

	// 短暂让出调度，确认未创建常驻 evictExpiredCache ticker 协程
	time.Sleep(30 * time.Millisecond)
	after := runtime.NumGoroutine()
	if after > before+1 {
		t.Fatalf("goroutine count increased from %d to %d, possible leak", before, after)
	}
}
