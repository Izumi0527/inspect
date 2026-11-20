package monitoring_test

import (
	"encoding/json"
	"testing"
	"time"

	"gorm.io/datatypes"

	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

func TestPreprocessing_MultiplierRegexValuemapAndTrace(t *testing.T) {
	steps := []monitoring.PreprocessStep{
		{Type: "regex", Params: map[string]string{"pattern": `TEMP=([0-9]+)`}},
		{Type: "multiplier", Params: map[string]string{"factor": "0.1"}},
		{Type: "valuemap"},
	}
	valueMap := map[string]string{
		"42.5": "42.5°C (正常)",
	}

	trace, err := monitoring.ApplyPreprocessing("SNMP_OK TEMP=425 C", nil, steps, valueMap)
	if err != nil {
		t.Fatalf("ApplyPreprocessing failed: %v", err)
	}
	if len(trace.Steps) != 3 {
		t.Fatalf("steps len = %d, want 3", len(trace.Steps))
	}
	if trace.Steps[0].Output != "425" {
		t.Fatalf("step 0 output = %q, want 425", trace.Steps[0].Output)
	}
	if trace.FinalValue != "42.5" {
		t.Fatalf("final value = %q, want 42.5", trace.FinalValue)
	}
	if trace.NumericValue == nil || *trace.NumericValue != 42.5 {
		t.Fatalf("numeric value = %v, want 42.5", trace.NumericValue)
	}
	if trace.DisplayText != "42.5°C (正常)" {
		t.Fatalf("display text = %q, want 42.5°C (正常)", trace.DisplayText)
	}
}

func TestPreprocessing_ChangePerSecAndCounterRollover(t *testing.T) {
	t0 := time.Date(2026, 11, 20, 12, 0, 0, 0, time.UTC)
	t1 := t0.Add(10 * time.Second)

	// 1. 正常增量
	trace, err := monitoring.ApplyPreprocessing(
		"2000",
		&monitoring.PrevSample{Value: 1000, CollectedAt: t0, CurrentAt: t1},
		[]monitoring.PreprocessStep{{Type: "change_per_sec"}},
		nil,
	)
	if err != nil {
		t.Fatalf("normal change_per_sec failed: %v", err)
	}
	if trace.NumericValue == nil || *trace.NumericValue != 100 {
		t.Fatalf("rate = %v, want 100", trace.NumericValue)
	}

	// 2. 32 位计数器回绕保护
	trace32, err := monitoring.ApplyPreprocessing(
		"100",
		&monitoring.PrevSample{Value: 4294967200, CollectedAt: t0, CurrentAt: t1},
		[]monitoring.PreprocessStep{{Type: "change_per_sec", Params: map[string]string{"bits": "32"}}},
		nil,
	)
	if err != nil {
		t.Fatalf("32-bit rollover failed: %v", err)
	}
	// (4294967296 - 4294967200 + 100) / 10 = 196 / 10 = 19.6
	if trace32.NumericValue == nil || *trace32.NumericValue != 19.6 {
		t.Fatalf("32-bit rollover rate = %v, want 19.6", trace32.NumericValue)
	}

	// 3. dt <= 0 保护
	_, err = monitoring.ApplyPreprocessing(
		"2000",
		&monitoring.PrevSample{Value: 1000, CollectedAt: t0, CurrentAt: t0},
		[]monitoring.PreprocessStep{{Type: "change_per_sec"}},
		nil,
	)
	if err == nil {
		t.Fatalf("expected error on dt <= 0")
	}
}

func TestPreprocessing_RejectsMoreThanEightSteps(t *testing.T) {
	steps := make([]monitoring.PreprocessStep, 9)
	for i := range steps {
		steps[i] = monitoring.PreprocessStep{Type: "multiplier", Params: map[string]string{"factor": "1"}}
	}
	if _, err := monitoring.ApplyPreprocessing("10", nil, steps, nil); err == nil {
		t.Fatalf("expected error when preprocessing steps > 8")
	}
}

func TestLLDMatcher_PresetIgnoreVirtualAndRegex(t *testing.T) {
	flagsRaw, _ := json.Marshal(monitoring.LLDPresetFlags{IgnoreVirtual: true})
	rule := monitoring.MonitorLLDRule{
		PresetFlagsJSON: datatypes.JSON(flagsRaw),
		IncludeRegex:    `^(GigabitEthernet|XGigabitEthernet|GE)`,
		ExcludeRegex:    `0/0/24$`,
	}

	matcher, err := monitoring.CompileLLDMatcher(rule)
	if err != nil {
		t.Fatalf("CompileLLDMatcher failed: %v", err)
	}

	cases := []struct {
		name string
		want bool
	}{
		{"Null0", false},
		{"LoopBack0", false},
		{"Vlanif100", false},
		{"Tunnel0/0/1", false},
		{"GigabitEthernet0/0/1", true},
		{"XGigabitEthernet0/0/2", true},
		{"GigabitEthernet0/0/24", false},
	}

	for _, tc := range cases {
		if got := matcher.Match(tc.name); got != tc.want {
			t.Errorf("Match(%q) = %v, want %v", tc.name, got, tc.want)
		}
	}
}
