package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/alerts"
	"github.com/your-org/inspect-system/backend-go/internal/dashboard"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

type dashboardOverviewContractResponse struct {
	Sections map[string]struct {
		Ok                  bool    `json:"ok"`
		Message             *string `json:"message"`
		LimitedByPermission bool    `json:"limitedByPermission"`
		RequiredPermission  string  `json:"requiredPermission"`
	} `json:"sections"`
}

func newDashboardOverviewHandler(t *testing.T, permissions []string) (handlers.DashboardHandler, sqlmock.Sqlmock, func()) {
	t.Helper()

	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	// 总览实时告警经 alerts.Service.ListAlerts 查询，需注入真实告警服务才能走到 SQL 层
	service := dashboard.NewService(gormDB, alerts.NewService(gormDB, zap.NewNop()), nil, nil, nil, zap.NewNop())
	return handlers.DashboardHandler{
		Service: service,
		Auth: notificationContractAuthService{
			userID:      "user-1",
			permissions: permissions,
		},
	}, mock, cleanup
}

func TestDashboardOverviewHandler_ShouldReturnSectionFailureInsteadOfFatalPageError(t *testing.T) {
	h, mock, cleanup := newDashboardOverviewHandler(t, []string{"alerts:read"})
	defer cleanup()

	mock.ExpectQuery(`(?is)SELECT .*COUNT\(\*\) AS count.*FROM alerts AS a JOIN devices d ON d\.id = a\.device_id.*GROUP BY .*severity.*`).
		WillReturnRows(sqlmock.NewRows([]string{"severity", "status", "count"}).
			AddRow("critical", "active", 3))
	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM alerts AS a JOIN devices d ON d\.id = a\.device_id WHERE .*status IN .*`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`(?is)SELECT .*FROM alerts AS a JOIN devices d ON d\.id = a\.device_id.*status IN .*`).
		WillReturnError(assertiveError("active alerts unavailable"))

	ctx, rec := newEchoContextWithBody(http.MethodGet, "/api/v1/dashboard/overview", "test-token", nil)

	if err := h.GetOverview(ctx); err != nil {
		t.Fatalf("GetOverview returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var resp dashboardOverviewContractResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("json.Unmarshal response: %v", err)
	}

	section, ok := resp.Sections["activeAlerts"]
	if !ok {
		t.Fatalf("sections should contain activeAlerts, got %v", resp.Sections)
	}
	if section.Ok {
		t.Fatalf("activeAlerts.ok = true, want false")
	}
	if section.Message == nil || *section.Message == "" {
		t.Fatalf("activeAlerts.message should not be empty")
	}

	// 活跃告警数据可用时，副文案应为真实口径"待处理"（而非无对比数据的"较昨日"）
	var statsResp dashboardOverviewStatsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &statsResp); err != nil {
		t.Fatalf("json.Unmarshal stats response: %v", err)
	}
	if len(statsResp.Stats) < 2 {
		t.Fatalf("stats length = %d, want >= 2", len(statsResp.Stats))
	}
	if statsResp.Stats[1].Change != "待处理" {
		t.Fatalf("alert card change = %q, want 待处理", statsResp.Stats[1].Change)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

type assertiveError string

func (e assertiveError) Error() string {
	return string(e)
}

type dashboardOverviewStatsResponse struct {
	Stats []struct {
		Title  string  `json:"title"`
		Value  string  `json:"value"`
		Change string  `json:"change"`
		Unit   *string `json:"unit"`
	} `json:"stats"`
	Sections map[string]struct {
		Ok bool `json:"ok"`
	} `json:"sections"`
}

func TestDashboardOverviewHandler_ShouldSplitPeakTrafficAndExposeInspectionCard(t *testing.T) {
	h, mock, cleanup := newDashboardOverviewHandler(t, []string{"monitoring:read", "inspections:read"})
	defer cleanup()

	// 方向峰值查询：24小时窗口内下行(入站)峰值 2Mbps、上行(出站)峰值 1Mbps
	mock.ExpectQuery(`(?is)WITH per_device AS.*time_buckets AS.*MAX\(inbound\) AS peak_inbound.*MAX\(outbound\) AS peak_outbound.*`).
		WillReturnRows(sqlmock.NewRows([]string{"peak_inbound", "peak_outbound", "peak_combined", "sample_count"}).
			AddRow(2_000_000.0, 1_000_000.0, 3_000_000.0, 12))

	// 巡检成功率查询：24小时窗口内 8 次已结束巡检，6 次完成
	mock.ExpectQuery(`(?is)SELECT.*COUNT\(\*\) AS finished.*SUM\(CASE WHEN status = 'completed'.*FROM inspections.*`).
		WillReturnRows(sqlmock.NewRows([]string{"finished", "succeeded"}).AddRow(8, 6))

	ctx, rec := newEchoContextWithBody(http.MethodGet, "/api/v1/dashboard/overview", "test-token", nil)

	if err := h.GetOverview(ctx); err != nil {
		t.Fatalf("GetOverview returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var resp dashboardOverviewStatsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("json.Unmarshal response: %v", err)
	}

	wantTitles := []string{"在线设备", "活跃告警", "上行流量", "下行流量", "巡检成功率"}
	if len(resp.Stats) != len(wantTitles) {
		t.Fatalf("stats length = %d, want %d", len(resp.Stats), len(wantTitles))
	}
	for i, want := range wantTitles {
		if resp.Stats[i].Title != want {
			t.Fatalf("stats[%d].title = %q, want %q", i, resp.Stats[i].Title, want)
		}
	}

	// 无 devices:read / alerts:read 权限时，前两卡收口为 "-"，副文案随数据不可用而置空
	if resp.Stats[0].Value != "-" || resp.Stats[1].Value != "-" {
		t.Fatalf("restricted stats should be '-', got %q / %q", resp.Stats[0].Value, resp.Stats[1].Value)
	}
	if resp.Stats[0].Change != "" || resp.Stats[1].Change != "" {
		t.Fatalf("restricted stats change should be empty, got %q / %q", resp.Stats[0].Change, resp.Stats[1].Change)
	}
	// 上行=出站峰值、下行=入站峰值，原始 bps 值 + unit 标识交由前端格式化
	if resp.Stats[2].Value != "1000000" || resp.Stats[2].Unit == nil || *resp.Stats[2].Unit != "bps" {
		t.Fatalf("upstream card = %+v, want value 1000000 with unit bps", resp.Stats[2])
	}
	if resp.Stats[3].Value != "2000000" || resp.Stats[3].Unit == nil || *resp.Stats[3].Unit != "bps" {
		t.Fatalf("downstream card = %+v, want value 2000000 with unit bps", resp.Stats[3])
	}
	if resp.Stats[4].Value != "75.0%" {
		t.Fatalf("inspection card value = %q, want 75.0%%", resp.Stats[4].Value)
	}
	if resp.Stats[4].Change != "近24小时" {
		t.Fatalf("inspection card change = %q, want 近24小时", resp.Stats[4].Change)
	}
	if !resp.Sections["statsInspections"].Ok {
		t.Fatalf("sections.statsInspections.ok = false, want true")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestDashboardOverviewHandler_InspectionCardShouldShowNAWhenNoFinishedRuns(t *testing.T) {
	h, mock, cleanup := newDashboardOverviewHandler(t, []string{"inspections:read"})
	defer cleanup()

	// 24小时窗口内无已结束巡检 → 成功率无意义，应显示 N/A 而非 0%/100%
	mock.ExpectQuery(`(?is)SELECT.*COUNT\(\*\) AS finished.*FROM inspections.*`).
		WillReturnRows(sqlmock.NewRows([]string{"finished", "succeeded"}).AddRow(0, nil))

	ctx, rec := newEchoContextWithBody(http.MethodGet, "/api/v1/dashboard/overview", "test-token", nil)

	if err := h.GetOverview(ctx); err != nil {
		t.Fatalf("GetOverview returned error: %v", err)
	}

	var resp dashboardOverviewStatsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("json.Unmarshal response: %v", err)
	}
	if len(resp.Stats) != 5 {
		t.Fatalf("stats length = %d, want 5", len(resp.Stats))
	}
	if resp.Stats[4].Title != "巡检成功率" || resp.Stats[4].Value != "N/A" {
		t.Fatalf("inspection card = %+v, want title 巡检成功率 value N/A", resp.Stats[4])
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

// 实时告警是预览：列表按上限截断，但活跃总数要单独下发，前端才能标出「共 N 条」并把徽标显示成真实数量。
func TestDashboardOverviewHandler_ShouldExposeActiveAlertsTotalBeyondPreview(t *testing.T) {
	h, mock, cleanup := newDashboardOverviewHandler(t, []string{"alerts:read"})
	defer cleanup()

	// 告警统计走 alerts.Service 的多条 COUNT 失败后回退到本包的分组查询；这里只精确匹配
	// ListAlerts 的计数与列表两条 SQL（带 LEFT JOIN alert_rules），其余查询不设期望即失败回退
	mock.MatchExpectationsInOrder(false)
	mock.ExpectQuery(`(?is)SELECT .*COUNT\(\*\) AS count.*FROM alerts AS a JOIN devices d ON d\.id = a\.device_id.*GROUP BY .*severity.*`).
		WillReturnRows(sqlmock.NewRows([]string{"severity", "status", "count"}).AddRow("warning", "active", 25))
	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM alerts AS a JOIN devices d ON d\.id = a\.device_id LEFT JOIN alert_rules r ON r\.id = a\.rule_id WHERE a\.status IN \(\$1,\$2\)`).
		WithArgs("open", "acknowledged").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(25))
	mock.ExpectQuery(`(?is)SELECT a\.\*, d\.name AS device_name.*WHERE a\.status IN \(\$1,\$2\) ORDER BY .*LIMIT \$3`).
		WithArgs("open", "acknowledged", 20).
		WillReturnRows(sqlmock.NewRows([]string{"id", "message", "severity", "status"}))

	ctx, rec := newEchoContextWithBody(http.MethodGet, "/api/v1/dashboard/overview", "test-token", nil)
	if err := h.GetOverview(ctx); err != nil {
		t.Fatalf("GetOverview returned error: %v", err)
	}

	var resp struct {
		ActiveAlerts      []json.RawMessage `json:"active_alerts"`
		ActiveAlertsTotal int               `json:"active_alerts_total"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("json.Unmarshal response: %v", err)
	}
	if resp.ActiveAlertsTotal != 25 {
		t.Fatalf("active_alerts_total = %d, want 25", resp.ActiveAlertsTotal)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
