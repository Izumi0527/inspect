package logs_test

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/config"
	"github.com/your-org/inspect-system/backend-go/internal/logs"
	"github.com/your-org/inspect-system/backend-go/internal/settings"
	"go.uber.org/zap"
)

const sixColExcludeClause = `\(\(COALESCE\(l\.message, ''\) NOT ILIKE \$\d+ AND COALESCE\(l\.raw_message, ''\) NOT ILIKE \$\d+ AND COALESCE\(d\.name, ''\) NOT ILIKE \$\d+ AND COALESCE\(CAST\(d\.ip_address AS TEXT\), ''\) NOT ILIKE \$\d+ AND COALESCE\(l\.source_process, ''\) NOT ILIKE \$\d+ AND COALESCE\(l\.facility, ''\) NOT ILIKE \$\d+\)\)`

func TestListLogs_AutomaticallyAppliesPersistedExcludeKeywords(t *testing.T) {
	db, mock, cleanup := newLogsGormDBWithSQLMock(t, sqlmock.QueryMatcherRegexp)
	defer cleanup()

	settingsService := settings.NewService(db, nil, config.Config{}, zap.NewNop())
	service := logs.NewService(db, zap.NewNop())
	service.SetSettings(settingsService)

	mock.ExpectQuery(`SELECT \* FROM "system_settings" WHERE key = \$1`).
		WithArgs("logs.exclude_keywords", sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"id", "key", "value", "category", "data_type"}).
			AddRow(1, "logs.exclude_keywords", "MYKW1,MYKW2", "logs", "string"))

	twoKeywords := sixColExcludeClause + ` AND ` + sixColExcludeClause

	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM device_logs AS l LEFT JOIN devices d ON d\.id = l\.device_id WHERE l\.device_id = \$\d+ AND `+twoKeywords+` AND l\.self_generated = \$\d+`).
		WithArgs(1, "%MYKW1%", "%MYKW1%", "%MYKW1%", "%MYKW1%", "%MYKW1%", "%MYKW1%", "%MYKW2%", "%MYKW2%", "%MYKW2%", "%MYKW2%", "%MYKW2%", "%MYKW2%", false).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

	mock.ExpectQuery(`(?is)SELECT l\.\*, d\.name AS device_name, d\.ip_address AS device_ip FROM device_logs AS l LEFT JOIN devices d ON d\.id = l\.device_id WHERE l\.device_id = \$\d+ AND `+twoKeywords+` AND l\.self_generated = \$\d+ ORDER BY l\.log_timestamp desc LIMIT \$\d+`).
		WithArgs(1, "%MYKW1%", "%MYKW1%", "%MYKW1%", "%MYKW1%", "%MYKW1%", "%MYKW1%", "%MYKW2%", "%MYKW2%", "%MYKW2%", "%MYKW2%", "%MYKW2%", "%MYKW2%", false, 10).
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

	twoKeywords := sixColExcludeClause + ` AND ` + sixColExcludeClause

	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM device_logs AS l LEFT JOIN devices d ON d\.id = l\.device_id WHERE l\.device_id = \$\d+ AND `+twoKeywords+` AND l\.self_generated = \$\d+`).
		WithArgs(1, "%GLOBALKW%", "%GLOBALKW%", "%GLOBALKW%", "%GLOBALKW%", "%GLOBALKW%", "%GLOBALKW%", "%REQKW%", "%REQKW%", "%REQKW%", "%REQKW%", "%REQKW%", "%REQKW%", false).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))

	mock.ExpectQuery(`(?is)SELECT l\.\*, d\.name AS device_name, d\.ip_address AS device_ip FROM device_logs AS l LEFT JOIN devices d ON d\.id = l\.device_id WHERE l\.device_id = \$\d+ AND `+twoKeywords+` AND l\.self_generated = \$\d+ ORDER BY l\.log_timestamp desc LIMIT \$\d+`).
		WithArgs(1, "%GLOBALKW%", "%GLOBALKW%", "%GLOBALKW%", "%GLOBALKW%", "%GLOBALKW%", "%GLOBALKW%", "%REQKW%", "%REQKW%", "%REQKW%", "%REQKW%", "%REQKW%", "%REQKW%", false, 10).
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

func TestGetLogStatisticsWithExclude_MatchesListLogsFiltering(t *testing.T) {
	db, mock, cleanup := newLogsGormDBWithSQLMock(t, sqlmock.QueryMatcherRegexp)
	defer cleanup()

	service := logs.NewService(db, zap.NewNop())

	fromJoinWhere := `FROM device_logs AS l LEFT JOIN devices d ON d\.id = l\.device_id WHERE l\.log_timestamp >= \$\d+ AND l\.self_generated = \$\d+ AND l\.device_id = \$\d+ AND ` + sixColExcludeClause

	mock.ExpectQuery(`(?is)SELECT count\(\*\) `+fromJoinWhere).
		WithArgs(sqlmock.AnyArg(), false, 7, "%NTP%", "%NTP%", "%NTP%", "%NTP%", "%NTP%", "%NTP%").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(3))

	mock.ExpectQuery(`(?is)SELECT l\.level AS key, COUNT\(\*\) AS count `+fromJoinWhere+` GROUP BY "?l"?\."?level"?`).
		WithArgs(sqlmock.AnyArg(), false, 7, "%NTP%", "%NTP%", "%NTP%", "%NTP%", "%NTP%", "%NTP%").
		WillReturnRows(sqlmock.NewRows([]string{"key", "count"}).AddRow("warning", 3))

	mock.ExpectQuery(`(?is)SELECT l\.facility AS key, COUNT\(\*\) AS count `+fromJoinWhere+` GROUP BY "?l"?\."?facility"?`).
		WithArgs(sqlmock.AnyArg(), false, 7, "%NTP%", "%NTP%", "%NTP%", "%NTP%", "%NTP%", "%NTP%").
		WillReturnRows(sqlmock.NewRows([]string{"key", "count"}).AddRow("system", 3))

	now := time.Now().UTC().Truncate(time.Hour)
	mock.ExpectQuery(`(?is)SELECT date_trunc\('hour', l\.log_timestamp AT TIME ZONE '[^']+'\) AT TIME ZONE '[^']+' AS hour, COUNT\(\*\) AS count `+fromJoinWhere+` GROUP BY "?hour"? ORDER BY "?hour"?`).
		WithArgs(sqlmock.AnyArg(), false, 7, "%NTP%", "%NTP%", "%NTP%", "%NTP%", "%NTP%", "%NTP%").
		WillReturnRows(sqlmock.NewRows([]string{"hour", "count"}).AddRow(now, 3))

	devID := 7
	reqExclude := "NTP"
	stats, err := service.GetLogStatisticsWithExclude(context.Background(), &devID, 24, &reqExclude)
	if err != nil {
		t.Fatalf("GetLogStatisticsWithExclude() error = %v", err)
	}
	if stats.TotalLogs != 3 || stats.ByLevel["warning"] != 3 || stats.ByFacility["system"] != 3 {
		t.Fatalf("unexpected stats: %+v", stats)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestListLogs_CompilesTrapOIDAndPlainRuleSQLClauses(t *testing.T) {
	db, mock, cleanup := newLogsGormDBWithSQLMock(t, sqlmock.QueryMatcherRegexp)
	defer cleanup()

	service := logs.NewService(db, zap.NewNop())

	trapClause := `NOT \(replace\(COALESCE\(substring\(COALESCE\(l\.message, ''\) FROM '\(\[0-9\]\+\(\\\.\[0-9\]\+\)\{5,\}\)'\), ''\), '1\.3\.6\.1\.4\.1\.56813\.', '1\.3\.6\.1\.4\.1\.2011\.'\) = ANY\(string_to_array\(\$\d+, ','\)\)\)`
	ruleClause := `NOT \(COALESCE\(l\.message, ''\) ~\* \$\d+\)`

	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM device_logs AS l LEFT JOIN devices d ON d\.id = l\.device_id WHERE l\.device_id = \$\d+ AND `+sixColExcludeClause+` AND `+sixColExcludeClause+` AND `+ruleClause+` AND `+trapClause+` AND l\.self_generated = \$\d+`).
		WithArgs(
			1,
			"%hwFanFail%", "%hwFanFail%", "%hwFanFail%", "%hwFanFail%", "%hwFanFail%", "%hwFanFail%",
			"%半双工%", "%半双工%", "%半双工%", "%半双工%", "%半双工%", "%半双工%",
			sqlmock.AnyArg(),
			sqlmock.AnyArg(),
			false,
		).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))

	mock.ExpectQuery(`(?is)SELECT l\.\*, d\.name AS device_name, d\.ip_address AS device_ip FROM device_logs AS l LEFT JOIN devices d ON d\.id = l\.device_id WHERE l\.device_id = \$\d+ AND `+sixColExcludeClause+` AND `+sixColExcludeClause+` AND `+ruleClause+` AND `+trapClause+` AND l\.self_generated = \$\d+ ORDER BY l\.log_timestamp desc LIMIT \$\d+`).
		WithArgs(
			1,
			"%hwFanFail%", "%hwFanFail%", "%hwFanFail%", "%hwFanFail%", "%hwFanFail%", "%hwFanFail%",
			"%半双工%", "%半双工%", "%半双工%", "%半双工%", "%半双工%", "%半双工%",
			sqlmock.AnyArg(),
			sqlmock.AnyArg(),
			false,
			10,
		).
		WillReturnRows(sqlmock.NewRows([]string{"id", "device_id", "message", "raw_message"}))

	devID := 1
	reqExclude := "hwFanFail,半双工"
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
