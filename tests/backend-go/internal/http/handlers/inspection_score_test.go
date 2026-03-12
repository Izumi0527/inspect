package handlers_test

import (
	"testing"
	_ "unsafe"

	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	_ "github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

//go:linkname buildExecutionResponse github.com/your-org/inspect-system/backend-go/internal/http/handlers.buildExecutionResponse
func buildExecutionResponse(item inspection.Inspection, strategyName string) map[string]interface{}

func TestComputeScore_ShouldIgnoreSkipped(t *testing.T) {
	item := inspection.Inspection{
		TotalChecks:   4,
		PassedChecks:  1,
		FailedChecks:  0,
		WarningChecks: 0,
		SkippedChecks: 3,
	}

	resp := buildExecutionResponse(item, "")
	if resp == nil {
		t.Fatalf("resp is nil")
	}

	summaryRaw, ok := resp["summary"]
	if !ok {
		t.Fatalf("resp[summary] missing")
	}
	summary, ok := summaryRaw.(map[string]interface{})
	if !ok {
		t.Fatalf("resp[summary] type = %T, want map[string]interface{}", summaryRaw)
	}

	scoreRaw, ok := summary["score"]
	if !ok {
		t.Fatalf("summary[score] missing")
	}
	score, ok := scoreRaw.(int)
	if !ok {
		t.Fatalf("summary[score] type = %T, want int", scoreRaw)
	}

	if score != 100 {
		t.Fatalf("summary[score] = %d, want 100", score)
	}
}

