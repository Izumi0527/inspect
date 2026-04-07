package inspection_test

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	"go.uber.org/zap"
)

func TestListInspections_ShouldTreatEndDateAsInclusiveWholeDay(t *testing.T) {
	db, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(db, zap.NewNop())
	start := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 4, 6, 0, 0, 0, 0, time.UTC)
	endExclusive := end.Add(24 * time.Hour)

	mock.ExpectQuery(`SELECT count\(\*\) FROM "inspections".*created_at >= \$1.*created_at < \$2`).
		WithArgs(start, endExclusive).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`SELECT .* FROM "inspections".*created_at >= \$1.*created_at < \$2.*ORDER BY created_at`).
		WithArgs(start, endExclusive, 20).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "device_id", "template_id", "schedule_id", "name", "trigger", "status", "created_at", "updated_at",
		}))

	_, _, err := svc.ListInspections(context.Background(), inspection.InspectionFilter{
		StartDate: &start,
		EndDate:   &end,
		Limit:     20,
	})
	if err != nil {
		t.Fatalf("ListInspections: %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations: %v", err)
	}
}
