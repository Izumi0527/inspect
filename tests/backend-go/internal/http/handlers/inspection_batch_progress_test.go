package handlers_test

import (
	"testing"
	_ "unsafe"

	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
)

// aggregateProgressEvents 是批次进度折算的未导出纯函数，经 go:linkname 桥接做白盒测试
//（沿用本仓库约定）。
//
//go:linkname aggregateProgressEvents github.com/your-org/inspect-system/backend-go/internal/http/handlers.aggregateProgressEvents
func aggregateProgressEvents(statuses []string, progresses []int) (string, int)

// 评审 H1 口径：设备终态 ≠ 批次终态。
// 只要还有设备未到终态，批次必须一律广播 running（进度 = Σ(终态记 100，否则自身进度)/N），
// 否则完成 toast 会每台各弹一次、进度随单台完成来回跳变；
// 最后一台落终态时才广播聚合终态（复用批次状态优先级）。

func TestAggregateProgressEvents_FirstDeviceCompletedKeepsBatchRunning(t *testing.T) {
	status, progress := aggregateProgressEvents([]string{"completed", "running"}, []int{100, 0})
	if status != inspection.StatusRunning {
		t.Fatalf("status = %q, want %q：首台完成时批次不得提前广播终态", status, inspection.StatusRunning)
	}
	if progress != 50 {
		t.Fatalf("progress = %d, want 50", progress)
	}
}

func TestAggregateProgressEvents_AllTerminalYieldsAggregatedStatus(t *testing.T) {
	cases := []struct {
		name     string
		statuses []string
		want     string
	}{
		{"部分失败其余完成按批次口径判已完成", []string{"completed", "failed"}, inspection.StatusCompleted},
		{"超时计入失败", []string{"failed", "timeout"}, inspection.StatusFailed},
		{"有完成不放大取消", []string{"cancelled", "completed"}, inspection.StatusCompleted},
		{"全部完成", []string{"completed", "completed"}, inspection.StatusCompleted},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			status, progress := aggregateProgressEvents(tc.statuses, make([]int, len(tc.statuses)))
			if status != tc.want {
				t.Fatalf("status = %q, want %q (statuses=%v)", status, tc.want, tc.statuses)
			}
			if progress != 100 {
				t.Fatalf("progress = %d, want 100：批次终态时进度必须收口", progress)
			}
		})
	}
}

func TestAggregateProgressEvents_ProgressIsAverageWithTerminalAs100(t *testing.T) {
	status, progress := aggregateProgressEvents([]string{"running", "running"}, []int{30, 60})
	if status != inspection.StatusRunning {
		t.Fatalf("status = %q, want %q", status, inspection.StatusRunning)
	}
	if progress != 45 {
		t.Fatalf("progress = %d, want 45", progress)
	}

	// 失败设备按 100 计：终态设备的进度不再依赖其上报值
	status, progress = aggregateProgressEvents([]string{"failed", "running"}, []int{30, 60})
	if status != inspection.StatusRunning {
		t.Fatalf("status = %q, want %q", status, inspection.StatusRunning)
	}
	if progress != 80 {
		t.Fatalf("progress = %d, want 80（失败设备按 100 计）", progress)
	}
}

func TestAggregateProgressEvents_UnreportedDeviceCountsAsZero(t *testing.T) {
	status, progress := aggregateProgressEvents([]string{"running", ""}, []int{50, 0})
	if status != inspection.StatusRunning {
		t.Fatalf("status = %q, want %q", status, inspection.StatusRunning)
	}
	if progress != 25 {
		t.Fatalf("progress = %d, want 25（未上报设备按 0 计）", progress)
	}
}

func TestBatchProgressTracker_UpdateStoresPerDeviceState(t *testing.T) {
	tracker := handlers.NewBatchProgressTracker(2)
	if tracker == nil {
		t.Fatal("tracker 不得为 nil")
	}

	status, progress := tracker.Update(0, "completed", 100)
	if status != inspection.StatusRunning || progress != 50 {
		t.Fatalf("首台完成: status=%q progress=%d, want running/50", status, progress)
	}
	status, progress = tracker.Update(1, "completed", 100)
	if status != inspection.StatusCompleted || progress != 100 {
		t.Fatalf("全部完成: status=%q progress=%d, want completed/100", status, progress)
	}

	// nil tracker 的防御路径：原样透传
	var nilTracker *handlers.BatchProgressTracker
	status, progress = nilTracker.Update(0, "running", 30)
	if status != inspection.StatusRunning || progress != 30 {
		t.Fatalf("nil tracker: status=%q progress=%d, want running/30", status, progress)
	}
}
