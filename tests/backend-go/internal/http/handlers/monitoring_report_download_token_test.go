package handlers_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

func TestReportDownloadTokenStore_Consume_MaxUsesAndExpiry(t *testing.T) {
	store := handlers.NewReportDownloadTokenStore(nil, nil)

	token, expiresAt, err := store.Issue(context.Background(), "test.pdf", 2*time.Minute, 2)
	if err != nil {
		t.Fatalf("Issue() err=%v", err)
	}
	if token == "" {
		t.Fatalf("期望生成 token")
	}
	if expiresAt.Before(time.Now().UTC()) {
		t.Fatalf("期望 expiresAt 在当前时间之后，expiresAt=%s", expiresAt)
	}

	filename, ok, err := store.Consume(context.Background(), token)
	if err != nil {
		t.Fatalf("Consume() err=%v", err)
	}
	if !ok || filename != "test.pdf" {
		t.Fatalf("期望 consume 成功并返回文件名，ok=%v filename=%q", ok, filename)
	}

	filename, ok, err = store.Consume(context.Background(), token)
	if err != nil {
		t.Fatalf("Consume(second) err=%v", err)
	}
	if !ok || filename != "test.pdf" {
		t.Fatalf("期望第二次 consume 也成功，ok=%v filename=%q", ok, filename)
	}

	_, ok, err = store.Consume(context.Background(), token)
	if err != nil {
		t.Fatalf("Consume(third) err=%v", err)
	}
	if ok {
		t.Fatalf("期望 token 用尽后失效，第三次应失败")
	}

	// 过期场景：使用极短 TTL + sleep，确保稳定过期
	expiredToken, _, err := store.Issue(context.Background(), "expired.pdf", 30*time.Millisecond, 2)
	if err != nil {
		t.Fatalf("Issue(expired) err=%v", err)
	}
	time.Sleep(80 * time.Millisecond)

	_, ok, err = store.Consume(context.Background(), expiredToken)
	if err != nil {
		t.Fatalf("Consume(expired) err=%v", err)
	}
	if ok {
		t.Fatalf("期望过期 token 无法消费")
	}
}

func TestMonitoringHandler_DownloadMonitoringReportByToken(t *testing.T) {
	e := echo.New()
	dir := t.TempDir()
	fileName := "report.pdf"
	filePath := filepath.Join(dir, fileName)
	if err := os.WriteFile(filePath, []byte("hello"), 0o644); err != nil {
		t.Fatalf("WriteFile err=%v", err)
	}

	store := handlers.NewReportDownloadTokenStore(nil, nil)
	token, _, err := store.Issue(context.Background(), fileName, 5*time.Minute, 2)
	if err != nil {
		t.Fatalf("Issue() err=%v", err)
	}

	h := handlers.MonitoringHandler{
		ReportOutputDir: dir,
		DownloadTokens:  store,
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/monitoring/reports/download", strings.NewReader("token="+token))
	req.Header.Set(echo.HeaderContentType, "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if err := h.DownloadMonitoringReportByToken(c); err != nil {
		e.HTTPErrorHandler(err, c)
	}

	res := rec.Result()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("期望 200，实际=%d", res.StatusCode)
	}
	if got := rec.Body.String(); got != "hello" {
		t.Fatalf("期望下载内容匹配，got=%q", got)
	}
	if disp := res.Header.Get(echo.HeaderContentDisposition); !strings.Contains(disp, "attachment") {
		t.Fatalf("期望 Content-Disposition 为 attachment，got=%q", disp)
	}
	if cache := res.Header.Get(echo.HeaderCacheControl); !strings.Contains(strings.ToLower(cache), "no-store") {
		t.Fatalf("期望 Cache-Control 包含 no-store，got=%q", cache)
	}

	// 限次使用：第二次下载仍可成功
	req2 := httptest.NewRequest(http.MethodPost, "/api/v1/monitoring/reports/download", strings.NewReader("token="+token))
	req2.Header.Set(echo.HeaderContentType, "application/x-www-form-urlencoded")
	rec2 := httptest.NewRecorder()
	c2 := e.NewContext(req2, rec2)

	if err := h.DownloadMonitoringReportByToken(c2); err != nil {
		e.HTTPErrorHandler(err, c2)
	}
	if rec2.Result().StatusCode != http.StatusOK {
		t.Fatalf("期望第二次 200，实际=%d", rec2.Result().StatusCode)
	}

	// 第三次应失败（使用次数耗尽）
	req3 := httptest.NewRequest(http.MethodPost, "/api/v1/monitoring/reports/download", strings.NewReader("token="+token))
	req3.Header.Set(echo.HeaderContentType, "application/x-www-form-urlencoded")
	rec3 := httptest.NewRecorder()
	c3 := e.NewContext(req3, rec3)

	if err := h.DownloadMonitoringReportByToken(c3); err != nil {
		e.HTTPErrorHandler(err, c3)
	}
	if rec3.Result().StatusCode != http.StatusNotFound {
		t.Fatalf("期望第三次 404，实际=%d", rec3.Result().StatusCode)
	}
}

func TestMonitoringHandler_DownloadMonitoringReportByToken_FileNotFound(t *testing.T) {
	e := echo.New()
	dir := t.TempDir()

	store := handlers.NewReportDownloadTokenStore(nil, nil)
	token, _, err := store.Issue(context.Background(), "missing.pdf", 5*time.Minute, 1)
	if err != nil {
		t.Fatalf("Issue() err=%v", err)
	}

	h := handlers.MonitoringHandler{
		ReportOutputDir: dir,
		DownloadTokens:  store,
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/monitoring/reports/download", strings.NewReader("token="+token))
	req.Header.Set(echo.HeaderContentType, "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if err := h.DownloadMonitoringReportByToken(c); err != nil {
		e.HTTPErrorHandler(err, c)
	}
	if rec.Result().StatusCode != http.StatusNotFound {
		t.Fatalf("期望 404，实际=%d", rec.Result().StatusCode)
	}
}

func TestMonitoringHandler_DownloadMonitoringReportByToken_ExpiredToken(t *testing.T) {
	e := echo.New()
	dir := t.TempDir()

	store := handlers.NewReportDownloadTokenStore(nil, nil)
	token, _, err := store.Issue(context.Background(), "expired.pdf", 20*time.Millisecond, 1)
	if err != nil {
		t.Fatalf("Issue() err=%v", err)
	}
	time.Sleep(60 * time.Millisecond)

	h := handlers.MonitoringHandler{
		ReportOutputDir: dir,
		DownloadTokens:  store,
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/monitoring/reports/download", strings.NewReader("token="+token))
	req.Header.Set(echo.HeaderContentType, "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if err := h.DownloadMonitoringReportByToken(c); err != nil {
		e.HTTPErrorHandler(err, c)
	}
	if rec.Result().StatusCode != http.StatusNotFound {
		t.Fatalf("期望 404，实际=%d", rec.Result().StatusCode)
	}
}

type checkTokenResponse struct {
	Valid         bool   `json:"valid"`
	Message       string `json:"message,omitempty"`
	Filename      string `json:"filename,omitempty"`
	ExpiresAt     string `json:"expires_at,omitempty"`
	RemainingUses int    `json:"remaining_uses,omitempty"`
}

func TestMonitoringHandler_CheckMonitoringReportDownloadToken(t *testing.T) {
	e := echo.New()
	dir := t.TempDir()
	fileName := "report.pdf"
	filePath := filepath.Join(dir, fileName)
	if err := os.WriteFile(filePath, []byte("hello"), 0o644); err != nil {
		t.Fatalf("WriteFile err=%v", err)
	}

	store := handlers.NewReportDownloadTokenStore(nil, nil)
	token, _, err := store.Issue(context.Background(), fileName, 5*time.Minute, 2)
	if err != nil {
		t.Fatalf("Issue() err=%v", err)
	}

	authService, bearer := newAuthServiceWithPermissions(t, []string{"monitoring:export"})
	h := handlers.MonitoringHandler{
		ReportOutputDir: dir,
		DownloadTokens:  store,
		Auth:            authService,
	}

	callCheck := func() checkTokenResponse {
		req := httptest.NewRequest(
			http.MethodPost,
			"/api/v1/monitoring/reports/download/check",
			strings.NewReader(`{"token":"`+token+`"}`),
		)
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		req.Header.Set(echo.HeaderAuthorization, "Bearer "+bearer)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		if err := h.CheckMonitoringReportDownloadToken(c); err != nil {
			e.HTTPErrorHandler(err, c)
		}
		if rec.Result().StatusCode != http.StatusOK {
			t.Fatalf("期望 200，实际=%d body=%s", rec.Result().StatusCode, rec.Body.String())
		}

		var resp checkTokenResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("json.Unmarshal err=%v body=%s", err, rec.Body.String())
		}
		return resp
	}

	resp1 := callCheck()
	if !resp1.Valid || resp1.Filename != fileName || resp1.RemainingUses != 2 {
		t.Fatalf("预检期望 valid=true remaining=2，resp=%+v", resp1)
	}

	// 下载一次消耗 1 次使用次数
	reqDownload := httptest.NewRequest(http.MethodPost, "/api/v1/monitoring/reports/download", strings.NewReader("token="+token))
	reqDownload.Header.Set(echo.HeaderContentType, "application/x-www-form-urlencoded")
	recDownload := httptest.NewRecorder()
	cDownload := e.NewContext(reqDownload, recDownload)
	if err := h.DownloadMonitoringReportByToken(cDownload); err != nil {
		e.HTTPErrorHandler(err, cDownload)
	}
	if recDownload.Result().StatusCode != http.StatusOK {
		t.Fatalf("期望下载 200，实际=%d", recDownload.Result().StatusCode)
	}

	resp2 := callCheck()
	if !resp2.Valid || resp2.RemainingUses != 1 {
		t.Fatalf("预检期望 remaining=1，resp=%+v", resp2)
	}

	// 再下载一次，耗尽次数
	reqDownload2 := httptest.NewRequest(http.MethodPost, "/api/v1/monitoring/reports/download", strings.NewReader("token="+token))
	reqDownload2.Header.Set(echo.HeaderContentType, "application/x-www-form-urlencoded")
	recDownload2 := httptest.NewRecorder()
	cDownload2 := e.NewContext(reqDownload2, recDownload2)
	if err := h.DownloadMonitoringReportByToken(cDownload2); err != nil {
		e.HTTPErrorHandler(err, cDownload2)
	}
	if recDownload2.Result().StatusCode != http.StatusOK {
		t.Fatalf("期望第二次下载 200，实际=%d", recDownload2.Result().StatusCode)
	}

	resp3 := callCheck()
	if resp3.Valid {
		t.Fatalf("预检期望 valid=false（已用尽），resp=%+v", resp3)
	}
}

