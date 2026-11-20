package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	"go.uber.org/zap"
)

func TestListExecutions_DeviceIDFilter_ReturnsFullMatchingBatches(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:read"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	h := handlers.InspectionHandler{
		Service: inspection.NewService(gormDB, zap.NewNop()),
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	startTime := time.Date(2026, 11, 20, 10, 0, 0, 0, time.UTC)

	mock.ExpectQuery(`SELECT count\(\*\) FROM \(SELECT CASE WHEN batch_id.*AS group_key FROM "inspections".*HAVING bool_or\(device_id = \$1\)\) AS grouped_executions`).
		WithArgs(7).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

	mock.ExpectQuery(`SELECT CASE WHEN batch_id.*AS group_key, MIN\(id\) AS min_id.*HAVING bool_or\(device_id = \$1\).*ORDER BY start_time DESC, min_id DESC LIMIT \$2`).
		WithArgs(7, 10).
		WillReturnRows(sqlmock.NewRows([]string{"group_key", "min_id", "start_time"}).
			AddRow("b-match", 10, startTime))

	// 该批次同时包含 device 7 和 device 8，按批次聚合返回完整批次语义。
	mock.ExpectQuery(`SELECT \*, CASE WHEN batch_id.*AS group_key FROM "inspections" WHERE CASE WHEN batch_id.*IN \(\$1\)`).
		WithArgs("b-match").
		WillReturnRows(sqlmock.NewRows(append(batchedInspectionColumns(), "group_key")).
			AddRow(10, 7, nil, nil, "核心交换机巡检", inspection.TriggerManual, inspection.StatusCompleted,
				nil, startTime, startTime.Add(time.Minute), 60, 5, 5, 0, 0, 0, nil, []byte(`{}`),
				nil, nil, nil, nil, startTime, startTime, "b-match", "b-match").
			AddRow(11, 8, nil, nil, "核心交换机巡检", inspection.TriggerManual, inspection.StatusCompleted,
				nil, startTime, startTime.Add(time.Minute), 60, 5, 5, 0, 0, 0, nil, []byte(`{}`),
				nil, nil, nil, nil, startTime, startTime, "b-match", "b-match"))

	ctx, rec := newEchoContextWithBody(http.MethodGet, "/api/v1/inspection/executions?device_id=7", token, nil)
	if err := h.ListExecutions(ctx); err != nil {
		t.Fatalf("ListExecutions: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Code int `json:"code"`
		Data struct {
			Total int                      `json:"total"`
			Items []map[string]interface{} `json:"items"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if resp.Data.Total != 1 || len(resp.Data.Items) != 1 {
		t.Fatalf("expected 1 matching batch, got total=%d items=%d", resp.Data.Total, len(resp.Data.Items))
	}
	if totalDevices, _ := resp.Data.Items[0]["totalDevices"].(float64); totalDevices != 2 {
		t.Fatalf("expected full batch totalDevices=2, got %v", resp.Data.Items[0]["totalDevices"])
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations: %v", err)
	}
}

func TestBatchDeleteExecutions_SelectAllFiltered_RespectsDeviceID(t *testing.T) {
	cases := []struct {
		name  string
		field string
	}{
		{name: "camelCase deviceId", field: "deviceId"},
		{name: "snake_case device_id", field: "device_id"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:delete"})
			gormDB, mock, cleanup := newGormDBWithSqlmock(t)
			defer cleanup()

			h := handlers.InspectionHandler{
				Service: inspection.NewService(gormDB, zap.NewNop()),
				Auth:    authSvc,
				Logger:  zap.NewNop(),
			}

			startTime := time.Date(2026, 11, 20, 11, 0, 0, 0, time.UTC)

			// 仅查询 HAVING bool_or(device_id = 7) 命中的批次，严禁扫描或删除其他设备批次。
			mock.ExpectQuery(`SELECT count\(\*\) FROM \(SELECT CASE WHEN batch_id.*AS group_key FROM "inspections".*HAVING bool_or\(device_id = \$1\)\) AS grouped_executions`).
				WithArgs(7).
				WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

			mock.ExpectQuery(`SELECT CASE WHEN batch_id.*AS group_key, MIN\(id\) AS min_id.*HAVING bool_or\(device_id = \$1\).*ORDER BY start_time DESC, min_id DESC LIMIT \$2`).
				WithArgs(7, 10000).
				WillReturnRows(sqlmock.NewRows([]string{"group_key", "min_id", "start_time"}).
					AddRow("b-dev7", 51, startTime))

			mock.ExpectQuery(`SELECT \*, CASE WHEN batch_id.*AS group_key FROM "inspections" WHERE CASE WHEN batch_id.*IN \(\$1\)`).
				WithArgs("b-dev7").
				WillReturnRows(sqlmock.NewRows(append(batchedInspectionColumns(), "group_key")).
					AddRow(51, 7, nil, nil, "巡检-7", inspection.TriggerManual, inspection.StatusCompleted,
						nil, startTime, startTime, 10, 1, 1, 0, 0, 0, nil, []byte(`{}`), nil, nil, nil, nil, startTime, startTime, "b-dev7", "b-dev7"))

			mock.ExpectBegin()
			mock.ExpectExec(`DELETE FROM "inspection_results" WHERE inspection_id IN \(\$1\)`).
				WithArgs(51).
				WillReturnResult(sqlmock.NewResult(0, 1))
			mock.ExpectExec(`DELETE FROM "inspections" WHERE id IN \(\$1\)`).
				WithArgs(51).
				WillReturnResult(sqlmock.NewResult(0, 1))
			mock.ExpectCommit()

			payload := map[string]interface{}{
				"selectAllFiltered": true,
				tc.field:            7,
			}
			body, _ := json.Marshal(payload)
			ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/inspection/executions/batch-delete", token, body)
			if err := h.BatchDeleteExecutions(ctx); err != nil {
				t.Fatalf("BatchDeleteExecutions: %v", err)
			}
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
			}

			var resp struct {
				Data struct {
					DeletedCount int `json:"deletedCount"`
				} `json:"data"`
			}
			if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
				t.Fatalf("Unmarshal: %v", err)
			}
			if resp.Data.DeletedCount != 1 {
				t.Fatalf("deletedCount = %d, want 1", resp.Data.DeletedCount)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatalf("sqlmock expectations: %v", err)
			}
		})
	}
}
