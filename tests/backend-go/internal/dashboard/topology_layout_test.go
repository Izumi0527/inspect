package dashboard_test

import (
	"math"
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/dashboard"
)

// NormalizeTopologyLayout 是保存前的唯一入口：坐标必须有限、设备 ID 去重（后者覆盖前者）、
// 缩放限定在 [0.1, 4]；输入超过上限直接拒绝。
func TestNormalizeTopologyLayout_DedupesAndClampsViewport(t *testing.T) {
	got, err := dashboard.NormalizeTopologyLayout(dashboard.TopologyLayout{
		Positions: []dashboard.TopologyNodePosition{
			{DeviceID: 2, X: 10, Y: 20},
			{DeviceID: 1, X: 1, Y: 2},
			{DeviceID: 2, X: 30, Y: 40},
		},
		Viewport: &dashboard.TopologyViewport{X: 5, Y: 6, K: 9},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got.Positions) != 2 {
		t.Fatalf("positions = %+v, want 2 entries", got.Positions)
	}
	if got.Positions[0].DeviceID != 1 || got.Positions[1].DeviceID != 2 {
		t.Fatalf("positions 应按设备 ID 升序: %+v", got.Positions)
	}
	if got.Positions[1].X != 30 || got.Positions[1].Y != 40 {
		t.Fatalf("重复设备应以后者为准: %+v", got.Positions[1])
	}
	if got.Viewport == nil || got.Viewport.K != 4 {
		t.Fatalf("缩放应被夹到 4: %+v", got.Viewport)
	}
}

func TestNormalizeTopologyLayout_RejectsNonFiniteAndInvalidIDs(t *testing.T) {
	cases := map[string]dashboard.TopologyLayout{
		"NaN 坐标":   {Positions: []dashboard.TopologyNodePosition{{DeviceID: 1, X: math.NaN(), Y: 0}}},
		"Inf 坐标":   {Positions: []dashboard.TopologyNodePosition{{DeviceID: 1, X: 0, Y: math.Inf(1)}}},
		"非法设备 ID":  {Positions: []dashboard.TopologyNodePosition{{DeviceID: 0, X: 0, Y: 0}}},
		"视口平移非有限值": {Viewport: &dashboard.TopologyViewport{X: math.NaN(), Y: 0, K: 1}},
	}
	for name, input := range cases {
		if _, err := dashboard.NormalizeTopologyLayout(input); err == nil {
			t.Errorf("%s: 应返回错误", name)
		}
	}
}

func TestNormalizeTopologyLayout_RejectsTooManyPositions(t *testing.T) {
	positions := make([]dashboard.TopologyNodePosition, dashboard.MaxTopologyLayoutPositions+1)
	for i := range positions {
		positions[i] = dashboard.TopologyNodePosition{DeviceID: i + 1}
	}
	if _, err := dashboard.NormalizeTopologyLayout(dashboard.TopologyLayout{Positions: positions}); err == nil {
		t.Fatal("超过上限应返回错误")
	}
}

// 视口缺失或缩放为 0 时不猜默认值：视口保持 nil，让前端自动适应画布。
func TestNormalizeTopologyLayout_DropsZeroScaleViewport(t *testing.T) {
	got, err := dashboard.NormalizeTopologyLayout(dashboard.TopologyLayout{
		Viewport: &dashboard.TopologyViewport{X: 1, Y: 1, K: 0},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Viewport != nil {
		t.Fatalf("缩放为 0 的视口应被丢弃: %+v", got.Viewport)
	}
	if got.Positions == nil || len(got.Positions) != 0 {
		t.Fatalf("positions 应为空切片而不是 nil（JSON 输出 []）: %#v", got.Positions)
	}
}
