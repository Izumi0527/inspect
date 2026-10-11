package monitoring_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

// 采集任务开始时一次性加载设备列表再逐台写入：任务进行中被删除的设备仍会走到写入。
// 删设备已清掉它的监控数据，写入不校验就会产生新的孤儿行；统计卡、流量聚合不按名字过滤，
// 会被这些样本污染到下次重启清理为止。写入前先确认设备仍在，不在就拒绝、不开事务。
func TestWriteDeviceMetrics_RejectsDeletedDevice(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	mock.ExpectQuery(`SELECT id FROM "devices" WHERE id = \$1 LIMIT \$2`).
		WithArgs(6, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	cpu := 12.5
	collectedAt := monitoring.FlexibleTime{Time: time.Date(2026, 10, 11, 14, 0, 0, 0, time.UTC)}
	_, err := writer.WriteDeviceMetrics(context.Background(), monitoring.DeviceMetricsRequest{
		DeviceID:    6,
		Metrics:     map[string]monitoring.MetricValue{"cpu_usage": {Value: &cpu}},
		CollectedAt: &collectedAt,
	})
	if !errors.Is(err, monitoring.ErrDeviceNotFound) {
		t.Fatalf("err = %v, want ErrDeviceNotFound", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("设备不存在时不应开事务写入: %v", err)
	}
}

// 没有任何可写指标时先于设备校验早退，不多查一次库。
func TestWriteDeviceMetrics_NoMetricsSkipsDeviceLookup(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	_, err := writer.WriteDeviceMetrics(context.Background(), monitoring.DeviceMetricsRequest{DeviceID: 6})
	if !errors.Is(err, monitoring.ErrNoMetrics) {
		t.Fatalf("err = %v, want ErrNoMetrics", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
