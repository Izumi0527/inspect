package inspection_test

import (
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/inspection"
)

func TestNormalizeCronExpression_QuartzToFiveFields(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{input: "0 0 2 * * ?", want: "0 2 * * *"},
		{input: "0 */30 * * * ?", want: "*/30 * * * *"},
		{input: "0 0 2 ? * MON", want: "0 2 * * MON"},
		{input: "0 0 2 1 * ?", want: "0 2 1 * *"},
	}

	for _, tc := range cases {
		got, err := inspection.NormalizeCronExpression(tc.input)
		if err != nil {
			t.Fatalf("NormalizeCronExpression(%q): %v", tc.input, err)
		}
		if got != tc.want {
			t.Fatalf("NormalizeCronExpression(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

