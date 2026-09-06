package inspection_test

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	"go.uber.org/zap"
)

func TestBackfillLegacyBatchIDs_ShouldGroupAndStayIdempotent(t *testing.T) {
	db, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(db, zap.NewNop())

	// 回填语句结构：按 策略+名称+创建时间 分组取批内最小 ID，
	// 仅更新 batch_id 为空的行，赋确定性标识 'legacy-<min_id>'
	backfillRegex := `WITH legacy_groups AS[\s\S]*MIN\(id\) AS min_id, schedule_id, name, created_at[\s\S]*` +
		`GROUP BY schedule_id, name, created_at[\s\S]*` +
		`UPDATE inspections i[\s\S]*` +
		`SET batch_id = 'legacy-' \|\| lg\.min_id::text[\s\S]*` +
		`WHERE \(i\.batch_id IS NULL OR i\.batch_id = ''\)[\s\S]*` +
		`IS NOT DISTINCT FROM lg\.created_at`

	// 首次执行：3 行历史记录被回填
	mock.ExpectExec(backfillRegex).
		WillReturnResult(sqlmock.NewResult(0, 3))
	n, err := svc.BackfillLegacyBatchIDs(context.Background())
	if err != nil {
		t.Fatalf("BackfillLegacyBatchIDs: %v", err)
	}
	if n != 3 {
		t.Fatalf("backfilled rows = %d, want 3", n)
	}

	// 幂等：回填完成后再次执行，无待处理行（受影响 0 行）
	mock.ExpectExec(backfillRegex).
		WillReturnResult(sqlmock.NewResult(0, 0))
	n2, err := svc.BackfillLegacyBatchIDs(context.Background())
	if err != nil {
		t.Fatalf("BackfillLegacyBatchIDs (second run): %v", err)
	}
	if n2 != 0 {
		t.Fatalf("second run backfilled rows = %d, want 0（幂等）", n2)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations: %v", err)
	}
}
