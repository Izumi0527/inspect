package scheduler_test

import (
	"context"
	"fmt"
	"net"
	"sync/atomic"
	"testing"
	"time"
	_ "unsafe"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/alerts"
	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/logs"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
	"github.com/your-org/inspect-system/backend-go/internal/scheduler"
)

//go:linkname executeDeviceInspection github.com/your-org/inspect-system/backend-go/internal/scheduler.(*Service).executeDeviceInspection
func executeDeviceInspection(s *scheduler.Service, ctx context.Context, task scheduler.ScheduledTask) (map[string]interface{}, error)

//go:linkname snmpCollectionTargets github.com/your-org/inspect-system/backend-go/internal/scheduler.snmpCollectionTargets
func snmpCollectionTargets(list []devices.Device, probes map[int]devices.ProbeResult) ([]devices.Device, []int)

//go:linkname unreachableInRound github.com/your-org/inspect-system/backend-go/internal/scheduler.unreachableInRound
func unreachableInRound(probes map[int]devices.ProbeResult, deviceID int) bool

//go:linkname collectDeviceMetrics github.com/your-org/inspect-system/backend-go/internal/scheduler.(*Service).collectDeviceMetrics
func collectDeviceMetrics(s *scheduler.Service, ctx context.Context, devicesList []devices.Device, taskID string, total int) int

// SNMPv3 的凭据在 tags.snmp_config.v3_config 里，前端对 v3 不提交 community；采集循环此前以
// 「community 为空」判定未配置 SNMP，v3 设备因此从未被定时采集（单设备采集等接口不受影响）。
// 三种安全级别都要能发出请求：此前配置解析不论级别都默认填 MD5/DES，gosnmp 见到协议却没有口令就拒绝连接，
// 前端默认的 noAuthNoPriv 与 authNoPriv 在探测、手动采集、定时采集中全部连不上。
func TestCollectDeviceMetrics_CollectsSNMPv3DeviceWithoutCommunity(t *testing.T) {
	cases := []struct {
		level    string
		v3Config string
	}{
		{"noAuthNoPriv", `"security_level":"noAuthNoPriv"`},
		{"authNoPriv", `"security_level":"authNoPriv","auth_protocol":"SHA","auth_password":"auth-secret-1"`},
		{"authPriv", `"security_level":"authPriv","auth_protocol":"SHA","auth_password":"auth-secret-1","priv_protocol":"AES","priv_password":"priv-secret-1"`},
	}
	for _, tc := range cases {
		t.Run(tc.level, func(t *testing.T) {
			db, _, cleanup := newSchedulerGormDBWithSQLMock(t)
			defer cleanup()
			port, packets := newSNMPBlackhole(t)

			// 黑洞端口不应答，采集会一直等超时；测试只确认请求已发出，测试结束时关闭端口，残余请求随之快速失败。
			device := snmpV3Device(port, `"username":"monitor",`+tc.v3Config)
			go collectDeviceMetrics(newCollectorService(db), context.Background(), []devices.Device{device}, "metrics_collection", 1)

			deadline := time.After(2 * time.Second)
			for packets.Load() == 0 {
				select {
				case <-deadline:
					t.Fatal("tags 内凭据齐全的 SNMPv3 设备 2 秒内没有发出任何 SNMP 请求")
				case <-time.After(20 * time.Millisecond):
				}
			}
		})
	}
}

// 凭据不全的设备仍应跳过、不发请求：v3 缺用户名、v2c 缺 community 都无法完成认证，只会逐个阶段等满超时。
func TestCollectDeviceMetrics_SkipsDevicesWithIncompleteSNMPCredentials(t *testing.T) {
	db, _, cleanup := newSchedulerGormDBWithSQLMock(t)
	defer cleanup()
	port, packets := newSNMPBlackhole(t)
	version := "2c"
	v2cWithoutCommunity := devices.Device{ID: 9, IPAddress: "127.0.0.1", SnmpVersion: &version, SnmpPort: &port}

	done := make(chan int, 1)
	go func() {
		done <- collectDeviceMetrics(newCollectorService(db), context.Background(),
			[]devices.Device{snmpV3Device(port, `"username":"","security_level":"noAuthNoPriv"`), v2cWithoutCommunity}, "metrics_collection", 2)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatalf("凭据不全的设备仍在等待 SNMP 超时（已发出 %d 个包）", packets.Load())
	}
	if got := packets.Load(); got != 0 {
		t.Fatalf("凭据不全的设备不应发出 SNMP 请求，实际 %d 个包", got)
	}
}

func newCollectorService(db *gorm.DB) *scheduler.Service {
	return scheduler.NewService(db, zap.NewNop(), nil, nil, nil,
		devices.NewSNMPCollector(zap.NewNop()), monitoring.NewMetricsWriter(db, nil, zap.NewNop()),
		nil, nil, nil, "", nil, nil, nil)
}

// snmpV3Device 构造一台只在 tags.snmp_config.v3_config 里配了凭据（没有 community）的 v3 设备，
// v3Fields 是 v3_config 对象内部的 JSON 字段片段。
func snmpV3Device(port int, v3Fields string) devices.Device {
	version := "3"
	tags := fmt.Sprintf(`{"snmp_config":{"version":"3","v3_config":{%s}}}`, v3Fields)
	return devices.Device{ID: 8, IPAddress: "127.0.0.1", Vendor: "huawei", SnmpVersion: &version, SnmpPort: &port, Tags: datatypes.JSON(tags)}
}

// 指标采集只看 SNMP：能 ping 通但 SNMP 不应答（代理挂了、团体字错了）的设备同样会让采集逐个阶段超时。
// 本轮没探测到的设备（探测出错、或任务关闭了 check_connectivity）维持原样照常采集。
// 未配置 SNMP 的设备探测必然「失败」，但它不发请求、拖不慢采集，不能记为探测失败而计入跳过数。
func TestSNMPCollectionTargets_SkipsOnlyDevicesWhoseSNMPProbeFailed(t *testing.T) {
	timeout := "request timeout (after 2 retries)"
	notConfigured := "SNMP community not configured"
	list := []devices.Device{{ID: 1}, {ID: 2}, {ID: 3}, {ID: 4}, {ID: 5}}
	probes := map[int]devices.ProbeResult{
		1: {DeviceID: 1, IcmpReachable: true, SnmpReachable: true},
		2: {DeviceID: 2, IcmpReachable: true, SnmpReachable: false, SnmpError: &timeout},
		4: {DeviceID: 4, IcmpReachable: false, SnmpReachable: false, SnmpError: &timeout},
		5: {DeviceID: 5, IcmpReachable: true, SnmpReachable: false, SnmpError: &notConfigured},
	}

	targets, skipped := snmpCollectionTargets(list, probes)
	if ids := deviceIDs(targets); len(ids) != 3 || ids[0] != 1 || ids[1] != 3 || ids[2] != 5 {
		t.Fatalf("targets = %v，want [1 3 5]（3 号本轮未探测照常采集；5 号未配置 SNMP，交给采集循环的凭据检查）", ids)
	}
	if len(skipped) != 2 || skipped[0] != 2 || skipped[1] != 4 {
		t.Fatalf("skipped = %v，want [2 4]", skipped)
	}

	all, none := snmpCollectionTargets(list, nil)
	if len(all) != len(list) || len(none) != 0 {
		t.Fatalf("没有探测结果时应全部照常采集，got targets=%v skipped=%v", deviceIDs(all), none)
	}
}

// 日志轮询有 SSH 兜底，只有 ICMP 与 SNMP 都确实发了请求且都无应答时才跳过；
// 没配 SNMP 又禁 ping 的设备只能靠 SSH 取日志，不能因探测「失败」被跳过。
func TestUnreachableInRound_RequiresBothICMPAndAttemptedSNMPToFail(t *testing.T) {
	timeout := "request timeout (after 2 retries)"
	notConfigured := "SNMP community not configured"
	probes := map[int]devices.ProbeResult{
		1: {DeviceID: 1, IcmpReachable: false, SnmpReachable: false, SnmpError: &timeout},
		2: {DeviceID: 2, IcmpReachable: true, SnmpReachable: false, SnmpError: &timeout},
		3: {DeviceID: 3, IcmpReachable: false, SnmpReachable: true},
		4: {DeviceID: 4, IcmpReachable: false, SnmpReachable: false, SnmpError: &notConfigured},
	}
	cases := []struct {
		name     string
		deviceID int
		want     bool
	}{
		{"ICMP 与 SNMP 都超时", 1, true},
		{"能 ping 通", 2, false},
		{"SNMP 有应答", 3, false},
		{"未配置 SNMP（只靠 SSH）", 4, false},
		{"本轮未探测", 5, false},
	}
	for _, tc := range cases {
		if got := unreachableInRound(probes, tc.deviceID); got != tc.want {
			t.Errorf("%s: unreachableInRound() = %v，want %v", tc.name, got, tc.want)
		}
	}
	if unreachableInRound(nil, 1) {
		t.Error("没有探测结果时不能判定为不可达")
	}
}

func deviceIDs(list []devices.Device) []int {
	ids := make([]int, 0, len(list))
	for _, item := range list {
		ids = append(ids, item.ID)
	}
	return ids
}

// 一轮采集里，探测（第 1 步）已用与指标采集相同的 SNMP 参数确认设备无应答时，第 2 步不能再对它
// 逐个阶段发请求：每个请求都要等满 5s×3 的超时，实测一台不可达设备 43 次请求约 645 秒，
// 整轮采集、告警评估（离线告警因此晚 10 分钟以上）和下一轮都被它拖住。
func TestDeviceInspection_SkipsSNMPCollectionForDeviceSilentInProbe(t *testing.T) {
	db, mock, cleanup := newSchedulerGormDBWithSQLMock(t)
	defer cleanup()
	port, packets := newSNMPBlackhole(t)
	expectActiveDevice(mock, port)

	svc := scheduler.NewService(db, zap.NewNop(), devices.NewService(db, zap.NewNop()), silentProbeService(), nil,
		devices.NewSNMPCollector(zap.NewNop()), monitoring.NewMetricsWriter(db, nil, zap.NewNop()),
		nil, nil, nil, "", nil, nil, nil)

	result := runInspectionRound(t, svc, `{"check_connectivity":true,"collect_metrics":true}`, packets)
	if got := packets.Load(); got != 0 {
		t.Fatalf("探测已判定 SNMP 无应答，采集仍向设备发出了 %d 个 SNMP 包", got)
	}
	if skipped, _ := result["metrics_skipped"].(int); skipped != 1 {
		t.Fatalf("metrics_skipped = %v，want 1（执行结果应记录本轮因探测不通而跳过的设备数）", result["metrics_skipped"])
	}
}

// 第 4 步告警日志轮询同理：对 ICMP 与 SNMP 都无应答的设备，日志采集会先等两次 SNMP walk 超时，
// 再回退 SSH 等握手失败（实测约 4 分钟），同样拖住整轮。
func TestDeviceInspection_SkipsAlarmLogPollingForDeviceSilentInProbe(t *testing.T) {
	db, mock, cleanup := newSchedulerGormDBWithSQLMock(t)
	defer cleanup()
	port, packets := newSNMPBlackhole(t)
	expectActiveDevice(mock, port)
	// 日志采集按设备 ID 重新读取设备（触发凭据解密钩子）；若仍去轮询，就会对黑洞端口发 SNMP walk。
	mock.ExpectQuery(`(?is)SELECT \* FROM "devices" WHERE id = \$1`).
		WillReturnRows(blackholeDeviceRows(port))

	svc := scheduler.NewService(db, zap.NewNop(), devices.NewService(db, zap.NewNop()), silentProbeService(), nil,
		nil, nil, nil, nil, nil, "", nil,
		alerts.NewTrapAlertBridge(db, nil, zap.NewNop()), logs.NewService(db, zap.NewNop()))

	runInspectionRound(t, svc, `{"check_connectivity":true,"collect_metrics":false}`, packets)
	if got := packets.Load(); got != 0 {
		t.Fatalf("探测已判定设备 ICMP 与 SNMP 均无应答，日志轮询仍向设备发出了 %d 个 SNMP 包", got)
	}
}

// runInspectionRound 在后台执行一轮采集并限时等待：修复前被测调用会卡在 SNMP 超时上，
// 不能让它把整个测试包拖到 go test 的总超时。
func runInspectionRound(t *testing.T, svc *scheduler.Service, config string, packets *atomic.Int64) map[string]interface{} {
	t.Helper()
	type outcome struct {
		result map[string]interface{}
		err    error
	}
	done := make(chan outcome, 1)
	task := scheduler.ScheduledTask{ID: "metrics_collection", TaskType: "device_inspection", Enabled: true, Config: datatypes.JSON(config)}
	go func() {
		result, err := executeDeviceInspection(svc, context.Background(), task)
		done <- outcome{result: result, err: err}
	}()
	select {
	case out := <-done:
		if out.err != nil {
			t.Fatalf("executeDeviceInspection() error = %v", out.err)
		}
		return out.result
	case <-time.After(3 * time.Second):
		t.Fatalf("一轮采集 3 秒内未结束，仍在等待本轮探测不可达的设备（已向它发出 %d 个 SNMP 包）", packets.Load())
		return nil
	}
}

// newSNMPBlackhole 在本机开一个只收不回的 UDP 端口：发过去的 SNMP 请求只能等到超时，
// 对采集器的效果与设备不可达相同；收到的包数说明采集是否真的向设备发出了请求。
func newSNMPBlackhole(t *testing.T) (int, *atomic.Int64) {
	t.Helper()
	conn, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen udp: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	packets := &atomic.Int64{}
	go func() {
		buf := make([]byte, 4096)
		for {
			if _, _, err := conn.ReadFrom(buf); err != nil {
				return
			}
			packets.Add(1)
		}
	}()
	return conn.LocalAddr().(*net.UDPAddr).Port, packets
}

func expectActiveDevice(mock sqlmock.Sqlmock, port int) {
	mock.ExpectQuery(`(?is)^SELECT \* FROM "devices" WHERE is_active = \$1$`).
		WithArgs(true).
		WillReturnRows(blackholeDeviceRows(port))
}

func blackholeDeviceRows(port int) *sqlmock.Rows {
	return sqlmock.NewRows([]string{"id", "name", "ip_address", "vendor", "snmp_community", "snmp_version", "snmp_port", "is_active", "is_monitored"}).
		AddRow(7, "CORE-SW", "127.0.0.1", "huawei", "public", "2c", port, true, true)
}

// silentProbeService 注入「ICMP 与 SNMP 都超时」的探测结果，对应一台已经掉线的设备。
func silentProbeService() *devices.ProbeService {
	icmp := func(ctx context.Context, ip string) (bool, *float64, *string) {
		msg := "icmp timeout"
		return false, nil, &msg
	}
	snmp := func(ctx context.Context, ip string, community *string, version *string, port *int, tags interface{}) (bool, *float64, *string, *string) {
		msg := "request timeout (after 2 retries)"
		return false, nil, nil, &msg
	}
	return devices.NewProbeServiceWithProbers(zap.NewNop(), icmp, snmp)
}
