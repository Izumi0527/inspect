package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	"github.com/your-org/inspect-system/backend-go/internal/reports"
	"go.uber.org/zap"
)

func TestGetStats_ShouldApplyExplicitAnalyticsRange(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:read"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	start, end := analyticsRangeBounds()
	span := end.Sub(start) + time.Nanosecond
	prevStart := start.Add(-span)
	prevEnd := start.Add(-time.Microsecond)

	mock.ExpectQuery(`SELECT count\(\*\) FROM "inspection_strategies"`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(5))
	mock.ExpectQuery(`SELECT count\(\*\) FROM "inspection_strategies".*enabled = \$1`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(3))
	mock.ExpectQuery(`SELECT COUNT\(\*\) AS total_executions, COALESCE\(SUM\(batch_completed\), 0\) AS success_executions, COALESCE\(AVG\(CASE WHEN batch_completed = 1 THEN batch_score ELSE NULL END\), 0\) AS avg_score FROM \(SELECT CASE WHEN batch_id.*batch_completed.*batch_failed.*SUM\(passed_checks \+ failed_checks \+ warning_checks\).*AS batch_score FROM "inspections" WHERE started_at >= \$1 AND started_at <= \$2 GROUP BY CASE WHEN batch_id.*\) AS batch_stats`).
		WithArgs(start, end).
		WillReturnRows(sqlmock.NewRows([]string{"total_executions", "success_executions", "avg_score"}).AddRow(12, 8, 91.2))
	mock.ExpectQuery(`SELECT COUNT\(\*\) AS total_executions, COALESCE\(SUM\(batch_completed\), 0\) AS success_executions, COALESCE\(AVG\(CASE WHEN batch_completed = 1 THEN batch_score ELSE NULL END\), 0\) AS avg_score FROM \(SELECT CASE WHEN batch_id.*FROM "inspections" WHERE started_at >= \$1 AND started_at <= \$2 GROUP BY CASE WHEN batch_id.*\) AS batch_stats`).
		WithArgs(prevStart, prevEnd).
		WillReturnRows(sqlmock.NewRows([]string{"total_executions", "success_executions", "avg_score"}).AddRow(0, 0, 0))
	// 最近已完成执行按批次聚合：先对分组键去重计数，再按分组键取最近 7 个批次。
	// 完成时间窗口为批次级条件（HAVING MAX(completed_at)），保证返回完整批次；
	// 行级不再过滤 completed_at（评审 M1：运行中批次会被行级 WHERE 截断成部分设备），
	// 「批次是否完成」由 HAVING COUNT(*) = COUNT(completed_at) 表达。
	mock.ExpectQuery(`SELECT count\(\*\) FROM \(SELECT CASE WHEN batch_id.*AS group_key FROM "inspections".*GROUP BY CASE WHEN batch_id.*HAVING COUNT\(\*\) = COUNT\(completed_at\) AND MAX\(completed_at\) >= \$1 AND MAX\(completed_at\) <= \$2\) AS grouped_executions`).
		WithArgs(start, end).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`SELECT CASE WHEN batch_id.*AS group_key, MIN\(id\) AS min_id.*HAVING COUNT\(\*\) = COUNT\(completed_at\) AND MAX\(completed_at\) >= \$1 AND MAX\(completed_at\) <= \$2.*ORDER BY MAX\(completed_at\) DESC, min_id DESC`).
		WithArgs(start, end, 7).
		WillReturnRows(sqlmock.NewRows([]string{"group_key", "min_id", "start_time"}))

	ctx, rec := newEchoContextWithBody(
		http.MethodGet,
		"/api/v1/inspection/stats?period=month&start_date=2026-03-01&end_date=2026-03-31",
		token,
		nil,
	)

	if err := h.GetStats(ctx); err != nil {
		t.Fatalf("GetStats: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("http status = %d, want %d", rec.Code, http.StatusOK)
	}

	var payload struct {
		Data struct {
			ExecutionCount int     `json:"executionCount"`
			SuccessRate    float64 `json:"successRate"`
			AvgScore       float64 `json:"avgScore"`
			Changes        struct {
				ExecutionsChange  string `json:"executionsChange"`
				SuccessRateChange string `json:"successRateChange"`
				AvgScoreChange    string `json:"avgScoreChange"`
			} `json:"changes"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("json.Unmarshal: %v", err)
	}
	if payload.Data.ExecutionCount != 12 || payload.Data.AvgScore != 91.2 {
		t.Fatalf("unexpected stats metrics: %+v", payload.Data)
	}
	if payload.Data.Changes.ExecutionsChange != "+100.0%" {
		t.Fatalf("executionsChange = %q, want +100.0%%", payload.Data.Changes.ExecutionsChange)
	}
	if payload.Data.Changes.SuccessRateChange != "0.0%" || payload.Data.Changes.AvgScoreChange != "0.0%" {
		t.Fatalf("zero-baseline delta should be 0.0%%, got %+v", payload.Data.Changes)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestGetDeviceDistribution_ShouldApplyExplicitAnalyticsRange(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:read"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	mock.ExpectQuery(`SELECT .*device_type.*COUNT\(DISTINCT.*device_id.* AS count.*FROM .*inspections.*JOIN .*devices.*started_at >= \$1 AND .*started_at <= \$2.*GROUP BY .*device_type`).
		WithArgs(analyticsRangeBounds()).
		WillReturnRows(sqlmock.NewRows([]string{"device_type", "count"}).AddRow("switch", 4))

	ctx, rec := newEchoContextWithBody(
		http.MethodGet,
		"/api/v1/inspection/device-distribution?period=month&start_date=2026-03-01&end_date=2026-03-31",
		token,
		nil,
	)

	if err := h.GetDeviceDistribution(ctx); err != nil {
		t.Fatalf("GetDeviceDistribution: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("http status = %d, want %d", rec.Code, http.StatusOK)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestGetProblemDistribution_ShouldApplyExplicitAnalyticsRange(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:read"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	start, end := analyticsRangeBounds()
	mock.ExpectQuery(`SELECT COALESCE\(NULLIF\(TRIM\(inspection_results\.check_item_name\), ''\), NULLIF\(TRIM\(inspection_results\.check_item_type\), ''\), '其他'\) AS category, COUNT\(\*\) AS count FROM "inspection_results" JOIN inspections ON inspections\.id = inspection_results\.inspection_id WHERE .*started_at >= \$1 AND .*started_at <= \$2\)? AND inspection_results\.status IN \(\$3,\$4\) GROUP BY COALESCE\(NULLIF\(TRIM\(inspection_results\.check_item_name\), ''\), NULLIF\(TRIM\(inspection_results\.check_item_type\), ''\), '其他'\) ORDER BY COUNT\(\*\) DESC`).
		WithArgs(start, end, "fail", "warning").
		WillReturnRows(sqlmock.NewRows([]string{"category", "count"}).
			AddRow("CPU 使用率", 6).
			AddRow("snmp", 2).
			AddRow("icmp", 1))

	ctx, rec := newEchoContextWithBody(
		http.MethodGet,
		"/api/v1/inspection/problem-distribution?period=month&start_date=2026-03-01&end_date=2026-03-31",
		token,
		nil,
	)

	if err := h.GetProblemDistribution(ctx); err != nil {
		t.Fatalf("GetProblemDistribution: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("http status = %d, want %d", rec.Code, http.StatusOK)
	}

	var payload struct {
		Data []struct {
			Category string `json:"category"`
			Count    int    `json:"count"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("json.Unmarshal: %v", err)
	}
	if len(payload.Data) != 3 {
		t.Fatalf("len(data) = %d, want 3", len(payload.Data))
	}
	if payload.Data[0].Category != "CPU 使用率" || payload.Data[1].Category != "SNMP检查" || payload.Data[2].Category != "ICMP连通性" {
		t.Fatalf("unexpected problem distribution labels: %+v", payload.Data)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

// businessLocation 返回测试用的业务时区。
// handler 未注入 Settings 时，ResolveLocation 回退到默认时区 Asia/Shanghai。
func businessLocation() *time.Location {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		panic("load Asia/Shanghai: " + err.Error())
	}
	return loc
}

// analyticsRangeBounds 返回按业务时区解释的区间边界：
// 前端传的 2026-03-01 / 2026-03-31 是本地自然日，
// 边界应为该时区的 00:00 与 23:59:59.999（而非 UTC 零点，那会漏掉本地 0-8 点）。
func analyticsRangeBounds() (time.Time, time.Time) {
	loc := businessLocation()
	start := time.Date(2026, 3, 1, 0, 0, 0, 0, loc)
	end := time.Date(2026, 3, 31, 23, 59, 59, 999999999, loc)
	return start, end
}

func TestGetTrends_ShouldApplyExplicitAnalyticsRangeUsingStartedAt(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:read"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	start, end := analyticsRangeBounds()
	// 聚合按批次子查询并以业务时区截断（AT TIME ZONE 'Asia/Shanghai'），与区间边界同一口径。
	// 返回行里的 date 用 UTC 位置：模拟 pgx 把「无时区 timestamp」解码为 UTC 的行为。
	mock.ExpectQuery(`SELECT date_trunc\('month', batch_started_at AT TIME ZONE 'Asia/Shanghai'\) AS date, COUNT\(\*\) AS executions, COALESCE\(SUM\(batch_completed\), 0\) AS success, COALESCE\(SUM\(batch_failed\), 0\) AS failed, COALESCE\(AVG\(CASE WHEN batch_completed = 1 THEN batch_score ELSE NULL END\), 0\) AS avg_score FROM \(SELECT CASE WHEN batch_id.*MIN\(started_at\) AS batch_started_at.*batch_completed.*batch_failed.*SUM\(passed_checks \+ failed_checks \+ warning_checks\).*AS batch_score FROM "inspections" WHERE started_at >= \$1 AND started_at <= \$2 GROUP BY CASE WHEN batch_id.*\) AS batch_trends GROUP BY "date" ORDER BY date ASC`).
		WithArgs(start, end).
		WillReturnRows(sqlmock.NewRows([]string{"date", "executions", "success", "failed", "avg_score"}).
			AddRow(time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC), 12, 10, 2, 91.2))

	ctx, rec := newEchoContextWithBody(
		http.MethodGet,
		"/api/v1/inspection/trends?period=month&start_date=2026-03-01&end_date=2026-03-31",
		token,
		nil,
	)

	if err := h.GetTrends(ctx); err != nil {
		t.Fatalf("GetTrends: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("http status = %d, want %d", rec.Code, http.StatusOK)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestGetStats_ShouldReturnRecentCompletedExecutionsWithPreciseCompletedTime(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:read"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	start, end := analyticsRangeBounds()
	completedAt := time.Date(2026, 3, 30, 18, 45, 12, 0, time.UTC)
	startedAt := completedAt.Add(-5 * time.Minute)
	scheduleID := 9

	mock.ExpectQuery(`SELECT count\(\*\) FROM "inspection_strategies"`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(5))
	mock.ExpectQuery(`SELECT count\(\*\) FROM "inspection_strategies".*enabled = \$1`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(3))
	mock.ExpectQuery(`SELECT COUNT\(\*\) AS total_executions, COALESCE\(SUM\(batch_completed\), 0\) AS success_executions, COALESCE\(AVG\(CASE WHEN batch_completed = 1 THEN batch_score ELSE NULL END\), 0\) AS avg_score FROM \(SELECT CASE WHEN batch_id.*FROM "inspections" WHERE started_at >= \$1 AND started_at <= \$2 GROUP BY CASE WHEN batch_id.*\) AS batch_stats`).
		WithArgs(start, end).
		WillReturnRows(sqlmock.NewRows([]string{"total_executions", "success_executions", "avg_score"}).AddRow(2, 1, 91.2))
	mock.ExpectQuery(`SELECT COUNT\(\*\) AS total_executions, COALESCE\(SUM\(batch_completed\), 0\) AS success_executions, COALESCE\(AVG\(CASE WHEN batch_completed = 1 THEN batch_score ELSE NULL END\), 0\) AS avg_score FROM \(SELECT CASE WHEN batch_id.*FROM "inspections" WHERE started_at >= \$1 AND started_at <= \$2 GROUP BY CASE WHEN batch_id.*\) AS batch_stats`).
		WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"total_executions", "success_executions", "avg_score"}).AddRow(0, 0, 0))
	// 最近已完成执行按批次聚合：计数 → 批次键 → 批内记录 → 策略名
	inspectionColumns := []string{
		"id", "device_id", "template_id", "schedule_id", "name", "trigger", "status",
		"scheduled_at", "started_at", "completed_at", "duration", "total_checks", "passed_checks",
		"failed_checks", "warning_checks", "skipped_checks", "error_message", "error_details",
		"timeout", "retry_count", "max_retries", "created_by", "created_at", "updated_at",
	}
	mock.ExpectQuery(`SELECT count\(\*\) FROM \(SELECT CASE WHEN batch_id.*AS group_key FROM "inspections".*GROUP BY CASE WHEN batch_id.*HAVING COUNT\(\*\) = COUNT\(completed_at\) AND MAX\(completed_at\) >= \$1 AND MAX\(completed_at\) <= \$2\) AS grouped_executions`).
		WithArgs(start, end).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
	mock.ExpectQuery(`SELECT CASE WHEN batch_id.*AS group_key, MIN\(id\) AS min_id.*HAVING COUNT\(\*\) = COUNT\(completed_at\) AND MAX\(completed_at\) >= \$1 AND MAX\(completed_at\) <= \$2.*ORDER BY MAX\(completed_at\) DESC, min_id DESC`).
		WithArgs(start, end, 7).
		WillReturnRows(sqlmock.NewRows([]string{"group_key", "min_id", "start_time"}).
			AddRow("g1", 101, startedAt))
	// 行回查：base 无行级 WHERE（评审 M1），IN 参数为 $1
	mock.ExpectQuery(`SELECT \*, CASE WHEN batch_id.*AS group_key FROM "inspections" WHERE CASE WHEN batch_id.*IN \(\$1\)`).
		WithArgs("g1").
		WillReturnRows(sqlmock.NewRows(append(inspectionColumns, "group_key")).AddRow(
			101, 1, nil, scheduleID, nil, inspection.TriggerManual, inspection.StatusCompleted,
			nil, startedAt, completedAt, 300, 10, 9, 1, 0, 0, nil, []byte(`{}`),
			nil, nil, nil, nil, startedAt, completedAt, "g1",
		))
	mock.ExpectQuery(`SELECT id, name FROM "inspection_strategies" WHERE id IN \(\$1\)`).
		WithArgs(scheduleID).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name"}).AddRow(scheduleID, "核心巡检策略"))

	ctx, rec := newEchoContextWithBody(
		http.MethodGet,
		"/api/v1/inspection/stats?period=month&start_date=2026-03-01&end_date=2026-03-31",
		token,
		nil,
	)

	if err := h.GetStats(ctx); err != nil {
		t.Fatalf("GetStats: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("http status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var payload struct {
		Data struct {
			RecentExecutions []struct {
				ID           string `json:"id"`
				StrategyName string `json:"strategyName"`
				Status       string `json:"status"`
				EndTime      string `json:"endTime"`
			} `json:"recentExecutions"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("json.Unmarshal response: %v, body=%s", err, rec.Body.String())
	}
	if len(payload.Data.RecentExecutions) != 1 {
		t.Fatalf("recentExecutions length = %d, want 1, body=%s", len(payload.Data.RecentExecutions), rec.Body.String())
	}
	execution := payload.Data.RecentExecutions[0]
	if execution.ID != "101" {
		t.Fatalf("recentExecutions[0].id = %q, want 101", execution.ID)
	}
	if execution.StrategyName != "核心巡检策略" {
		t.Fatalf("recentExecutions[0].strategyName = %q, want 核心巡检策略", execution.StrategyName)
	}
	if execution.Status != inspection.StatusCompleted {
		t.Fatalf("recentExecutions[0].status = %q, want %q", execution.Status, inspection.StatusCompleted)
	}
	if execution.EndTime != completedAt.Format(time.RFC3339) {
		t.Fatalf("recentExecutions[0].endTime = %q, want %q", execution.EndTime, completedAt.Format(time.RFC3339))
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestExportAnalytics_ShouldRejectUnsupportedFormat(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:read"})
	gormDB, _, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service:         svc,
		Reports:         reports.NewService(gormDB, zap.NewNop()),
		ReportOutputDir: t.TempDir(),
		Auth:            authSvc,
		Logger:          zap.NewNop(),
	}

	ctx, _ := newEchoContextWithBody(
		http.MethodPost,
		"/api/v1/inspection/analytics/export?period=week&format_type=exe",
		token,
		nil,
	)

	err := h.ExportAnalytics(ctx)
	assertHTTPErrorCode(t, err, http.StatusBadRequest)
}

func TestGetTrends_ShouldRejectReversedOrExcessiveRange(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:read"})
	gormDB, _, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	reversedCtx, _ := newEchoContextWithBody(
		http.MethodGet,
		"/api/v1/inspection/trends?period=day&start_date=2026-03-10&end_date=2026-03-01",
		token,
		nil,
	)
	assertHTTPErrorCode(t, h.GetTrends(reversedCtx), http.StatusBadRequest)

	excessiveCtx, _ := newEchoContextWithBody(
		http.MethodGet,
		"/api/v1/inspection/trends?period=day&start_date=2020-01-01&end_date=2026-12-31",
		token,
		nil,
	)
	assertHTTPErrorCode(t, h.GetTrends(excessiveCtx), http.StatusBadRequest)
}
