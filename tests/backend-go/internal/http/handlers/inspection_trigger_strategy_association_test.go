package handlers_test

import (
	"database/sql/driver"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"

	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"

	"go.uber.org/zap"
	"gorm.io/gorm"
)

func TestTriggerStrategy_ShouldSetScheduleID(t *testing.T) {
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
	mock.ExpectQuery(`SELECT .* FROM "inspection_strategies" WHERE id = \$1.*`).
		WithArgs(1, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id",
			"name",
			"description",
			"type",
			"cron",
			"devices",
			"templates",
			"enabled",
			"last_run_time",
			"next_run_time",
			"created_at",
			"updated_at",
		}).AddRow(
			1,
			"策略A",
			nil,
			inspection.StrategyManual,
			nil,
			[]byte(`[100]`),
			[]byte(`[200]`),
			true,
			nil,
			nil,
			now,
			now,
		))

	mock.ExpectQuery(`SELECT .* FROM "inspection_templates" WHERE id = \$1.*`).
		WithArgs(200, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id",
			"name",
			"description",
			"category",
			"device_types",
			"check_items",
			"is_default",
			"is_active",
			"created_at",
			"updated_at",
		}).AddRow(
			200,
			"模板A",
			nil,
			nil,
			[]byte(`["switch"]`),
			[]byte(`[]`),
			false,
			true,
			now,
			now,
		))

	insertArgs := buildInspectionInsertExpectedArgs(t, gormDB, 1, 200)
	mock.ExpectQuery(`INSERT INTO "inspections".*RETURNING "id"`).
		WithArgs(insertArgs...).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(123))

	// goroutine 启动后会先重新读取模板，再尝试读取巡检记录更新状态；
	// 这里让首次读取巡检记录就返回“未找到”，以避免触发后续 UPDATE/结果写入。
	mock.ExpectQuery(`SELECT .* FROM "inspection_templates" WHERE id = \$1.*`).
		WithArgs(200, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id",
			"name",
			"description",
			"category",
			"device_types",
			"check_items",
			"is_default",
			"is_active",
			"created_at",
			"updated_at",
		}).AddRow(
			200,
			"模板A",
			nil,
			nil,
			[]byte(`["switch"]`),
			[]byte(`[]`),
			false,
			true,
			now,
			now,
		))
	mock.ExpectQuery(`SELECT .* FROM "inspections" WHERE id = \$1.*`).
		WithArgs(123, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "device_id", "template_id", "schedule_id", "name", "trigger", "status",
		}))

	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/inspection/strategies/1/trigger", token, nil)
	ctx.SetParamNames("id")
	ctx.SetParamValues("1")

	err := h.TriggerStrategy(ctx)
	if err != nil {
		t.Fatalf("TriggerStrategy: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("http status = %d, want %d", rec.Code, http.StatusOK)
	}

	// 等待 goroutine 触发预期的 UPDATE
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

func buildInspectionInsertExpectedArgs(t *testing.T, db *gorm.DB, scheduleID int, templateID int) []driver.Value {
	t.Helper()

	name := "策略A 手动触发"
	now := time.Now().UTC()
	createdBy := ""
	scheduleIDPtr := &scheduleID

	item := inspection.Inspection{
		DeviceID:   100,
		TemplateID: &templateID,
		ScheduleID: scheduleIDPtr,
		Name:       &name,
		Trigger:    inspection.TriggerManual,
		Status:     inspection.StatusPending,
		CreatedBy:  &createdBy,
		CreatedAt:  &now,
		UpdatedAt:  &now,
	}

	tx := db.Session(&gorm.Session{DryRun: true}).Create(&item)
	insertSQL := tx.Statement.SQL.String()
	if strings.TrimSpace(insertSQL) == "" {
		t.Fatalf("dry-run insert sql is empty")
	}

	scheduleIndex, err := findInsertColumnIndex(insertSQL, "schedule_id")
	if err != nil {
		t.Fatalf("find schedule_id column index: %v\nsql=%s", err, insertSQL)
	}
	templateIndex, err := findInsertColumnIndex(insertSQL, "template_id")
	if err != nil {
		t.Fatalf("find template_id column index: %v\nsql=%s", err, insertSQL)
	}

	if len(tx.Statement.Vars) == 0 {
		t.Fatalf("dry-run insert vars is empty\nsql=%s", insertSQL)
	}

	args := make([]driver.Value, len(tx.Statement.Vars))
	for i := range args {
		args[i] = sqlmock.AnyArg()
	}
	if scheduleIndex < 0 || scheduleIndex >= len(args) {
		t.Fatalf("scheduleIndex=%d out of range, args=%d\nsql=%s", scheduleIndex, len(args), insertSQL)
	}
	if templateIndex < 0 || templateIndex >= len(args) {
		t.Fatalf("templateIndex=%d out of range, args=%d\nsql=%s", templateIndex, len(args), insertSQL)
	}
	args[scheduleIndex] = anyIntEquals{want: int64(scheduleID)}
	args[templateIndex] = anyIntEquals{want: int64(templateID)}
	return args
}

func findInsertColumnIndex(insertSQL string, wantColumn string) (int, error) {
	normalized := strings.ReplaceAll(insertSQL, "\n", " ")
	open := strings.Index(normalized, "(")
	if open < 0 {
		return -1, fmt.Errorf("insert sql missing columns list: %s", insertSQL)
	}
	close := strings.Index(normalized[open:], ") VALUES")
	if close < 0 {
		return -1, fmt.Errorf("insert sql missing values section: %s", insertSQL)
	}
	close = open + close

	columnsPart := normalized[open+1 : close]
	columns := strings.Split(columnsPart, ",")
	for idx, raw := range columns {
		col := strings.TrimSpace(raw)
		col = strings.Trim(col, `"`)
		if col == wantColumn {
			return idx, nil
		}
	}
	return -1, fmt.Errorf("column %q not found", wantColumn)
}

type anyIntEquals struct {
	want int64
}

func (m anyIntEquals) Match(value driver.Value) bool {
	switch v := value.(type) {
	case int:
		return int64(v) == m.want
	case int32:
		return int64(v) == m.want
	case int64:
		return v == m.want
	case uint:
		return int64(v) == m.want
	case uint32:
		return int64(v) == m.want
	case uint64:
		return int64(v) == m.want
	default:
		return false
	}
}
