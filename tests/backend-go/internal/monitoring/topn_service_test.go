package monitoring_test

import (
	"context"
	"math"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

func TestQueryTopN_AllSixMetricsSQLAndFormatting(t *testing.T) {
	activeClause := `\(d\.is_active = \$1 AND COALESCE\(d\.is_monitored, true\) = true AND LOWER\(COALESCE\(d\.status, ''\)\) <> 'offline'\)`
	trafficOnlyPattern := `NOT \(LOWER\(BTRIM\(COALESCE\(NULLIF\(BTRIM\(di\.alias\), ''\), di\.name\)\)\) ~ '\^\(console\|aux\|inloopback\|loopback\|lo\|null\|meth\|m-gigabitethernet\|mgmt\|management\)\(\$|\Q[0-9/\-\s]\E\)'\)`

	t.Run("cpu 与 memory SQL 过滤、排序与 NaN 跳过", func(t *testing.T) {
		db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
		defer cleanup()
		writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

		cols := []string{"device_id", "device_name", "ip_address", "status", "interface_name", "val"}
		mock.ExpectQuery(`(?is)SELECT d\.id AS device_id, d\.name AS device_name, d\.ip_address, d\.status, '' AS interface_name, d\.cpu_usage AS val FROM devices AS d WHERE `+activeClause+` AND \(d\.cpu_usage IS NOT NULL AND d\.cpu_usage >= 0 AND d\.cpu_usage <= 100\) ORDER BY d\.cpu_usage DESC NULLS LAST, d\.id ASC LIMIT \$2`).
			WithArgs(true, 5).
			WillReturnRows(sqlmock.NewRows(cols).
				AddRow(1, "core-01", "10.0.0.1", "online", "", 88.5).
				AddRow(2, "core-02", "10.0.0.2", "warning", "", math.NaN()))

		cpuResp, err := writer.QueryTopN(context.Background(), "cpu", 5, nil)
		if err != nil {
			t.Fatalf("QueryTopN(cpu) error = %v", err)
		}
		if len(cpuResp.Items) != 1 || cpuResp.Items[0].Value != 88.5 || cpuResp.Items[0].DisplayValue != "88.5%" || cpuResp.Items[0].InterfaceDisplayName != "" {
			t.Fatalf("unexpected cpu items: %+v", cpuResp.Items)
		}

		mock.ExpectQuery(`(?is)SELECT d\.id AS device_id, d\.name AS device_name, d\.ip_address, d\.status, '' AS interface_name, d\.memory_usage AS val FROM devices AS d WHERE `+activeClause+` AND \(d\.memory_usage IS NOT NULL AND d\.memory_usage >= 0 AND d\.memory_usage <= 100\) ORDER BY d\.memory_usage DESC NULLS LAST, d\.id ASC LIMIT \$2`).
			WithArgs(true, 5).
			WillReturnRows(sqlmock.NewRows(cols).AddRow(3, "agg-01", "10.0.0.3", "online", "", 72.18))

		memResp, err := writer.QueryTopN(context.Background(), "memory", 5, nil)
		if err != nil {
			t.Fatalf("QueryTopN(memory) error = %v", err)
		}
		if len(memResp.Items) != 1 || memResp.Items[0].Value != 72.18 || memResp.Items[0].DisplayValue != "72.18%" {
			t.Fatalf("unexpected memory items: %+v", memResp.Items)
		}

		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatalf("sqlmock expectations not met: %v", err)
		}
	})

	t.Run("temperature 与 ping_rtt SQL 过滤与展示格式", func(t *testing.T) {
		db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
		defer cleanup()
		writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

		cols := []string{"device_id", "device_name", "ip_address", "status", "interface_name", "val"}
		mock.ExpectQuery(`(?is)SELECT d\.id AS device_id, d\.name AS device_name, d\.ip_address, d\.status, '' AS interface_name, d\.temperature AS val FROM devices AS d WHERE `+activeClause+` AND \(d\.temperature IS NOT NULL AND d\.temperature > -50 AND d\.temperature <= 200\) ORDER BY d\.temperature DESC NULLS LAST, d\.id ASC LIMIT \$2`).
			WithArgs(true, 5).
			WillReturnRows(sqlmock.NewRows(cols).AddRow(4, "edge-01", "10.0.0.4", "online", "", 42.56))

		tempResp, err := writer.QueryTopN(context.Background(), "temperature", 5, nil)
		if err != nil {
			t.Fatalf("QueryTopN(temperature) error = %v", err)
		}
		if len(tempResp.Items) != 1 || tempResp.Items[0].Value != 42.56 || tempResp.Items[0].DisplayValue != "42.6°C" {
			t.Fatalf("unexpected temperature items: %+v", tempResp.Items)
		}

		mock.ExpectQuery(`(?is)SELECT d\.id AS device_id, d\.name AS device_name, d\.ip_address, d\.status, '' AS interface_name, d\.response_time AS val FROM devices AS d WHERE `+activeClause+` AND \(LOWER\(COALESCE\(d\.icmp_status, ''\)\) <> 'offline' AND d\.response_time IS NOT NULL AND d\.response_time >= 0 AND d\.response_time <= 60000\) ORDER BY d\.response_time DESC NULLS LAST, d\.id ASC LIMIT \$2`).
			WithArgs(true, 5).
			WillReturnRows(sqlmock.NewRows(cols).
				AddRow(5, "edge-02", "10.0.0.5", "online", "", 17.4).
				AddRow(6, "edge-03", "10.0.0.6", "online", "", 0.04))

		rttResp, err := writer.QueryTopN(context.Background(), "ping_rtt", 5, nil)
		if err != nil {
			t.Fatalf("QueryTopN(ping_rtt) error = %v", err)
		}
		if len(rttResp.Items) != 2 || rttResp.Items[0].DisplayValue != "17.4 ms" || rttResp.Items[1].DisplayValue != "< 0.1 ms" {
			t.Fatalf("unexpected ping_rtt items: %+v", rttResp.Items)
		}

		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatalf("sqlmock expectations not met: %v", err)
		}
	})

	t.Run("if_util 与 if_errors 接口过滤、极小值归一化、友好接口名与错包格式", func(t *testing.T) {
		db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
		defer cleanup()
		writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

		cols := []string{"device_id", "device_name", "ip_address", "status", "interface_name", "interface_alias", "val"}
		mock.ExpectQuery(`(?is)SELECT d\.id AS device_id, d\.name AS device_name, d\.ip_address, d\.status, di\.name AS interface_name, di\.alias AS interface_alias, GREATEST\(COALESCE\(di\.utilization_in, 0\), COALESCE\(di\.utilization_out, 0\)\) AS val FROM device_interfaces AS di JOIN devices AS d ON d\.id = di\.device_id WHERE `+activeClause+` AND \(di\.lld_monitored = \$2 AND COALESCE\(di\.is_up, false\) = true\) AND \(COALESCE\(di\.speed_unknown, false\) = false AND `+trafficOnlyPattern+` AND GREATEST\(COALESCE\(di\.utilization_in, 0\), COALESCE\(di\.utilization_out, 0\)\) > 0 AND GREATEST\(COALESCE\(di\.utilization_in, 0\), COALESCE\(di\.utilization_out, 0\)\) <= 100\) ORDER BY val DESC NULLS LAST, d\.id ASC, di\.id ASC LIMIT \$3`).
			WithArgs(true, true, 5).
			WillReturnRows(sqlmock.NewRows(cols).
				AddRow(10, "sw-core-01", "10.0.1.1", "online", "if6", "GigabitEthernet0/0/1", 0.000196).
				AddRow(11, "sw-core-02", "10.0.1.2", "online", "if9", nil, 45.678))

		utilResp, err := writer.QueryTopN(context.Background(), "if_util", 5, nil)
		if err != nil {
			t.Fatalf("QueryTopN(if_util) error = %v", err)
		}
		if len(utilResp.Items) != 2 {
			t.Fatalf("len(if_util items) = %d, want 2", len(utilResp.Items))
		}
		if utilResp.Items[0].InterfaceName != "if6" ||
			utilResp.Items[0].InterfaceDisplayName != "GigabitEthernet0/0/1" ||
			utilResp.Items[0].Value != 0.0002 ||
			utilResp.Items[0].DisplayValue != "< 0.01%" {
			t.Fatalf("unexpected if_util[0]: %+v", utilResp.Items[0])
		}
		if utilResp.Items[1].InterfaceName != "if9" ||
			utilResp.Items[1].InterfaceDisplayName != "" ||
			utilResp.Items[1].Value != 45.68 ||
			utilResp.Items[1].DisplayValue != "45.68%" {
			t.Fatalf("unexpected if_util[1]: %+v", utilResp.Items[1])
		}

		mock.ExpectQuery(`(?is)SELECT d\.id AS device_id, d\.name AS device_name, d\.ip_address, d\.status, di\.name AS interface_name, di\.alias AS interface_alias, \(COALESCE\(di\.in_errors, 0\) \+ COALESCE\(di\.out_errors, 0\)\)::float8 AS val FROM device_interfaces AS di JOIN devices AS d ON d\.id = di\.device_id WHERE `+activeClause+` AND \(di\.lld_monitored = \$2 AND COALESCE\(di\.is_up, false\) = true\) AND \(`+trafficOnlyPattern+` AND \(COALESCE\(di\.in_errors, 0\) \+ COALESCE\(di\.out_errors, 0\)\) > 0\) ORDER BY val DESC NULLS LAST, d\.id ASC, di\.id ASC LIMIT \$3`).
			WithArgs(true, true, 5).
			WillReturnRows(sqlmock.NewRows(cols).
				AddRow(12, "sw-err-01", "10.0.1.3", "warning", "if6", "GigabitEthernet0/0/1", 12.0).
				AddRow(13, "sw-err-02", "10.0.1.4", "online", "if9", nil, 3.0))

		errResp, err := writer.QueryTopN(context.Background(), "if_errors", 5, nil)
		if err != nil {
			t.Fatalf("QueryTopN(if_errors) error = %v", err)
		}
		if len(errResp.Items) != 2 {
			t.Fatalf("len(if_errors items) = %d, want 2", len(errResp.Items))
		}
		if errResp.Items[0].Value != 12 || errResp.Items[0].DisplayValue != "12 个" || errResp.Items[0].InterfaceDisplayName != "GigabitEthernet0/0/1" {
			t.Fatalf("unexpected if_errors[0]: %+v", errResp.Items[0])
		}
		if errResp.Items[1].InterfaceDisplayName != "" || errResp.Items[1].DisplayValue != "3 个" {
			t.Fatalf("unexpected if_errors[1]: %+v", errResp.Items[1])
		}

		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatalf("sqlmock expectations not met: %v", err)
		}
	})
}

func TestQueryTopN_GroupAndDeviceIDsFilteringAndLimits(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	groupID := 10
	mock.ExpectQuery(`(?is)SELECT id, parent_id FROM "device_groups"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "parent_id"}).
			AddRow(10, nil).
			AddRow(11, 10))

	mock.ExpectQuery(`(?is)SELECT d\.id AS device_id, d\.name AS device_name, d\.ip_address, d\.status, '' AS interface_name, d\.cpu_usage AS val FROM devices AS d WHERE .* AND d\.group_id IN \(\$2,\$3\) AND d\.id IN \(\$4,\$5\) ORDER BY d\.cpu_usage DESC NULLS LAST, d\.id ASC LIMIT \$6`).
		WithArgs(true, 10, 11, 101, 102, 5).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "device_name", "ip_address", "status", "interface_name", "val"}).
			AddRow(101, "scoped-sw", "10.1.0.1", "online", "", 55.2))

	resp, err := writer.QueryTopN(context.Background(), "cpu", 5, &groupID, 101, -3, 0, 101, 102)
	if err != nil {
		t.Fatalf("QueryTopN with group+deviceIDs error = %v", err)
	}
	if len(resp.Items) != 1 || resp.Items[0].DeviceID != 101 {
		t.Fatalf("unexpected items: %+v", resp.Items)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}

	tooMany := make([]int, monitoring.MaxTopNDeviceIDs+1)
	for i := range tooMany {
		tooMany[i] = i + 1
	}
	if _, err := writer.QueryTopN(context.Background(), "cpu", 5, nil, tooMany...); err == nil || !strings.Contains(err.Error(), "device_ids") {
		t.Fatalf("expected error for > %d device_ids, got %v", monitoring.MaxTopNDeviceIDs, err)
	}
}
