package alerts_test

import (
	"reflect"
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/alerts"
)

func TestNormalizeCategoryFilters(t *testing.T) {
	input := []string{
		" Security ",
		"performance",
		"hardware",
		"security",
		"OTHER",
		"",
	}

	got := alerts.NormalizeCategoryFilters(input)
	want := []string{"security", "performance", "hardware", "other"}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("NormalizeCategoryFilters() = %v, want %v", got, want)
	}
}

func TestNormalizeCategoryFilters_Empty(t *testing.T) {
	got := alerts.NormalizeCategoryFilters([]string{"", "   "})
	if len(got) != 0 {
		t.Fatalf("NormalizeCategoryFilters() expected empty result, got %v", got)
	}
}
