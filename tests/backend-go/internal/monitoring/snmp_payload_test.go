package monitoring_test

import (
	"context"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"net"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
	_ "unsafe"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
	"github.com/your-org/inspect-system/backend-go/internal/scheduler"
)

//go:linkname executeDeviceInspection github.com/your-org/inspect-system/backend-go/internal/scheduler.(*Service).executeDeviceInspection
func executeDeviceInspection(s *scheduler.Service, ctx context.Context, task scheduler.ScheduledTask) (map[string]interface{}, error)

func TestBuildSNMPDeviceMetricsRequest_ShouldIncludeCatalogDerivedMetricsAndTags(t *testing.T) {
	cpu := 18.5
	mem := 61.2
	collectedAt := time.Date(2026, 4, 29, 1, 12, 0, 0, time.UTC)
	inRate := 1024.0

	request := monitoring.BuildSNMPDeviceMetricsRequest(7, &devices.SNMPMetrics{
		CPUUsage:    &cpu,
		MemoryUsage: &mem,
		BGPPeers: []devices.BGPNeighborMetrics{
			{Index: "1", StateLabel: "established"},
			{Index: "2", StateLabel: "active"},
		},
		OpticalTransceivers: []devices.OpticalTransceiverMetrics{
			{Index: "10", RxPower: floatPtr(1.5), RxPowerUnit: "uW"},
		},
		Interfaces: []devices.InterfaceMetrics{
			{
				Name:   "if1",
				InRate: &inRate,
			},
		},
		CollectedAt: collectedAt,
	})

	if request.DeviceID != 7 {
		t.Fatalf("device_id=%d, want 7", request.DeviceID)
	}
	if request.CollectedAt == nil || !request.CollectedAt.Time.Equal(collectedAt) {
		t.Fatalf("collected_at=%v, want %v", request.CollectedAt, collectedAt)
	}

	if _, ok := request.Metrics["cpu_usage"]; !ok {
		t.Fatal("cpu_usage metric missing")
	}
	if _, ok := request.Metrics["memory_usage"]; !ok {
		t.Fatal("memory_usage metric missing")
	}
	if metric, ok := request.Metrics["bgp_peer_count"]; !ok || metric.Value == nil || *metric.Value != 2 {
		t.Fatalf("bgp_peer_count metric=%v, want 2", metric.Value)
	}
	if metric, ok := request.Metrics["bgp_established_count"]; !ok || metric.Value == nil || *metric.Value != 1 {
		t.Fatalf("bgp_established_count metric=%v, want 1", metric.Value)
	}
	if metric, ok := request.Metrics["optical_transceiver_count"]; !ok || metric.Value == nil || *metric.Value != 1 {
		t.Fatalf("optical_transceiver_count metric=%v, want 1", metric.Value)
	}

	snmpExtensions, ok := request.Tags["snmp_extensions"].(map[string]interface{})
	if !ok {
		t.Fatalf("snmp_extensions tag missing or invalid: %#v", request.Tags)
	}
	if _, ok := snmpExtensions["bgp_peers"]; !ok {
		t.Fatalf("bgp_peers tag missing: %#v", snmpExtensions)
	}
	if _, ok := snmpExtensions["optical_transceivers"]; !ok {
		t.Fatalf("optical_transceivers tag missing: %#v", snmpExtensions)
	}

	if len(request.Interfaces) != 1 {
		t.Fatalf("len(interfaces)=%d, want 1", len(request.Interfaces))
	}
}

func TestSNMPPayload_HardwareExtensionsAndInterfaceFields(t *testing.T) {
	inErr := uint64(12)
	outErr := uint64(3)
	inDisc := uint64(5)
	outDisc := uint64(1)
	adminUp := true
	isUp := true
	duplex := 2
	speed := int64(1000)
	inRate := 250_000_000.0
	outRate := 100_000_000.0
	stateNormal := int64(1)
	stateFault := int64(2)
	remPower := 60.0
	portPower := 40.0
	topChanges := int64(3)
	stpProto := int64(3)

	req := monitoring.BuildSNMPDeviceMetricsRequest(9, &devices.SNMPMetrics{
		Components: []devices.ComponentStatusMetrics{
			{Index: "1", Kind: "fan", State: &stateNormal},
			{Index: "2", Kind: "power", State: &stateFault},
		},
		PoE: devices.PoEMetrics{
			Ports:          []devices.PoEPortMetrics{{Index: "1", ConsumingPower: &portPower, Unit: "W"}},
			RemainingPower: &remPower,
			RemainingUnit:  "W",
		},
		STP: devices.STPMetrics{
			ProtocolSpec: &stpProto,
			TopChanges:   &topChanges,
		},
		Disks: []devices.DiskMetrics{
			{Mount: "/", TotalBytes: 1000, UsedBytes: 250},
		},
		Interfaces: []devices.InterfaceMetrics{
			{
				Name:         "if1",
				Description:  "GE0/0/1",
				Speed:        &speed,
				InRate:       &inRate,
				OutRate:      &outRate,
				IsUp:         &isUp,
				AdminUp:      &adminUp,
				DuplexStatus: &duplex,
				InErrors:     &inErr,
				OutErrors:    &outErr,
				InDiscards:   &inDisc,
				OutDiscards:  &outDisc,
			},
		},
		CollectedAt: time.Date(2026, 11, 20, 12, 0, 0, 0, time.UTC),
	})

	if m, ok := req.Metrics["hardware_fault_count"]; !ok || m.Value == nil || *m.Value != 1 {
		t.Fatalf("hardware_fault_count = %+v, want 1", m)
	}
	if m, ok := req.Metrics["poe_power_usage_pct"]; !ok || m.Value == nil || *m.Value != 40 {
		t.Fatalf("poe_power_usage_pct = %+v, want 40", m)
	}
	if m, ok := req.Metrics["stp_top_changes"]; !ok || m.Value == nil || *m.Value != 3 {
		t.Fatalf("stp_top_changes = %+v, want 3", m)
	}

	ext, ok := req.Tags["snmp_extensions"].(map[string]interface{})
	if !ok {
		t.Fatalf("snmp_extensions missing: %#v", req.Tags)
	}
	for _, key := range []string{"components", "poe", "stp", "disks"} {
		if _, exists := ext[key]; !exists {
			t.Fatalf("snmp_extensions missing %q: %#v", key, ext)
		}
	}

	// 验证 SNMPExtensionsResponse 可正确反序列化新增扩展字段
	rawTags, err := json.Marshal(req.Tags)
	if err != nil {
		t.Fatalf("marshal tags: %v", err)
	}
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
	mock.ExpectQuery(`(?is)SELECT collected_at,\s*tags FROM device_metrics`).
		WithArgs(9).
		WillReturnRows(sqlmock.NewRows([]string{"collected_at", "tags"}).AddRow(req.CollectedAt.Time, rawTags))
	snap, err := writer.GetLatestSNMPExtensions(context.Background(), 9)
	if err != nil {
		t.Fatalf("GetLatestSNMPExtensions() error = %v", err)
	}
	if len(snap.Components) != 2 || snap.PoE == nil || snap.STP == nil || len(snap.Disks) != 1 {
		t.Fatalf("unexpected decoded SNMPExtensionsResponse: %+v", snap)
	}

	if len(req.Interfaces) != 1 {
		t.Fatalf("interfaces len = %d, want 1", len(req.Interfaces))
	}
	iface := req.Interfaces[0]
	if iface["if_in_errors"] != uint64(12) || iface["admin_up"] != true || iface["duplex_status"] != "half_duplex" {
		t.Fatalf("unexpected interface payload: %#v", iface)
	}
	if iface["utilization_in"] != 25.0 || iface["utilization_out"] != 10.0 || iface["speed_unknown"] != false {
		t.Fatalf("unexpected utilization payload: %#v", iface)
	}
}

func TestSNMPPayload_ZeroAndOverflowSpeedPreventsDivByZero(t *testing.T) {
	rate := 500_000_000.0
	zeroSpeed := int64(0)
	negativeSpeed := int64(-10)
	overLimitSpeed := int64(devices.MaxReasonableBandwidthBps + 1)
	over10GSpeedMbps := int64(20_000) // 20Gbps > MaxReasonableBandwidthBps (10Gbps)

	cases := []struct {
		name  string
		speed *int64
	}{
		{name: "nil speed", speed: nil},
		{name: "zero speed", speed: &zeroSpeed},
		{name: "negative speed", speed: &negativeSpeed},
		{name: "over raw max bandwidth", speed: &overLimitSpeed},
		{name: "over 10Gbps in Mbps", speed: &over10GSpeedMbps},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := monitoring.BuildSNMPDeviceMetricsRequest(1, &devices.SNMPMetrics{
				Interfaces: []devices.InterfaceMetrics{
					{Name: "if1", Speed: tc.speed, InRate: &rate, OutRate: &rate},
				},
				CollectedAt: time.Now().UTC(),
			})
			iface := req.Interfaces[0]
			if iface["utilization_in"] != 0.0 || iface["utilization_out"] != 0.0 {
				t.Fatalf("utilization should be 0 for %s, got in=%v out=%v", tc.name, iface["utilization_in"], iface["utilization_out"])
			}
			if iface["speed_unknown"] != true {
				t.Fatalf("speed_unknown should be true for %s, got %v", tc.name, iface["speed_unknown"])
			}
		})
	}
}

func TestSNMPPayload_ErrorRateRespectsMaxGapAndFlapCountAccumulates(t *testing.T) {
	t0 := time.Date(2026, 11, 20, 10, 0, 0, 0, time.UTC)
	t1 := t0.Add(5 * time.Minute)  // < RateSampleMaxGap (10m)
	t2 := t0.Add(15 * time.Minute) // >= RateSampleMaxGap

	if got := monitoring.CalculateCounterRate(10, 70, t0, t1); got != 0.2 {
		t.Fatalf("CalculateCounterRate(5m) = %v, want 0.2", got)
	}
	if got := monitoring.CalculateCounterRate(10, 70, t0, t2); got != 0 {
		t.Fatalf("CalculateCounterRate(15m >= RateSampleMaxGap) = %v, want 0", got)
	}

	up := true
	down := false
	flaps, lastChg := monitoring.NextInterfaceFlapState(&up, 0, nil, &down, t1)
	if flaps != 1 || lastChg == nil || !lastChg.Equal(t1) {
		t.Fatalf("first flip got flaps=%d lastChg=%v, want 1 at %v", flaps, lastChg, t1)
	}
	flaps, lastChg = monitoring.NextInterfaceFlapState(&down, flaps, lastChg, &up, t1.Add(5*time.Minute))
	if flaps != 2 {
		t.Fatalf("second flip within 1h got flaps=%d, want 2", flaps)
	}
	// 超过 1 小时没有变更则衰减归零
	flaps, lastChg = monitoring.NextInterfaceFlapState(&up, flaps, lastChg, &up, t1.Add(2*time.Hour))
	if flaps != 0 || lastChg != nil {
		t.Fatalf("after >1h idle got flaps=%d lastChg=%v, want 0/nil", flaps, lastChg)
	}

	// 验证 WriteDeviceMetrics 从 device_interfaces 读历史状态，翻转为 down 时累加 flap_count_1h 并写入 interface_metrics + device_latest_metrics
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	mock.ExpectQuery(`SELECT id FROM "devices" WHERE id = \$1 LIMIT \$2`).
		WithArgs(11, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(11))
	mock.ExpectBegin()
	mock.ExpectExec(`SAVEPOINT`).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery(`(?is)SELECT name, speed, is_up, admin_up, duplex_status, in_errors, out_errors, flap_count_1h, last_status_change_at, last_updated, lld_monitored FROM "device_interfaces" WHERE device_id = \$1`).
		WithArgs(11).
		WillReturnRows(sqlmock.NewRows([]string{
			"name", "speed", "is_up", "admin_up", "duplex_status", "in_errors", "out_errors",
			"flap_count_1h", "last_status_change_at", "last_updated", "lld_monitored",
		}).AddRow("if1", int64(1000), true, true, "full_duplex", int64(2), int64(0), 1, t0, t0, true))

	// 验证 flap_count_1h == 2 与 in_error_rate == (12-2)/300 写入 device_interfaces
	mock.ExpectExec(`(?is)INSERT INTO device_interfaces`).
		WithArgs(
			11, "if1", "GE0/0/1", nil, nil, false, true, "full_duplex",
			int64(12), int64(0), int64(0), int64(0),
			float64(10)/300.0, float64(0),
			float64(0), float64(0), false,
			2, t1, true, t1, t1, t1,
		).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`CREATE SEQUENCE IF NOT EXISTS interface_metrics_id_seq`).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(`INSERT INTO interface_metrics`).WillReturnResult(sqlmock.NewResult(0, 2))
	mock.ExpectExec(`INSERT INTO device_latest_metrics`).WillReturnResult(sqlmock.NewResult(0, 2))
	mock.ExpectCommit()

	collectedAt := monitoring.FlexibleTime{Time: t1}
	_, err := writer.WriteDeviceMetrics(context.Background(), monitoring.DeviceMetricsRequest{
		DeviceID:    11,
		CollectedAt: &collectedAt,
		Interfaces: []map[string]interface{}{
			{"name": "if1", "description": "GE0/0/1", "is_up": false, "if_in_errors": 12},
		},
	})
	if err != nil {
		t.Fatalf("WriteDeviceMetrics() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestClassifyCollectionError_UsesWhitelistAndNeverLeaksRawErrors(t *testing.T) {
	cases := []struct {
		raw      string
		stage    string
		wantCode string
	}{
		{"gosnmp USM wrong digest for user admin community=super-secret-123", "snmp_collect", monitoring.CollectionErrorAuthFailed},
		{"request timeout (after 2 retries) on 10.1.2.3", "snmp_probe", monitoring.CollectionErrorTimeout},
		{"dial udp 10.1.2.3:161: connect: connection refused", "snmp_collect", monitoring.CollectionErrorUnreachable},
		{"PDU error: NoSuchObject on 1.3.6.1.4.1.2011", "snmp_collect", monitoring.CollectionErrorUnsupportedOID},
		{"429 rate_limited by device", "snmp_collect", monitoring.CollectionErrorRateLimited},
	}
	for _, tc := range cases {
		code, msg := monitoring.ClassifyCollectionError(errors.New(tc.raw), tc.stage)
		if code != tc.wantCode {
			t.Fatalf("ClassifyCollectionError(%q) code = %q, want %q", tc.raw, code, tc.wantCode)
		}
		if msg == "" || strings.Contains(msg, "super-secret-123") || strings.Contains(msg, "10.1.2.3") {
			t.Fatalf("safe message leaked raw details or was empty: %q", msg)
		}
	}

	if d := monitoring.BackoffDurationForFailures(2); d != 0 {
		t.Fatalf("failures=2 backoff = %v, want 0", d)
	}
	if d := monitoring.BackoffDurationForFailures(3); d != 5*time.Minute {
		t.Fatalf("failures=3 backoff = %v, want 5m", d)
	}
	if d := monitoring.BackoffDurationForFailures(4); d != 10*time.Minute {
		t.Fatalf("failures=4 backoff = %v, want 10m", d)
	}
	if d := monitoring.BackoffDurationForFailures(5); d != 15*time.Minute {
		t.Fatalf("failures=5 backoff = %v, want 15m", d)
	}
}

func TestSchedulerBackoffCircuitBreaker_ThreeFailuresBackoffAndICMPRecovery(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	// 开一个黑洞 UDP 端口统计是否真发出了 SNMP 请求
	udpConn, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen udp: %v", err)
	}
	defer func() { _ = udpConn.Close() }()
	port := udpConn.LocalAddr().(*net.UDPAddr).Port
	var snmpPackets atomic.Int64
	go func() {
		buf := make([]byte, 2048)
		for {
			if _, _, err := udpConn.ReadFrom(buf); err != nil {
				return
			}
			snmpPackets.Add(1)
		}
	}()

	var icmpUp atomic.Bool
	var snmpProbeUp atomic.Bool
	var icmpCalls atomic.Int64
	probeSvc := devices.NewProbeServiceWithProbers(
		zap.NewNop(),
		func(ctx context.Context, ip string) (bool, *float64, *string) {
			icmpCalls.Add(1)
			if icmpUp.Load() {
				rtt := 12.3
				return true, &rtt, nil
			}
			msg := "icmp timeout"
			return false, nil, &msg
		},
		func(ctx context.Context, ip string, community *string, version *string, p *int, tags interface{}) (bool, *float64, *string, *string) {
			if snmpProbeUp.Load() {
				rtt := 15.0
				info := "Huawei"
				return true, &rtt, &info, nil
			}
			msg := "request timeout (after 2 retries)"
			return false, nil, nil, &msg
		},
	)

	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
	svc := scheduler.NewService(
		db, zap.NewNop(), devices.NewService(db, zap.NewNop()), probeSvc, nil,
		devices.NewSNMPCollector(zap.NewNop()), writer,
		nil, nil, nil, "", nil, nil, nil,
	)

	// Round A：处于退避期（consecutive_failures=3, backoff_until=now+5m），且 ICMP 仍不可达 -> 仅做轻量 ICMP，跳过 SNMP 采集！
	mock.ExpectQuery(`(?is)^SELECT \* FROM "devices" WHERE is_active = \$1$`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "ip_address", "vendor", "snmp_community", "snmp_version", "snmp_port", "is_active", "is_monitored"}).
			AddRow(7, "SW-CORE", "127.0.0.1", "huawei", "public", "2c", port, true, true))
	futureBackoff := time.Now().UTC().Add(5 * time.Minute)
	mock.ExpectQuery(`(?is)SELECT \* FROM "device_collection_states" WHERE device_id IN \(\$1\)`).
		WithArgs(7).
		WillReturnRows(sqlmock.NewRows([]string{
			"device_id", "last_error_code", "last_error_message", "consecutive_failures", "backoff_until",
		}).AddRow(7, "timeout", "采集请求超时，请检查设备负载或网络链路延迟", 3, futureBackoff))

	task := scheduler.ScheduledTask{
		ID:       "metrics_collection",
		TaskType: "device_inspection",
		Enabled:  true,
		Config:   []byte(`{"check_connectivity":true,"collect_metrics":true}`),
	}
	resA, err := executeDeviceInspection(svc, context.Background(), task)
	if err != nil {
		t.Fatalf("Round A error = %v", err)
	}
	if snmpPackets.Load() != 0 {
		t.Fatalf("退避期内且 ICMP 不通时不应发出 SNMP 包，实际发出 %d", snmpPackets.Load())
	}
	if icmpCalls.Load() != 1 {
		t.Fatalf("退避期内应执行 1 次轻量 ICMP 探活，实际 %d", icmpCalls.Load())
	}
	if skipped, _ := resA["metrics_skipped"].(int); skipped != 1 {
		t.Fatalf("Round A metrics_skipped = %v, want 1", resA["metrics_skipped"])
	}
	healthA := svc.EngineHealth()
	if healthA.BackoffDevices != 1 || len(healthA.BackoffDeviceList) != 1 || healthA.BackoffDeviceList[0].LastErrorCode != "timeout" {
		t.Fatalf("unexpected EngineHealth in Round A: %+v", healthA)
	}

	// Round B：仍在退避期内，但 ICMP 恢复！立即清退避并执行完整探测 + 写入 ICMP 指标 + 解除退避
	icmpUp.Store(true)
	snmpProbeUp.Store(false)
	mock.ExpectQuery(`(?is)^SELECT \* FROM "devices" WHERE is_active = \$1$`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "ip_address", "vendor", "snmp_community", "snmp_version", "snmp_port", "is_active", "is_monitored"}).
			AddRow(7, "SW-CORE", "127.0.0.1", "huawei", "public", "2c", port, true, true))
	mock.ExpectQuery(`(?is)SELECT \* FROM "device_collection_states" WHERE device_id IN \(\$1\)`).
		WithArgs(7).
		WillReturnRows(sqlmock.NewRows([]string{
			"device_id", "last_error_code", "last_error_message", "consecutive_failures", "backoff_until",
		}).AddRow(7, "timeout", "采集请求超时，请检查设备负载或网络链路延迟", 3, futureBackoff))

	// 期望清退避（consecutive_failures=0, backoff_until=nil）
	mock.ExpectExec(`(?is)INSERT INTO device_collection_states`).
		WithArgs(7, "", "", 0, nil, sqlmock.AnyArg(), 0, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	// 允许其余探测状态/指标写入走通用匹配
	mock.ExpectExec(`(?is)UPDATE "devices"`).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`(?is)INSERT INTO device_status_history`).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(`SELECT id FROM "devices" WHERE id = \$1 LIMIT \$2`).WithArgs(7, 1).WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(7))
	mock.ExpectBegin()
	mock.ExpectExec(`CREATE SEQUENCE IF NOT EXISTS device_metrics_id_seq`).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(`INSERT INTO device_metrics`).WillReturnResult(sqlmock.NewResult(0, 3))
	// 确认写入 ping_loss_pct / ping_rtt_ms / snmp_reachable 3 条快照到 device_latest_metrics
	probeLatestArgs := make([]driver.Value, 3*11)
	for i := range probeLatestArgs {
		probeLatestArgs[i] = sqlmock.AnyArg()
	}
	mock.ExpectExec(`(?is)INSERT INTO device_latest_metrics`).
		WithArgs(probeLatestArgs...).
		WillReturnResult(sqlmock.NewResult(0, 3))
	mock.ExpectCommit()
	// SNMP 探活失败重新记 1 次失败（consecutive_failures=1, 无 backoff）
	mock.ExpectExec(`(?is)INSERT INTO device_collection_states`).
		WithArgs(7, "timeout", sqlmock.AnyArg(), 1, nil, sqlmock.AnyArg(), 0, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))

	if _, err := executeDeviceInspection(svc, context.Background(), task); err != nil {
		t.Fatalf("Round B error = %v", err)
	}
	healthB := svc.EngineHealth()
	if healthB.BackoffDevices != 0 {
		t.Fatalf("ICMP 恢复后退避设备数应清零，实际 %+v", healthB)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestEngineHealthTracker_ThreadSafeSnapshot(t *testing.T) {
	tracker := monitoring.NewEngineHealthTracker()
	start := time.Date(2026, 11, 20, 12, 0, 0, 0, time.UTC)
	tracker.RecordRoundStart(start, 10)

	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			tracker.IncPendingWriteQueue(1)
			_ = tracker.Snapshot()
			tracker.IncPendingWriteQueue(-1)
		}()
	}
	wg.Wait()

	until := start.Add(5 * time.Minute)
	tracker.RecordRoundFinish(start.Add(2*time.Second), 2000, 10, 8, 2, []monitoring.BackoffDeviceSummary{
		{DeviceID: 3, DeviceName: "Core-1", LastErrorCode: monitoring.CollectionErrorAuthFailed, ConsecutiveFailures: 3, BackoffUntil: &until},
	})

	snap := tracker.Snapshot()
	if snap.DurationMS != 2000 || snap.SuccessDevices != 8 || snap.FailedDevices != 2 || snap.BackoffDevices != 1 || snap.PendingWriteQueue != 0 {
		t.Fatalf("unexpected snapshot: %+v", snap)
	}
	if len(snap.BackoffDeviceList) != 1 || snap.BackoffDeviceList[0].LastErrorMessage == "" {
		t.Fatalf("expected sanitized error message in BackoffDeviceList: %+v", snap.BackoffDeviceList)
	}
}

func floatPtr(v float64) *float64 {
	return &v
}
