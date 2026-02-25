package handlers_test

import (
	"encoding/json"
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/logs"
)

func TestBuildBatchCollectLogsResponse_ShouldIncludeCollectedAndFailedDetails(t *testing.T) {
	result := logs.BatchCollectResult{
		Collected: map[int]int{
			1: 10,
			3: 5,
		},
		Failed: map[int]string{
			2: "ssh credentials not configured",
		},
	}

	resp := handlers.BuildBatchCollectLogsResponse(result)
	if resp.CollectedCount != 15 {
		t.Fatalf("CollectedCount=%d, want 15", resp.CollectedCount)
	}
	if resp.Collected[1] != 10 {
		t.Fatalf("Collected[1]=%d, want 10", resp.Collected[1])
	}
	if resp.Failed[2] == "" {
		t.Fatalf("Failed[2] empty, want reason")
	}

	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("json.Marshal error=%v", err)
	}

	var obj map[string]any
	if err := json.Unmarshal(data, &obj); err != nil {
		t.Fatalf("json.Unmarshal error=%v", err)
	}
	if _, ok := obj["collected"]; !ok {
		t.Fatalf("json missing collected field")
	}
	if _, ok := obj["failed"]; !ok {
		t.Fatalf("json missing failed field")
	}
}

