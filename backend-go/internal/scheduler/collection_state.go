package scheduler

import (
	"context"
	"errors"
	"sort"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

func (s *Service) resolveEngineHealthTracker() *monitoring.EngineHealthTracker {
	if s == nil {
		return nil
	}
	if s.metricsWriter != nil {
		if tracker := s.metricsWriter.EngineHealthTracker(); tracker != nil {
			return tracker
		}
	}
	return s.engineHealth
}

// SetEngineHealthTracker 允许注入共享的采集引擎健康追踪器。
func (s *Service) SetEngineHealthTracker(tracker *monitoring.EngineHealthTracker) {
	if s == nil {
		return
	}
	s.engineHealth = tracker
}

// EngineHealth 返回采集引擎最近一轮的线程安全健康快照。
func (s *Service) EngineHealth() monitoring.EngineHealthSnapshot {
	if tracker := s.resolveEngineHealthTracker(); tracker != nil {
		return tracker.Snapshot()
	}
	return monitoring.NewEngineHealthTracker().Snapshot()
}

type collectionStateStore struct {
	mu     sync.Mutex
	states map[int]monitoring.DeviceCollectionState
}

func newCollectionStateStore(initial map[int]monitoring.DeviceCollectionState) *collectionStateStore {
	copied := make(map[int]monitoring.DeviceCollectionState, len(initial))
	for id, st := range initial {
		copied[id] = st
	}
	return &collectionStateStore{states: copied}
}

func (st *collectionStateStore) get(deviceID int) (monitoring.DeviceCollectionState, bool) {
	st.mu.Lock()
	defer st.mu.Unlock()
	val, ok := st.states[deviceID]
	return val, ok
}

func (st *collectionStateStore) set(state monitoring.DeviceCollectionState) {
	st.mu.Lock()
	st.states[state.DeviceID] = state
	st.mu.Unlock()
}

func (st *collectionStateStore) snapshotMap() map[int]monitoring.DeviceCollectionState {
	st.mu.Lock()
	defer st.mu.Unlock()
	out := make(map[int]monitoring.DeviceCollectionState, len(st.states))
	for k, v := range st.states {
		out[k] = v
	}
	return out
}

func (s *Service) loadCollectionStates(ctx context.Context, deviceIDs []int) map[int]monitoring.DeviceCollectionState {
	result := make(map[int]monitoring.DeviceCollectionState)
	if s == nil || s.db == nil || len(deviceIDs) == 0 {
		return result
	}
	var rows []monitoring.DeviceCollectionState
	if err := s.db.WithContext(ctx).
		Where("device_id IN ?", deviceIDs).
		Find(&rows).Error; err != nil {
		if s.logger != nil {
			s.logger.Debug("load device collection states skipped", zap.Error(err))
		}
		return result
	}
	for _, row := range rows {
		result[row.DeviceID] = row
	}
	return result
}

func (s *Service) upsertCollectionState(ctx context.Context, state monitoring.DeviceCollectionState) {
	if s == nil || s.db == nil || state.DeviceID <= 0 {
		return
	}
	const upsertSQL = `
INSERT INTO device_collection_states (
    device_id, last_error_code, last_error_message, consecutive_failures,
    backoff_until, last_success_at, last_duration_ms, updated_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (device_id) DO UPDATE SET
    last_error_code = EXCLUDED.last_error_code,
    last_error_message = EXCLUDED.last_error_message,
    consecutive_failures = EXCLUDED.consecutive_failures,
    backoff_until = EXCLUDED.backoff_until,
    last_success_at = COALESCE(EXCLUDED.last_success_at, device_collection_states.last_success_at),
    last_duration_ms = EXCLUDED.last_duration_ms,
    updated_at = EXCLUDED.updated_at`

	if err := s.db.WithContext(ctx).Exec(
		upsertSQL,
		state.DeviceID,
		state.LastErrorCode,
		state.LastErrorMessage,
		state.ConsecutiveFailures,
		state.BackoffUntil,
		state.LastSuccessAt,
		state.LastDurationMS,
		state.UpdatedAt,
	).Error; err != nil && s.logger != nil {
		s.logger.Debug("upsert device collection state skipped",
			zap.Int("device_id", state.DeviceID),
			zap.Error(err))
	}
}

func (s *Service) recordCollectionSuccess(
	ctx context.Context,
	store *collectionStateStore,
	deviceID int,
	durationMS int,
	now time.Time,
) {
	ts := now.UTC()
	state := monitoring.DeviceCollectionState{
		DeviceID:            deviceID,
		LastErrorCode:       monitoring.CollectionErrorNone,
		LastErrorMessage:    "",
		ConsecutiveFailures: 0,
		BackoffUntil:        nil,
		LastSuccessAt:       &ts,
		LastDurationMS:      durationMS,
		UpdatedAt:           ts,
	}
	if store != nil {
		store.set(state)
	}
	s.upsertCollectionState(ctx, state)
}

func (s *Service) recordCollectionFailure(
	ctx context.Context,
	store *collectionStateStore,
	deviceID int,
	err error,
	stage string,
	durationMS int,
	now time.Time,
) {
	ts := now.UTC()
	code, safeMsg := monitoring.ClassifyCollectionError(err, stage)

	prevFailures := 0
	var lastSuccess *time.Time
	if store != nil {
		if prev, ok := store.get(deviceID); ok {
			prevFailures = prev.ConsecutiveFailures
			lastSuccess = prev.LastSuccessAt
		}
	}
	failures := prevFailures + 1

	var backoffUntil *time.Time
	if backoff := monitoring.BackoffDurationForFailures(failures); backoff > 0 {
		until := ts.Add(backoff)
		backoffUntil = &until
	}

	state := monitoring.DeviceCollectionState{
		DeviceID:            deviceID,
		LastErrorCode:       code,
		LastErrorMessage:    safeMsg,
		ConsecutiveFailures: failures,
		BackoffUntil:        backoffUntil,
		LastSuccessAt:       lastSuccess,
		LastDurationMS:      durationMS,
		UpdatedAt:           ts,
	}
	if store != nil {
		store.set(state)
	}
	s.upsertCollectionState(ctx, state)
}

func (s *Service) clearDeviceBackoff(
	ctx context.Context,
	store *collectionStateStore,
	deviceID int,
	now time.Time,
) {
	ts := now.UTC()
	var lastSuccess *time.Time
	if store != nil {
		if prev, ok := store.get(deviceID); ok {
			lastSuccess = prev.LastSuccessAt
		}
	}
	state := monitoring.DeviceCollectionState{
		DeviceID:            deviceID,
		LastErrorCode:       monitoring.CollectionErrorNone,
		LastErrorMessage:    "",
		ConsecutiveFailures: 0,
		BackoffUntil:        nil,
		LastSuccessAt:       lastSuccess,
		LastDurationMS:      0,
		UpdatedAt:           ts,
	}
	if store != nil {
		store.set(state)
	}
	s.upsertCollectionState(ctx, state)
}

// partitionDevicesByBackoff 在每轮采集前检查退避状态：
// 仍在退避期的设备先执行轻量 ICMP 探活，若 ICMP 恢复则立即解除退避纳入本轮完整采集，
// 否则跳过重型 SNMP 探测与采集，防止离线设备拖垮全局采集池。
func (s *Service) partitionDevicesByBackoff(
	ctx context.Context,
	devicesList []devices.Device,
	store *collectionStateStore,
	now time.Time,
) (active []devices.Device, skipped []devices.Device, backoffProbeResults map[int]devices.ProbeResult) {
	active = make([]devices.Device, 0, len(devicesList))
	skipped = make([]devices.Device, 0)
	backoffProbeResults = make(map[int]devices.ProbeResult)

	for _, device := range devicesList {
		state, exists := store.get(device.ID)
		if !exists || state.BackoffUntil == nil || !state.BackoffUntil.After(now) {
			active = append(active, device)
			continue
		}

		if s.probeService != nil {
			icmpOK, rtt, icmpErr := s.probeService.ProbeICMP(ctx, device.IPAddress)
			if icmpOK {
				s.clearDeviceBackoff(ctx, store, device.ID, now)
				active = append(active, device)
				continue
			}
			backoffProbeResults[device.ID] = devices.ProbeResult{
				DeviceID:         device.ID,
				IPAddress:        device.IPAddress,
				IcmpReachable:    false,
				IcmpResponseTime: rtt,
				IcmpError:        icmpErr,
				SnmpReachable:    false,
				ProbedAt:         now,
			}
		}
		skipped = append(skipped, device)
	}
	return active, skipped, backoffProbeResults
}

func (s *Service) writeProbeMetricsBestEffort(ctx context.Context, result devices.ProbeResult) {
	if s == nil || s.metricsWriter == nil || result.DeviceID <= 0 {
		return
	}
	loss := 100.0
	if result.IcmpReachable {
		loss = 0.0
	}
	snmpReachable := 0.0
	if result.SnmpReachable {
		snmpReachable = 1.0
	}

	metricsMap := map[string]monitoring.MetricValue{
		"ping_loss_pct":  {Value: &loss, Unit: strPtr("%")},
		"snmp_reachable": {Value: &snmpReachable, Unit: strPtr("state")},
	}
	if result.IcmpResponseTime != nil {
		rtt := *result.IcmpResponseTime
		metricsMap["ping_rtt_ms"] = monitoring.MetricValue{Value: &rtt, Unit: strPtr("ms")}
	}
	ts := result.ProbedAt
	if ts.IsZero() {
		ts = time.Now().UTC()
	}

	_, err := s.metricsWriter.WriteDeviceMetrics(ctx, monitoring.DeviceMetricsRequest{
		DeviceID:    result.DeviceID,
		CollectedAt: &monitoring.FlexibleTime{Time: ts.UTC()},
		Metrics:     metricsMap,
	})
	if err != nil && !errors.Is(err, monitoring.ErrNoMetrics) && !errors.Is(err, monitoring.ErrDeviceNotFound) && s.logger != nil {
		s.logger.Debug("write probe metrics skipped",
			zap.Int("device_id", result.DeviceID),
			zap.Error(err))
	}
}

func buildBackoffSummaries(
	devicesList []devices.Device,
	states map[int]monitoring.DeviceCollectionState,
	now time.Time,
) []monitoring.BackoffDeviceSummary {
	names := make(map[int]string, len(devicesList))
	for _, d := range devicesList {
		names[d.ID] = d.Name
	}

	list := make([]monitoring.BackoffDeviceSummary, 0)
	for _, st := range states {
		if st.BackoffUntil == nil || !st.BackoffUntil.After(now) {
			continue
		}
		until := st.BackoffUntil.UTC()
		list = append(list, monitoring.BackoffDeviceSummary{
			DeviceID:            st.DeviceID,
			DeviceName:          names[st.DeviceID],
			LastErrorCode:       st.LastErrorCode,
			LastErrorMessage:    monitoring.SafeCollectionErrorMessage(st.LastErrorCode),
			ConsecutiveFailures: st.ConsecutiveFailures,
			BackoffUntil:        &until,
		})
	}
	sort.Slice(list, func(i, j int) bool {
		return list[i].DeviceID < list[j].DeviceID
	})
	return list
}

func probeErrorFromResult(result devices.ProbeResult) error {
	if result.SnmpError != nil && strings.TrimSpace(*result.SnmpError) != "" {
		return errors.New(*result.SnmpError)
	}
	if result.IcmpError != nil && strings.TrimSpace(*result.IcmpError) != "" {
		return errors.New(*result.IcmpError)
	}
	return errors.New("probe unreachable")
}

func strPtr(v string) *string {
	return &v
}

// loadDeviceIDs 提取设备列表的 ID 切片（去重保持顺序）。
func collectDeviceIDs(devicesList []devices.Device) []int {
	ids := make([]int, 0, len(devicesList))
	seen := make(map[int]struct{}, len(devicesList))
	for _, d := range devicesList {
		if d.ID <= 0 {
			continue
		}
		if _, ok := seen[d.ID]; ok {
			continue
		}
		seen[d.ID] = struct{}{}
		ids = append(ids, d.ID)
	}
	return ids
}

var _ = gorm.ErrRecordNotFound
