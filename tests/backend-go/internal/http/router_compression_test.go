package http_test

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/config"
	apphttp "github.com/your-org/inspect-system/backend-go/internal/http"
)

// 监控时序等大 JSON 响应必须压缩：14 天档单设备就有数千个点，Ubuntu 部署的 nginx 默认只压缩 text/html，
// Windows 安装包与开发环境由浏览器直连后端，此前 JSON 在所有部署形态下都不压缩。
func TestNewServer_CompressesLargeResponsesWhenClientAcceptsGzip(t *testing.T) {
	server := newCompressionTestServer()
	payload := strings.Repeat(`{"timestamp":"2026-11-07T00:00:00Z","cpu":12.5,"memory":61.2},`, 200)
	server.GET("/__test/large", func(c echo.Context) error {
		return c.Blob(http.StatusOK, echo.MIMEApplicationJSON, []byte(payload))
	})

	rec := serve(server, httptest.NewRequest(http.MethodGet, "/__test/large", nil), map[string]string{"Accept-Encoding": "gzip"})
	if got := rec.Header().Get("Content-Encoding"); got != "gzip" {
		t.Fatalf("Content-Encoding = %q，want gzip", got)
	}
	if vary := strings.Join(rec.Header().Values("Vary"), ","); !strings.Contains(vary, "Accept-Encoding") {
		t.Fatalf("Vary = %q，应包含 Accept-Encoding，避免缓存把压缩体发给不支持 gzip 的客户端", vary)
	}
	if rec.Body.Len() >= len(payload) {
		t.Fatalf("压缩后 %d 字节，不小于原始 %d 字节", rec.Body.Len(), len(payload))
	}
	if body := gunzip(t, rec.Body.Bytes()); body != payload {
		t.Fatal("解压后的响应与原始 JSON 不一致")
	}
}

// 带 Range 的请求必须原样返回：c.File 会回 206 部分内容，压缩后 Content-Range 指向的字节区间就对不上了。
func TestNewServer_DoesNotCompressRangeRequests(t *testing.T) {
	server := newCompressionTestServer()
	path := filepath.Join(t.TempDir(), "report.pdf")
	if err := os.WriteFile(path, bytes.Repeat([]byte("0123456789"), 400), 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	server.GET("/__test/file", func(c echo.Context) error { return c.File(path) })

	// 区间要大于 1KB 的压缩下限，否则即使漏了跳过规则也不会被压缩。
	rec := serve(server, httptest.NewRequest(http.MethodGet, "/__test/file", nil),
		map[string]string{"Accept-Encoding": "gzip", "Range": "bytes=0-2047"})
	if rec.Code != http.StatusPartialContent {
		t.Fatalf("状态码 = %d，want 206", rec.Code)
	}
	if got := rec.Header().Get("Content-Encoding"); got != "" {
		t.Fatalf("Range 请求的响应被压缩（Content-Encoding = %q）", got)
	}
	if rec.Body.Len() != 2048 {
		t.Fatalf("响应体 %d 字节，want 2048", rec.Body.Len())
	}
}

// WebSocket 升级请求不压缩：连接会被 ws 处理器劫持，压缩包装只会碍事。
func TestNewServer_DoesNotCompressWebSocketUpgrade(t *testing.T) {
	server := newCompressionTestServer()
	payload := strings.Repeat("x", 4096)
	server.GET("/__test/ws", func(c echo.Context) error { return c.String(http.StatusOK, payload) })

	rec := serve(server, httptest.NewRequest(http.MethodGet, "/__test/ws", nil),
		map[string]string{"Accept-Encoding": "gzip", "Connection": "Upgrade", "Upgrade": "websocket"})
	if got := rec.Header().Get("Content-Encoding"); got != "" {
		t.Fatalf("WebSocket 升级请求的响应被压缩（Content-Encoding = %q）", got)
	}
}

func newCompressionTestServer() *echo.Echo {
	return apphttp.NewServer(config.Config{AppVersion: "test"},
		nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil)
}

func serve(server *echo.Echo, req *http.Request, headers map[string]string) *httptest.ResponseRecorder {
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	rec := httptest.NewRecorder()
	server.ServeHTTP(rec, req)
	return rec
}

func gunzip(t *testing.T, data []byte) string {
	t.Helper()
	reader, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("响应不是合法的 gzip：%v", err)
	}
	defer reader.Close()
	raw, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("解压失败：%v", err)
	}
	return string(raw)
}
