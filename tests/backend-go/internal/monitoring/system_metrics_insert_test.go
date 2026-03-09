package monitoring_test

import (
	"strings"
	"testing"
	"time"
	_ "unsafe"

	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
	"gorm.io/datatypes"
)

//go:linkname buildSystemMetricsInsertSQL github.com/your-org/inspect-system/backend-go/internal/monitoring.buildSystemMetricsInsertSQL
func buildSystemMetricsInsertSQL(metrics []monitoring.SystemMetric, createdAt time.Time) (string, []interface{})

func TestBuildSystemMetricsInsertSQL(t *testing.T) {
	host := "host-a"
	unit := "percent"
	cpu := 12.3
	mem := 45.6
	collected := time.Date(2026, 3, 1, 4, 14, 59, 0, time.UTC)
	created := time.Date(2026, 3, 1, 4, 15, 0, 0, time.UTC)

	records := []monitoring.SystemMetric{
		{
			Host:        &host,
			MetricName:  "cpu_usage",
			MetricValue: &cpu,
			MetricUnit:  &unit,
			Tags:        datatypes.JSONMap{},
			CollectedAt: collected,
		},
		{
			Host:        &host,
			MetricName:  "memory_usage",
			MetricValue: &mem,
			MetricUnit:  &unit,
			Tags:        datatypes.JSONMap{},
			CollectedAt: collected,
		},
	}

	sql, values := buildSystemMetricsInsertSQL(records, created)

	if !strings.Contains(sql, "INSERT INTO system_metrics (id, host, metric_name, metric_value, metric_unit, tags, collected_at, created_at) VALUES") {
		t.Fatalf("unexpected sql prefix: %s", sql)
	}
	if !strings.Contains(sql, "nextval('system_metrics_id_seq')") {
		t.Fatalf("expected sequence nextval in sql, got: %s", sql)
	}
	if got, want := len(values), 14; got != want {
		t.Fatalf("unexpected values count: got %d want %d", got, want)
	}

	if values[1] != "cpu_usage" {
		t.Fatalf("unexpected first metric_name: %v", values[1])
	}
	if values[8] != "memory_usage" {
		t.Fatalf("unexpected second metric_name: %v", values[8])
	}
}

func TestBuildSystemMetricsInsertSQLEmpty(t *testing.T) {
	sql, values := buildSystemMetricsInsertSQL(nil, time.Now().UTC())
	if sql != "" {
		t.Fatalf("expected empty sql, got %q", sql)
	}
	if len(values) != 0 {
		t.Fatalf("expected empty values, got %d", len(values))
	}
}
