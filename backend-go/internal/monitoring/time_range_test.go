package monitoring

import (
	"errors"
	"testing"
	"time"
)

func TestParseCustomDateRange(t *testing.T) {
	nowLocal := time.Date(2026, 11, 15, 12, 0, 0, 0, time.Local)

	t.Run("valid multi-day range", func(t *testing.T) {
		start, end, matched, err := ParseCustomDateRange("2026-11-09..2026-11-12", nowLocal)
		if !matched || err != nil {
			t.Fatalf("expected matched=true, err=nil, got matched=%v, err=%v", matched, err)
		}
		wantStart := time.Date(2026, 11, 9, 0, 0, 0, 0, time.Local).UTC()
		wantEnd := time.Date(2026, 11, 12, 23, 59, 59, 999999999, time.Local).UTC()
		if !start.Equal(wantStart) {
			t.Fatalf("start mismatch: got %v, want %v", start, wantStart)
		}
		if !end.Equal(wantEnd) {
			t.Fatalf("end mismatch: got %v, want %v", end, wantEnd)
		}
	})

	t.Run("valid single-day range", func(t *testing.T) {
		start, end, matched, err := ParseCustomDateRange("2026-11-09..2026-11-09", nowLocal)
		if !matched || err != nil {
			t.Fatalf("expected matched=true, err=nil, got matched=%v, err=%v", matched, err)
		}
		wantStart := time.Date(2026, 11, 9, 0, 0, 0, 0, time.Local).UTC()
		wantEnd := time.Date(2026, 11, 9, 23, 59, 59, 999999999, time.Local).UTC()
		if !start.Equal(wantStart) || !end.Equal(wantEnd) {
			t.Fatalf("got (%v, %v), want (%v, %v)", start, end, wantStart, wantEnd)
		}
	})

	t.Run("end date is today truncates to now", func(t *testing.T) {
		start, end, matched, err := ParseCustomDateRange("2026-11-14..2026-11-15", nowLocal)
		if !matched || err != nil {
			t.Fatalf("expected matched=true, err=nil, got matched=%v, err=%v", matched, err)
		}
		wantStart := time.Date(2026, 11, 14, 0, 0, 0, 0, time.Local).UTC()
		wantEnd := nowLocal.UTC()
		if !start.Equal(wantStart) {
			t.Fatalf("start mismatch: got %v, want %v", start, wantStart)
		}
		if !end.Equal(wantEnd) {
			t.Fatalf("end should truncate to now: got %v, want %v", end, wantEnd)
		}
	})

	t.Run("exactly 14 days allowed", func(t *testing.T) {
		_, end, matched, err := ParseCustomDateRange("2026-11-02..2026-11-15", nowLocal)
		if !matched || err != nil {
			t.Fatalf("expected matched=true, err=nil for 14-day range, got matched=%v, err=%v", matched, err)
		}
		if !end.Equal(nowLocal.UTC()) {
			t.Fatalf("expected end truncated to now %v, got %v", nowLocal.UTC(), end)
		}
	})

	invalidCases := []struct {
		name string
		raw  string
	}{
		{name: "reversed range", raw: "2026-11-12..2026-11-09"},
		{name: "exceeds 14 days", raw: "2026-11-01..2026-11-15"},
		{name: "future range", raw: "2026-11-16..2026-11-17"},
		{name: "end date in future", raw: "2026-11-14..2026-11-16"},
		{name: "invalid calendar date", raw: "2026-02-30..2026-03-01"},
	}

	for _, tc := range invalidCases {
		t.Run(tc.name, func(t *testing.T) {
			_, _, matched, err := ParseCustomDateRange(tc.raw, nowLocal)
			if !matched {
				t.Fatalf("expected matched=true for %q", tc.raw)
			}
			if !errors.Is(err, ErrInvalidReportTimeRange) {
				t.Fatalf("expected ErrInvalidReportTimeRange for %q, got %v", tc.raw, err)
			}
		})
	}

	t.Run("preset formats are not matched as custom", func(t *testing.T) {
		for _, preset := range []string{"6h", "14d", "24h"} {
			_, _, matched, err := ParseCustomDateRange(preset, nowLocal)
			if matched || err != nil {
				t.Fatalf("preset %q should return matched=false, err=nil, got matched=%v, err=%v", preset, matched, err)
			}
		}
	})
}

func TestParseReportTimeRange(t *testing.T) {
	nowLocal := time.Date(2026, 11, 15, 12, 0, 0, 0, time.Local)

	t.Run("preset 6h", func(t *testing.T) {
		start, end, err := parseReportTimeRange("6h", nowLocal)
		if err != nil {
			t.Fatalf("unexpected err: %v", err)
		}
		if !end.Equal(nowLocal.UTC()) || !start.Equal(nowLocal.UTC().Add(-6*time.Hour)) {
			t.Fatalf("unexpected range (%v, %v)", start, end)
		}
	})

	t.Run("preset 14d", func(t *testing.T) {
		start, end, err := parseReportTimeRange("14d", nowLocal)
		if err != nil {
			t.Fatalf("unexpected err: %v", err)
		}
		if !end.Equal(nowLocal.UTC()) || !start.Equal(nowLocal.UTC().Add(-14*24*time.Hour)) {
			t.Fatalf("unexpected range (%v, %v)", start, end)
		}
	})

	t.Run("custom valid range", func(t *testing.T) {
		start, end, err := parseReportTimeRange("2026-11-09..2026-11-12", nowLocal)
		if err != nil {
			t.Fatalf("unexpected err: %v", err)
		}
		wantStart := time.Date(2026, 11, 9, 0, 0, 0, 0, time.Local).UTC()
		wantEnd := time.Date(2026, 11, 12, 23, 59, 59, 999999999, time.Local).UTC()
		if !start.Equal(wantStart) || !end.Equal(wantEnd) {
			t.Fatalf("got (%v, %v), want (%v, %v)", start, end, wantStart, wantEnd)
		}
	})

	t.Run("custom invalid range returns error", func(t *testing.T) {
		_, _, err := parseReportTimeRange("2026-11-01..2026-11-15", nowLocal)
		if !errors.Is(err, ErrInvalidReportTimeRange) {
			t.Fatalf("expected ErrInvalidReportTimeRange, got %v", err)
		}
	})
}
