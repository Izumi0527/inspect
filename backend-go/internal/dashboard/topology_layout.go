package dashboard

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// TopologyNodePosition 是一台设备在拓扑画布上的坐标（画布坐标系，非屏幕像素）。
type TopologyNodePosition struct {
	DeviceID int     `json:"device_id"`
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
}

// TopologyViewport 是画布视口：平移量与缩放倍数。
type TopologyViewport struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	K float64 `json:"k"`
}

// TopologyLayout 是用户保存的拓扑布局。全系统共享一份（运维团队看同一张图），随拓扑接口下发；
// 未保存过坐标的设备由前端自动布局补位。
type TopologyLayout struct {
	Positions []TopologyNodePosition `json:"positions"`
	Viewport  *TopologyViewport      `json:"viewport,omitempty"`
	UpdatedAt *time.Time             `json:"updated_at,omitempty"`
	UpdatedBy string                 `json:"updated_by,omitempty"`
}

// TopologyLayoutRecord 是布局的持久化行。scope 现固定为 global，预留按用户/按视图扩展。
type TopologyLayoutRecord struct {
	ID     int            `gorm:"column:id;primaryKey;autoIncrement"`
	Scope  string         `gorm:"column:scope;size:50;not null;unique"`
	Layout datatypes.JSON `gorm:"column:layout"`
	// UpdatedBy 存操作人用户名而不是 ID：它只用于画布上「保存于 … · 谁」的展示，不参与关联
	UpdatedBy string    `gorm:"column:updated_by;size:50"`
	CreatedAt time.Time `gorm:"column:created_at"`
	UpdatedAt time.Time `gorm:"column:updated_at"`
}

func (TopologyLayoutRecord) TableName() string {
	return "dashboard_topology_layouts"
}

const (
	topologyLayoutScopeGlobal = "global"

	// MaxTopologyLayoutPositions 是一次保存允许的最大坐标条数，防止异常客户端灌入超大 JSON。
	MaxTopologyLayoutPositions = 5000

	minTopologyZoom = 0.1
	maxTopologyZoom = 4.0
)

// NormalizeTopologyLayout 校验并清洗待保存的布局：坐标必须是有限数、设备 ID 为正且去重
// （同一设备出现多次以最后一条为准）、按设备 ID 升序；缩放夹到 [0.1, 4]，缩放 ≤ 0 视为未提供视口。
func NormalizeTopologyLayout(in TopologyLayout) (TopologyLayout, error) {
	if len(in.Positions) > MaxTopologyLayoutPositions {
		return TopologyLayout{}, fmt.Errorf("too many positions: %d > %d", len(in.Positions), MaxTopologyLayoutPositions)
	}

	byID := make(map[int]TopologyNodePosition, len(in.Positions))
	for _, p := range in.Positions {
		if p.DeviceID <= 0 {
			return TopologyLayout{}, fmt.Errorf("invalid device id: %d", p.DeviceID)
		}
		if !isFinite(p.X) || !isFinite(p.Y) {
			return TopologyLayout{}, fmt.Errorf("position of device %d is not finite", p.DeviceID)
		}
		byID[p.DeviceID] = p
	}
	positions := make([]TopologyNodePosition, 0, len(byID))
	for _, p := range byID {
		positions = append(positions, p)
	}
	sort.Slice(positions, func(i, j int) bool { return positions[i].DeviceID < positions[j].DeviceID })

	out := TopologyLayout{Positions: positions}
	if in.Viewport != nil && in.Viewport.K > 0 {
		if !isFinite(in.Viewport.X) || !isFinite(in.Viewport.Y) || !isFinite(in.Viewport.K) {
			return TopologyLayout{}, errors.New("viewport is not finite")
		}
		out.Viewport = &TopologyViewport{
			X: in.Viewport.X,
			Y: in.Viewport.Y,
			K: math.Min(maxTopologyZoom, math.Max(minTopologyZoom, in.Viewport.K)),
		}
	}
	return out, nil
}

func isFinite(v float64) bool {
	return !math.IsNaN(v) && !math.IsInf(v, 0)
}

// getTopologyLayout 读取全局布局；没有保存过返回 nil, nil。
func (s *Service) getTopologyLayout(ctx context.Context) (*TopologyLayout, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	var record TopologyLayoutRecord
	err := s.db.WithContext(ctx).Where("scope = ?", topologyLayoutScopeGlobal).First(&record).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var layout TopologyLayout
	if len(record.Layout) > 0 {
		if err := json.Unmarshal(record.Layout, &layout); err != nil {
			return nil, fmt.Errorf("decode topology layout: %w", err)
		}
	}
	if layout.Positions == nil {
		layout.Positions = []TopologyNodePosition{}
	}
	updatedAt := record.UpdatedAt
	layout.UpdatedAt = &updatedAt
	layout.UpdatedBy = record.UpdatedBy
	return &layout, nil
}

// SaveTopologyLayout 校验后整份覆盖全局布局，返回落库后的布局（含更新时间与操作人用户名）。
func (s *Service) SaveTopologyLayout(ctx context.Context, in TopologyLayout, updatedBy string) (TopologyLayout, error) {
	if s == nil || s.db == nil {
		return TopologyLayout{}, fmt.Errorf("database not initialized")
	}
	layout, err := NormalizeTopologyLayout(in)
	if err != nil {
		return TopologyLayout{}, err
	}
	payload, err := json.Marshal(TopologyLayout{Positions: layout.Positions, Viewport: layout.Viewport})
	if err != nil {
		return TopologyLayout{}, err
	}
	now := time.Now().UTC()
	record := TopologyLayoutRecord{
		Scope:     topologyLayoutScopeGlobal,
		Layout:    datatypes.JSON(payload),
		UpdatedBy: updatedBy,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "scope"}},
		DoUpdates: clause.AssignmentColumns([]string{"layout", "updated_by", "updated_at"}),
	}).Create(&record).Error; err != nil {
		return TopologyLayout{}, err
	}
	layout.UpdatedAt = &now
	layout.UpdatedBy = updatedBy
	return layout, nil
}
