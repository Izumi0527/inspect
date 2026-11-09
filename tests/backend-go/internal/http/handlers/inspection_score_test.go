package handlers_test

import (
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/inspection"
)

// 评分 = 通过 /（通过 + 失败 + 告警），跳过项不计入分母：1 项通过、3 项跳过应得 100 分，而不是 25 分。
// 执行历史每一行由 buildBatchExecutionResponse 构建（go:linkname 声明见 inspection_batch_aggregate_test.go）；
// 原先测的是单设备版 buildExecutionResponse，它已无调用方并被删除。
func TestComputeScore_ShouldIgnoreSkipped(t *testing.T) {
	item := inspection.Inspection{
		TotalChecks:   4,
		PassedChecks:  1,
		FailedChecks:  0,
		WarningChecks: 0,
		SkippedChecks: 3,
	}

	resp := buildBatchExecutionResponse([]inspection.Inspection{item}, nil, nil)
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
