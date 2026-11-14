package logs_test

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/config"
	"github.com/your-org/inspect-system/backend-go/internal/logs"
	"github.com/your-org/inspect-system/backend-go/internal/settings"
	"go.uber.org/zap"
)

func TestListLogs_AutomaticallyAppliesPersistedExcludeKeywords(t *testing.T) {
	db, mock, cleanup := newLogsGormDBWithSQLMock(t, sqlmock.QueryMatcherRegexp)
	defer cleanup()

	settingsService := settings.NewService(db, nil, config.Config{}, zap.NewNop())
	service := logs.NewService(db, zap.NewNop())
	service.SetSettings(settingsService)

	mock.ExpectQuery(`SELECT \* FROM "system_settings" WHERE key = \$1`).
		WithArgs("logs.exclude_keywords", sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"id", "key", "value", "category", "data_type"}).
			AddRow(1, "logs.exclude_keywords", "HEARTBEAT,DEBUG", "logs", "string"))

	excludeClause := `\(\(COALESCE\(l\.message, ''\) NOT ILIKE \$\d+ AND COALESCE\(l\.raw_message, ''\) NOT ILIKE \$\d+\)\)`
	twoKeywords := excludeClause + ` AND ` + excludeClause

	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM device_logs AS l LEFT JOIN devices d ON d\.id = l\.device_id WHERE l\.device_id = \$\d+ AND `+twoKeywords+` AND l\.self_generated = \$\d+`).
		WithArgs(1, "%HEARTBEAT%", "%HEARTBEAT%", "%DEBUG%", "%DEBUG%", false).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

	mock.ExpectQuery(`(?is)SELECT l\.\*, d\.name AS device_name, d\.ip_address AS device_ip FROM device_logs AS l LEFT JOIN devices d ON d\.id = l\.device_id WHERE l\.device_id = \$\d+ AND `+twoKeywords+` AND l\.self_generated = \$\d+ ORDER BY l\.log_timestamp desc LIMIT \$\d+`).
		WithArgs(1, "%HEARTBEAT%", "%HEARTBEAT%", "%DEBUG%", "%DEBUG%", false, 10).
		WillReturnRows(sqlmock.NewRows([]string{"id", "device_id", "message", "raw_message"}).
			AddRow(1, 1, "test message", "raw test message"))

	devID := 1
	rows, total, err := service.ListLogs(context.Background(), logs.LogFilter{
		DeviceID:      &devID,
		ExcludeSearch: nil, // 未提供单次过滤词，应当自动应用系统持久化的日志屏蔽关键字
		Limit:         10,
	})
	if err != nil {
		t.Fatalf("ListLogs() error = %v", err)
	}
	if total != 1 {
		t.Fatalf("ListLogs() total = %d, want 1", total)
	}
	if len(rows) != 1 {
		t.Fatalf("ListLogs() rows = %d, want 1", len(rows))
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestListLogs_CombinesPersistedAndRequestExcludeKeywords(t *testing.T) {
	db, mock, cleanup := newLogsGormDBWithSQLMock(t, sqlmock.QueryMatcherRegexp)
	defer cleanup()

	settingsService := settings.NewService(db, nil, config.Config{}, zap.NewNop())
	service := logs.NewService(db, zap.NewNop())
	service.SetSettings(settingsService)

	mock.ExpectQuery(`SELECT \* FROM "system_settings" WHERE key = \$1`).
		WithArgs("logs.exclude_keywords", sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"id", "key", "value", "category", "data_type"}).
			AddRow(1, "logs.exclude_keywords", "GLOBALKW", "logs", "string"))

	excludeClause := `\(\(COALESCE\(l\.message, ''\) NOT ILIKE \$\d+ AND COALESCE\(l\.raw_message, ''\) NOT ILIKE \$\d+\)\)`
	twoKeywords := excludeClause + ` AND ` + excludeClause

	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM device_logs AS l LEFT JOIN devices d ON d\.id = l\.device_id WHERE l\.device_id = \$\d+ AND `+twoKeywords+` AND l\.self_generated = \$\d+`).
		WithArgs(1, "%GLOBALKW%", "%GLOBALKW%", "%REQKW%", "%REQKW%", false).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))

	mock.ExpectQuery(`(?is)SELECT l\.\*, d\.name AS device_name, d\.ip_address AS device_ip FROM device_logs AS l LEFT JOIN devices d ON d\.id = l\.device_id WHERE l\.device_id = \$\d+ AND `+twoKeywords+` AND l\.self_generated = \$\d+ ORDER BY l\.log_timestamp desc LIMIT \$\d+`).
		WithArgs(1, "%GLOBALKW%", "%GLOBALKW%", "%REQKW%", "%REQKW%", false, 10).
		WillReturnRows(sqlmock.NewRows([]string{"id", "device_id", "message", "raw_message"}))

	devID := 1
	reqExclude := "REQKW"
	_, _, err := service.ListLogs(context.Background(), logs.LogFilter{
		DeviceID:      &devID,
		ExcludeSearch: &reqExclude,
		Limit:         10,
	})
	if err != nil {
		t.Fatalf("ListLogs() error = %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
