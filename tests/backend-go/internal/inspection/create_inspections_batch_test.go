package inspection_test

import (
	"context"
	"database/sql/driver"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	"go.uber.org/zap"
)

// sameBatchIDMatcher 校验多次 INSERT 写入同一非空 batch_id。
// 首次匹配记录取值并放行，后续调用必须与之完全相等——
// "一次 CreateInspections 调用 = 一个共享批次"是执行历史聚合的核心约束。
type sameBatchIDMatcher struct {
	first *string
}

func (m sameBatchIDMatcher) Match(v driver.Value) bool {
	s, ok := v.(string)
	if !ok || s == "" {
		return false
	}
	if *m.first == "" {
		*m.first = s
		return true
	}
	return s == *m.first
}

func TestCreateInspections_ShouldShareBatchIDAcrossDevices(t *testing.T) {
	db, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(db, zap.NewNop())

	batchID := ""
	matcher := sameBatchIDMatcher{first: &batchID}

	// 列顺序与 Inspection 结构体一致（零值自增主键不参与插入；error_details 零值
	// datatypes.JSON 被内联为 NULL 不占参数位，共 23 个绑定参数）：
	// device_id, template_id, schedule_id, batch_id, name, trigger, status,
	// scheduled_at, started_at, completed_at, duration, total_checks, passed_checks,
	// failed_checks, warning_checks, skipped_checks, error_message, [error_details=NULL],
	// timeout, retry_count, max_retries, created_by, created_at, updated_at
	for _, deviceID := range []int{101, 102} {
		mock.ExpectQuery(`INSERT INTO "inspections" \("device_id","template_id","schedule_id","batch_id".*RETURNING "id"`).
			WithArgs(
				deviceID, nil, nil, matcher,
				"多设备巡检", "manual", "pending",
				nil, nil, nil, nil,
				0, 0, 0, 0, 0,
				nil, nil, nil, nil, nil,
				AnyTimeArg{}, AnyTimeArg{},
			).
			WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(deviceID))
	}

	inspections, err := svc.CreateInspections(context.Background(), inspection.CreateInspectionInput{
		Name:      "多设备巡检",
		DeviceIDs: []int{101, 102},
		Trigger:   inspection.TriggerManual,
	})
	if err != nil {
		t.Fatalf("CreateInspections: %v", err)
	}
	if len(inspections) != 2 {
		t.Fatalf("inspections length = %d, want 2", len(inspections))
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations: %v", err)
	}

	// batch_id 应为非空 UUID（36 位，含 4 个连字符）
	if len(batchID) != 36 || strings.Count(batchID, "-") != 4 {
		t.Fatalf("batch_id = %q, want 36 位 UUID 格式", batchID)
	}
}

// AnyTimeArg 匹配任意时间参数（GORM 写入的 created_at/updated_at）
type AnyTimeArg struct{}

func (AnyTimeArg) Match(v driver.Value) bool {
	_, ok := v.(time.Time)
	return ok
}
