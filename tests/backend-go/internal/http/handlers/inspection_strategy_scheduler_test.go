package handlers_test

import (
	"context"
	"testing"
	_ "unsafe"
	"time"

	"github.com/DATA-DOG/go-sqlmock"

	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	_ "github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"gorm.io/gorm"
)

//go:linkname claimDueStrategy github.com/your-org/inspect-system/backend-go/internal/http/handlers.claimDueStrategy
func claimDueStrategy(ctx context.Context, db *gorm.DB, strategy inspection.Strategy, now time.Time) (bool, *time.Time, error)

func TestStrategyScheduler_ClaimDueStrategy_ShouldBeIdempotent(t *testing.T) {
	db, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	now := time.Date(2026, 3, 12, 1, 0, 0, 0, time.UTC)
	cronText := "0 2 * * *"
	strategy := inspection.Strategy{
		ID:      1,
		Type:    inspection.StrategyScheduled,
		Cron:    &cronText,
		Enabled: true,
	}

	mock.ExpectExec(`UPDATE "inspection_strategies" SET .*`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`UPDATE "inspection_strategies" SET .*`).
		WillReturnResult(sqlmock.NewResult(0, 0))

	claimed, next, err := claimDueStrategy(context.Background(), db, strategy, now)
	if err != nil {
		t.Fatalf("claimDueStrategy: %v", err)
	}
	if !claimed {
		t.Fatalf("claimed = false, want true")
	}
	wantNext := time.Date(2026, 3, 12, 2, 0, 0, 0, time.UTC)
	if next == nil || !next.Equal(wantNext) {
		if next == nil {
			t.Fatalf("next = nil, want %s", wantNext.Format(time.RFC3339))
		}
		t.Fatalf("next = %s, want %s", next.Format(time.RFC3339), wantNext.Format(time.RFC3339))
	}

	claimed2, next2, err := claimDueStrategy(context.Background(), db, strategy, now)
	if err != nil {
		t.Fatalf("claimDueStrategy(2nd): %v", err)
	}
	if claimed2 {
		t.Fatalf("claimed(2nd) = true, want false")
	}
	if next2 != nil {
		t.Fatalf("next(2nd) = %s, want nil", next2.Format(time.RFC3339))
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations: %v", err)
	}
}

