package inspection_test

import (
	"testing"
	"time"

	"github.com/your-org/inspect-system/backend-go/internal/inspection"
)

func TestComputeNextRunTime_DailyAt2AM(t *testing.T) {
	from := time.Date(2026, 3, 12, 1, 0, 0, 0, time.UTC)
	got, err := inspection.ComputeNextRunTime("0 2 * * *", from)
	if err != nil {
		t.Fatalf("ComputeNextRunTime: %v", err)
	}
	want := time.Date(2026, 3, 12, 2, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Fatalf("next = %s, want %s", got.Format(time.RFC3339), want.Format(time.RFC3339))
	}
}

func TestComputeNextRunTime_ShouldMoveToNextDayWhenPast(t *testing.T) {
	from := time.Date(2026, 3, 12, 3, 0, 0, 0, time.UTC)
	got, err := inspection.ComputeNextRunTime("0 2 * * *", from)
	if err != nil {
		t.Fatalf("ComputeNextRunTime: %v", err)
	}
	want := time.Date(2026, 3, 13, 2, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Fatalf("next = %s, want %s", got.Format(time.RFC3339), want.Format(time.RFC3339))
	}
}

