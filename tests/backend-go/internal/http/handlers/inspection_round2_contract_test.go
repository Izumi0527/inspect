package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/labstack/echo/v4"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	"go.uber.org/zap"
)

func TestStartTask_ShouldLoadTemplateAndDispatchExecution(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:execute"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	now := time.Now().UTC()
	templateID := 200
	mock.ExpectQuery(`SELECT .* FROM "inspections" WHERE id = \$1.*`).
		WithArgs(1, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "device_id", "template_id", "schedule_id", "name", "trigger", "status", "scheduled_at",
			"started_at", "completed_at", "duration", "total_checks", "passed_checks", "failed_checks",
			"warning_checks", "skipped_checks", "error_message", "error_details", "timeout", "retry_count",
			"max_retries", "created_by", "created_at", "updated_at",
		}).AddRow(
			1, 101, templateID, nil, "任务A", inspection.TriggerManual, inspection.StatusPending, nil,
			nil, nil, nil, 0, 0, 0, 0, 0, nil, []byte(`{}`), nil, nil, nil, "tester", now, now,
		))
	mock.ExpectQuery(`SELECT .* FROM "inspection_templates" WHERE id = \$1.*`).
		WithArgs(templateID, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "name", "description", "category", "device_types", "check_items", "is_default", "is_active", "created_at", "updated_at",
		}).AddRow(
			templateID, "模板A", nil, nil, []byte(`["switch"]`), []byte(`[{"name":"ICMP检查","type":"icmp","category":"connectivity"}]`), false, true, now, now,
		))

	// goroutine 内的 executeInspection 会先再次读取巡检记录；让它立即返回未找到以停止后续 DB 写入。
	mock.ExpectQuery(`SELECT .* FROM "inspections" WHERE id = \$1.*`).
		WithArgs(1, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "device_id", "template_id", "schedule_id", "name", "trigger", "status",
		}))

	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/inspection/tasks/1/start", token, nil)
	ctx.SetParamNames("id")
	ctx.SetParamValues("1")

	if err := h.StartTask(ctx); err != nil {
		t.Fatalf("StartTask: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("http status = %d, want %d", rec.Code, http.StatusOK)
	}

	deadline := time.Now().Add(500 * time.Millisecond)
	for {
		if err := mock.ExpectationsWereMet(); err == nil {
			break
		} else if time.Now().After(deadline) {
			t.Fatalf("sqlmock expectations not met: %v", err)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// 状态筛选为批次级 HAVING：批内任一设备命中即返回完整批次（不截断设备集合）
func TestListExecutions_ShouldFilterByStatusAtBatchLevel(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:read"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	startTime := time.Date(2026, 6, 30, 9, 0, 0, 0, time.UTC)

	// count 子查询与批次键查询均带 HAVING bool_or(status IN ($1))，切片参数展开为单个占位符
	mock.ExpectQuery(`SELECT count\(\*\) FROM \(SELECT CASE WHEN batch_id.*AS group_key FROM "inspections" GROUP BY CASE WHEN batch_id.*HAVING bool_or\(status IN \(\$1\)\)\) AS grouped_executions`).
		WithArgs("running").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
	mock.ExpectQuery(`SELECT CASE WHEN batch_id.*AS group_key, MIN\(id\) AS min_id.*HAVING bool_or\(status IN \(\$1\)\).*ORDER BY start_time DESC, min_id DESC`).
		WithArgs("running", 10).
		WillReturnRows(sqlmock.NewRows([]string{"group_key", "min_id", "start_time"}).
			AddRow("g1", 1, startTime))
	// 行回查不带状态过滤：命中批次返回完整设备集合（1 台 running + 1 台 completed）
	mock.ExpectQuery(`SELECT \*, CASE WHEN batch_id.*AS group_key FROM "inspections" WHERE CASE WHEN batch_id.*IN \(\$1\)`).
		WithArgs("g1").
		WillReturnRows(sqlmock.NewRows(append(append([]string{}, inspectionColumns...), "group_key")).
			AddRow(1, 101, nil, 9, "策略A 手动触发", inspection.TriggerManual, inspection.StatusRunning,
				nil, startTime, nil, nil, 10, 5, 0, 0, 0, nil, []byte(`{}`),
				nil, nil, nil, nil, startTime, startTime, "g1").
			AddRow(2, 102, nil, 9, "策略A 手动触发", inspection.TriggerManual, inspection.StatusCompleted,
				nil, startTime, startTime.Add(time.Minute), 60, 10, 10, 0, 0, 0, nil, []byte(`{}`),
				nil, nil, nil, nil, startTime, startTime, "g1"))
	mock.ExpectQuery(`SELECT id, name FROM "inspection_strategies" WHERE id IN \(\$1\)`).
		WithArgs(9).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name"}).AddRow(9, "策略A"))

	ctx, rec := newEchoContextWithBody(
		http.MethodGet,
		"/api/v1/inspection/executions?status=running&page=1&page_size=10",
		token,
		nil,
	)
	if err := h.ListExecutions(ctx); err != nil {
		t.Fatalf("ListExecutions: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("http status = %d, body=%s", rec.Code, rec.Body.String())
	}

	var payload struct {
		Data struct {
			Items []struct {
				Status       string `json:"status"`
				TotalDevices int    `json:"totalDevices"`
			} `json:"items"`
			Total int `json:"total"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("json.Unmarshal: %v, body=%s", err, rec.Body.String())
	}

	if payload.Data.Total != 1 {
		t.Fatalf("total = %d, want 1, body=%s", payload.Data.Total, rec.Body.String())
	}
	if len(payload.Data.Items) != 1 {
		t.Fatalf("items length = %d, want 1, body=%s", len(payload.Data.Items), rec.Body.String())
	}
	item := payload.Data.Items[0]
	// 核心断言：筛选"执行中"但返回的批次包含全部 2 台设备，而非仅 running 那一台
	if item.TotalDevices != 2 {
		t.Fatalf("items[0].totalDevices = %d, want 2（状态筛选不得截断批次设备集合）, body=%s", item.TotalDevices, rec.Body.String())
	}
	if item.Status != inspection.StatusRunning {
		t.Fatalf("items[0].status = %q, want running", item.Status)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestGetTaskResults_ShouldReturnNotFoundWhenTaskMissing(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:read"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	mock.ExpectQuery(`SELECT .* FROM "inspections" WHERE id = \$1.*`).
		WithArgs(99, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "device_id", "template_id", "schedule_id", "name", "trigger", "status",
		}))

	ctx, _ := newEchoContextWithBody(http.MethodGet, "/api/v1/inspection/tasks/99/results", token, nil)
	ctx.SetParamNames("id")
	ctx.SetParamValues("99")

	err := h.GetTaskResults(ctx)
	httpErr, ok := err.(*echo.HTTPError)
	if !ok {
		t.Fatalf("error type = %T, want *echo.HTTPError", err)
	}
	if httpErr.Code != http.StatusNotFound {
		t.Fatalf("http code = %d, want %d", httpErr.Code, http.StatusNotFound)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestListExecutions_ShouldFilterByStartedAtOrCreatedAtFallback(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:read"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	start := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	endExclusive := time.Date(2026, 4, 7, 0, 0, 0, 0, time.UTC)

	// 执行历史按批次聚合：先对分组键去重计数，再按分组键分页取本页批次。
	// 日期筛选为批次级条件（HAVING），保证跨时间边界的批次返回完整设备集合。
	mock.ExpectQuery(`SELECT count\(\*\) FROM \(SELECT CASE WHEN batch_id.*AS group_key FROM "inspections" GROUP BY CASE WHEN batch_id.*HAVING MIN\(COALESCE\(started_at, created_at\)\) >= \$1 AND MIN\(COALESCE\(started_at, created_at\)\) < \$2\) AS grouped_executions`).
		WithArgs(start, endExclusive).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`SELECT CASE WHEN batch_id.*AS group_key, MIN\(id\) AS min_id.*HAVING MIN\(COALESCE\(started_at, created_at\)\) >= \$1 AND MIN\(COALESCE\(started_at, created_at\)\) < \$2.*ORDER BY start_time DESC, min_id DESC`).
		WithArgs(start, endExclusive, 10).
		WillReturnRows(sqlmock.NewRows([]string{"group_key", "min_id", "start_time"}))

	ctx, rec := newEchoContextWithBody(
		http.MethodGet,
		"/api/v1/inspection/executions?start_date=2026-04-01&end_date=2026-04-06&page=1&page_size=10",
		token,
		nil,
	)

	if err := h.ListExecutions(ctx); err != nil {
		t.Fatalf("ListExecutions: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("http status = %d, want %d", rec.Code, http.StatusOK)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
