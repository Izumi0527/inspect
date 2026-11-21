package monitoring_test

import (
	"context"
	"math"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

func TestQueryLatestData_PortDisplayFormattingAndSearch(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
	now := time.Date(2026, 11, 22, 0, 50, 12, 0, time.UTC)
	pattern := "%Gigabit%"

	excludePattern := `\(\(lm\.interface_name = '' OR NOT \(LOWER\(BTRIM\(COALESCE\(NULLIF\(BTRIM\(di\.alias\), ''\), lm\.interface_name\)\)\) ~ '\^\(console\|aux\|inloopback\|loopback\|lo\|null\|meth\|m-gigabitethernet\|mgmt\|management\)\(\$|\Q[0-9/\-\s]\E\)'\)\)\)`
	orderPattern := `ORDER BY CASE WHEN lm\.interface_name = '' THEN 0 ELSE 1 END ASC,\s+lm\.device_id ASC,\s+CASE\s+WHEN lm\.interface_name = '' THEN ''\s+ELSE regexp_replace\(\s+regexp_replace\(\s+LOWER\(COALESCE\(NULLIF\(BTRIM\(di\.alias\), ''\), lm\.interface_name\)\),\s+'\Q([0-9]+)\E',\s+'0000000000\\1',\s+'g'\s+\),\s+'\Q0+([0-9]{10})\E',\s+'\\1',\s+'g'\s+\)\s+END ASC,\s+lm\.metric_name ASC,\s+lm\.collected_at DESC`

	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM device_latest_metrics AS lm .* LEFT JOIN device_interfaces AS di ON di\.device_id = lm\.device_id AND di\.name = lm\.interface_name WHERE d\.is_active = \$1 AND `+excludePattern+` .* COALESCE\(di\.alias, ''\) ILIKE \$6`).
		WithArgs(true, 28, pattern, pattern, pattern, pattern, pattern, pattern).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(4))

	cols := []string{
		"device_id", "device_name", "ip_address", "metric_name",
		"interface_name", "interface_alias", "item_key", "application_tag",
		"metric_value", "prev_value", "raw_text", "metric_unit", "collected_at",
	}
	rows := sqlmock.NewRows(cols).
		AddRow(28, "test-sw", "192.168.20.1", "bandwidth_in", "", nil, "bandwidth_in", "network", 1450.0, 340.0, nil, "bps", now).
		AddRow(28, "test-sw", "192.168.20.1", "ifHCInOctets", "if8", "GigabitEthernet0/0/3", "ifHCInOctets", "interface", 13002342.4, 7570719.0, nil, nil, now).
		AddRow(28, "test-sw", "192.168.20.1", "if_in_errors", "if9", nil, "if_in_errors", "interface", 5.0, 5.0, nil, "count", now).
		AddRow(28, "test-sw", "192.168.20.1", "snmp_reachable", "", nil, "snmp_reachable", "availability", 1.0, 0.0, nil, nil, now)

	mock.ExpectQuery(`(?is)SELECT lm\.device_id, d\.name AS device_name, d\.ip_address, lm\.metric_name, lm\.interface_name, di\.alias AS interface_alias .* `+excludePattern+` .* `+orderPattern).
		WithArgs(true, 28, pattern, pattern, pattern, pattern, pattern, pattern, 50).
		WillReturnRows(rows)

	res, err := writer.QueryLatestData(context.Background(), monitoring.LatestDataFilter{
		DeviceIDs: []int{28},
		Search:    "Gigabit",
		Page:      1,
		PageSize:  50,
	})
	if err != nil {
		t.Fatalf("QueryLatestData() error = %v", err)
	}
	if len(res.Items) != 4 {
		t.Fatalf("len(Items) = %d, want 4", len(res.Items))
	}

	// 1. 整机带宽：bps -> Kbps，delta -> +1.11 Kbps
	it0 := res.Items[0]
	if it0.InterfaceDisplayName != "" || it0.MetricLabel != "下行速率" || it0.DisplayValue != "1.45 Kbps" || it0.DeltaDisplay != "+1.11 Kbps" {
		t.Fatalf("item[0] = %+v", it0)
	}
	// 2. 端口累计字节（DB unit=nil -> 推导 bytes）：12.4 MB，+5.18 MB，if8 -> GigabitEthernet0/0/3
	it1 := res.Items[1]
	if it1.InterfaceName != "if8" || it1.InterfaceDisplayName != "GigabitEthernet0/0/3" ||
		it1.MetricLabel != "入站累计字节数" || it1.DisplayValue != "12.4 MB" || it1.DeltaDisplay != "+5.18 MB" {
		t.Fatalf("item[1] = %+v", it1)
	}
	if it1.MetricUnit == nil || *it1.MetricUnit != "bytes" {
		t.Fatalf("item[1].MetricUnit = %v, want bytes", it1.MetricUnit)
	}
	// 3. 无别名合成端口 if9 -> interface_display_name="", delta=0 -> "无变化", count -> "5 个"
	it2 := res.Items[2]
	if it2.InterfaceName != "if9" || it2.InterfaceDisplayName != "" || it2.DisplayValue != "5 个" || it2.DeltaDisplay != "无变化" {
		t.Fatalf("item[2] = %+v", it2)
	}
	// 4. snmp_reachable 0 -> 1 => "不可达 → 可达"
	it3 := res.Items[3]
	if it3.DisplayValue != "可达" || it3.DeltaDisplay != "不可达 → 可达" {
		t.Fatalf("item[3] = %+v", it3)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestLatestData_LabelsValuesAndDeltasFormatting(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
	now := time.Date(2026, 11, 22, 1, 0, 0, 0, time.UTC)

	labelCases := []struct {
		metric string
		want   string
	}{
		{"ifHCInOctets", "入站累计字节数"},
		{"if_hc_in_octets", "入站累计字节数"},
		{"ifHCOutOctets", "出站累计字节数"},
		{"if_hc_out_octets", "出站累计字节数"},
		{"network_bytes_in", "入站网络字节数"},
		{"network_bytes_out", "出站网络字节数"},
		{"optical_transceiver_count", "在位光模块数"},
		{"stp_top_changes", "STP 拓扑变更次数"},
		{"bgp_peer_count", "BGP 邻居总数"},
		{"poe_power_usage_pct", "PoE 功率使用率"},
		{"icmp.rtt", "ICMP 探测延迟"},
		{"if_in_error_rate", "接收错包率"},
		{"if_out_error_rate", "发送错包率"},
		{"if_oper_status", "端口运行状态"},
	}

	cols := []string{
		"device_id", "device_name", "ip_address", "metric_name",
		"interface_name", "interface_alias", "item_key", "application_tag",
		"metric_value", "prev_value", "raw_text", "metric_unit", "collected_at",
	}

	t.Run("指标中文名称映射完整", func(t *testing.T) {
		mock.ExpectQuery(`SELECT count\(\*\) FROM device_latest_metrics`).
			WithArgs(true).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(len(labelCases)))

		rows := sqlmock.NewRows(cols)
		for _, tc := range labelCases {
			rows.AddRow(1, "sw", "10.0.0.1", tc.metric, "", nil, tc.metric, "system", 1.0, nil, nil, nil, now)
		}
		mock.ExpectQuery(`SELECT lm\.device_id`).
			WithArgs(true, 50).
			WillReturnRows(rows)

		res, err := writer.QueryLatestData(context.Background(), monitoring.LatestDataFilter{Page: 1, PageSize: 50})
		if err != nil {
			t.Fatalf("QueryLatestData() error = %v", err)
		}
		for i, tc := range labelCases {
			if res.Items[i].MetricLabel != tc.want {
				t.Errorf("metric %q label = %q, want %q", tc.metric, res.Items[i].MetricLabel, tc.want)
			}
		}
	})

	t.Run("各量纲 DisplayValue、DeltaDisplay 与 NaN/Inf 防御", func(t *testing.T) {
		type fmtCase struct {
			metric string
			curr   *float64
			prev   *float64
			unit   interface{}
			wantV  string
			wantD  string
		}
		f := func(v float64) *float64 { return &v }
		cases := []fmtCase{
			// 带宽：bps / Kbps / Mbps / Gbps
			{"bandwidth_out", f(125_500_000), f(124_000_000), "bps", "125.5 Mbps", "+1.5 Mbps"},
			// 字节：B / GB
			{"ifHCOutOctets", f(512), f(256), "bytes", "512 B", "+256 B"},
			{"network_bytes_in", f(3.82 * 1024 * 1024 * 1024), nil, "bytes", "3.82 GB", "—"},
			// 整数计数：次 / 个，无 .00
			{"stp_top_changes", f(3), f(0), "count", "3 次", "+3 次"},
			{"optical_transceiver_count", f(4), f(6), "count", "4 个", "-2 个"},
			// 百分比紧凑格式
			{"cpu_usage", f(1.0), f(1.0), "%", "1%", "无变化"},
			{"memory_usage", f(72.98), f(71.48), "%", "72.98%", "+1.5%"},
			// 延迟
			{"icmp.rtt", f(18.5), f(28.5), "ms", "18.5 ms", "-10 ms"},
			// 温度
			{"temperature", f(42.5), f(41.0), "°C", "42.5°C", "+1.5°C"},
			// uptime: 秒/分/时/天 及差值
			{"uptime", f(45), f(10), "seconds", "45 秒", "+35 秒"},
			{"uptime", f(1500), f(1425), "seconds", "25 分钟", "+1 分钟 15 秒"},
			{"uptime", f(7800), f(7500), "seconds", "2 小时 10 分钟", "+5 分钟"},
			{"uptime", f(90000), f(97800), "seconds", "1 天 1 小时", "-2 小时 10 分钟"},
			// 状态类
			{"if_oper_status", f(2), f(1), nil, "断开 (DOWN)", "正常 (UP) → 断开 (DOWN)"},
			// NaN / Inf 防御
			{"cpu_usage", f(math.NaN()), nil, "%", "—", "—"},
			{"bandwidth_in", f(math.Inf(1)), f(100), "bps", "—", "—"},
			// 微小正/负差值按量纲舍入归零 -> "无变化"（绝不出 "-0%" / "-0 ms" 等）
			{"cpu_usage", f(10.0), f(10.001), "%", "10%", "无变化"},
			{"cpu_usage", f(10.001), f(10.0), "%", "10%", "无变化"},
			{"ping_rtt_ms", f(20.0), f(20.01), "ms", "20 ms", "无变化"},
			{"temperature", f(40.0), f(40.01), "°C", "40°C", "无变化"},
			{"uptime", f(100.0), f(100.1), "seconds", "1 分钟", "无变化"},
			{"if_in_errors", f(5.0), f(5.1), "count", "5 个", "无变化"},
			// 显式 Mbps 不被重标为 bps；负字节值 -2048 正常缩进为 "-2 KB"
			{"bandwidth_in", f(12.5), f(10.0), "Mbps", "12.5 Mbps", "+2.5 Mbps"},
			{"ifHCInOctets", f(-2048), f(0), "bytes", "-2 KB", "-2 KB"},
		}

		mock.ExpectQuery(`SELECT count\(\*\) FROM device_latest_metrics`).
			WithArgs(true).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(len(cases)))
		rows := sqlmock.NewRows(cols)
		for _, tc := range cases {
			rows.AddRow(1, "sw", "10.0.0.1", tc.metric, "", nil, tc.metric, "system", tc.curr, tc.prev, nil, tc.unit, now)
		}
		mock.ExpectQuery(`SELECT lm\.device_id`).
			WithArgs(true, 50).
			WillReturnRows(rows)

		res, err := writer.QueryLatestData(context.Background(), monitoring.LatestDataFilter{Page: 1, PageSize: 50})
		if err != nil {
			t.Fatalf("QueryLatestData() error = %v", err)
		}
		for i, tc := range cases {
			got := res.Items[i]
			if got.DisplayValue != tc.wantV {
				t.Errorf("case[%d] (%s) DisplayValue = %q, want %q", i, tc.metric, got.DisplayValue, tc.wantV)
			}
			if got.DeltaDisplay != tc.wantD {
				t.Errorf("case[%d] (%s) DeltaDisplay = %q, want %q", i, tc.metric, got.DeltaDisplay, tc.wantD)
			}
		}
	})

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestInterfaceMetricsToLatestMetrics_InfersBytesUnitForOctets(t *testing.T) {
	val := 1024.0
	now := time.Date(2026, 11, 22, 0, 0, 0, 0, time.UTC)
	points := monitoring.InterfaceMetricsToLatestMetrics([]monitoring.InterfaceMetric{
		{DeviceID: 1, InterfaceName: "if8", MetricName: "ifHCInOctets", MetricValue: &val, CollectedAt: now},
		{DeviceID: 1, InterfaceName: "if8", MetricName: "ifHCOutOctets", MetricValue: &val, CollectedAt: now},
	}, nil)
	if len(points) != 2 {
		t.Fatalf("len(points) = %d, want 2", len(points))
	}
	for _, p := range points {
		if p.MetricUnit == nil || *p.MetricUnit != "bytes" {
			t.Fatalf("%s MetricUnit = %v, want bytes", p.MetricName, p.MetricUnit)
		}
	}
}
