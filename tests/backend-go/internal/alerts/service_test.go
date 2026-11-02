package alerts_test

import (
	"context"
	"reflect"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/alerts"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestNormalizeCategoryFilters(t *testing.T) {
	input := []string{
		" Security ",
		"performance",
		"hardware",
		"security",
		"OTHER",
		"",
	}

	got := alerts.NormalizeCategoryFilters(input)
	want := []string{"security", "performance", "hardware", "other"}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("NormalizeCategoryFilters() = %v, want %v", got, want)
	}
}

func TestNormalizeCategoryFilters_Empty(t *testing.T) {
	got := alerts.NormalizeCategoryFilters([]string{"", "   "})
	if len(got) != 0 {
		t.Fatalf("NormalizeCategoryFilters() expected empty result, got %v", got)
	}
}

func TestListAlerts_ShouldExcludeDeletedDeviceAlerts(t *testing.T) {
	db, mock, cleanup := newAlertsGormDBWithSQLMock(t)
	defer cleanup()

	service := alerts.NewService(db, zap.NewNop())

	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM alerts AS a JOIN devices d ON d\.id = a\.device_id LEFT JOIN alert_rules r ON r\.id = a\.rule_id`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))

	mock.ExpectQuery(`(?is)SELECT a\.\*, d\.name AS device_name, d\.ip_address AS device_ip, r\.name AS rule_name FROM alerts AS a JOIN devices d ON d\.id = a\.device_id LEFT JOIN alert_rules r ON r\.id = a\.rule_id`).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "device_id", "title", "message", "category", "severity", "status", "device_name", "device_ip", "rule_name",
		}))

	rows, total, err := service.ListAlerts(context.Background(), alerts.ListAlertsFilter{
		Page:     1,
		PageSize: 10,
	})
	if err != nil {
		t.Fatalf("ListAlerts() error = %v", err)
	}

	if total != 0 {
		t.Fatalf("ListAlerts() total = %d, want 0", total)
	}
	if len(rows) != 0 {
		t.Fatalf("ListAlerts() rows = %d, want 0", len(rows))
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestListAlerts_ActiveStatusFilterIncludesOpenAndAcknowledged(t *testing.T) {
	db, mock, cleanup := newAlertsGormDBWithSQLMock(t)
	defer cleanup()

	service := alerts.NewService(db, zap.NewNop())

	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM alerts AS a JOIN devices d ON d\.id = a\.device_id LEFT JOIN alert_rules r ON r\.id = a\.rule_id WHERE a\.status IN \(\$1,\$2\)`).
		WithArgs("open", "acknowledged").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(41))

	mock.ExpectQuery(`(?is)SELECT a\.\*, d\.name AS device_name, d\.ip_address AS device_ip, r\.name AS rule_name FROM alerts AS a JOIN devices d ON d\.id = a\.device_id LEFT JOIN alert_rules r ON r\.id = a\.rule_id WHERE a\.status IN \(\$1,\$2\)`).
		WithArgs("open", "acknowledged", 10).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "device_id", "title", "message", "category", "severity", "status", "device_name", "device_ip", "rule_name",
		}))

	_, total, err := service.ListAlerts(context.Background(), alerts.ListAlertsFilter{
		Page:     1,
		PageSize: 10,
		Statuses: []string{"active"},
	})
	if err != nil {
		t.Fatalf("ListAlerts() error = %v", err)
	}
	if total != 41 {
		t.Fatalf("ListAlerts() total = %d, want 41", total)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestListAlerts_ActiveStatusFilterDeduplicatesAcknowledged(t *testing.T) {
	db, mock, cleanup := newAlertsGormDBWithSQLMock(t)
	defer cleanup()

	service := alerts.NewService(db, zap.NewNop())

	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM alerts AS a JOIN devices d ON d\.id = a\.device_id LEFT JOIN alert_rules r ON r\.id = a\.rule_id WHERE a\.status IN \(\$1,\$2\)`).
		WithArgs("open", "acknowledged").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(12))

	mock.ExpectQuery(`(?is)SELECT a\.\*, d\.name AS device_name, d\.ip_address AS device_ip, r\.name AS rule_name FROM alerts AS a JOIN devices d ON d\.id = a\.device_id LEFT JOIN alert_rules r ON r\.id = a\.rule_id WHERE a\.status IN \(\$1,\$2\)`).
		WithArgs("open", "acknowledged", 10).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "device_id", "title", "message", "category", "severity", "status", "device_name", "device_ip", "rule_name",
		}))

	_, total, err := service.ListAlerts(context.Background(), alerts.ListAlertsFilter{
		Page:     1,
		PageSize: 10,
		Statuses: []string{"active", "acknowledged"},
	})
	if err != nil {
		t.Fatalf("ListAlerts() error = %v", err)
	}
	if total != 12 {
		t.Fatalf("ListAlerts() total = %d, want 12", total)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestListAlerts_OpenStatusFilterPreservesSingleOpenStatus(t *testing.T) {
	db, mock, cleanup := newAlertsGormDBWithSQLMock(t)
	defer cleanup()

	service := alerts.NewService(db, zap.NewNop())

	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM alerts AS a JOIN devices d ON d\.id = a\.device_id LEFT JOIN alert_rules r ON r\.id = a\.rule_id WHERE a\.status IN \(\$1\)`).
		WithArgs("open").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(5))

	mock.ExpectQuery(`(?is)SELECT a\.\*, d\.name AS device_name, d\.ip_address AS device_ip, r\.name AS rule_name FROM alerts AS a JOIN devices d ON d\.id = a\.device_id LEFT JOIN alert_rules r ON r\.id = a\.rule_id WHERE a\.status IN \(\$1\)`).
		WithArgs("open", 10).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "device_id", "title", "message", "category", "severity", "status", "device_name", "device_ip", "rule_name",
		}))

	_, total, err := service.ListAlerts(context.Background(), alerts.ListAlertsFilter{
		Page:     1,
		PageSize: 10,
		Statuses: []string{"open"},
	})
	if err != nil {
		t.Fatalf("ListAlerts() error = %v", err)
	}
	if total != 5 {
		t.Fatalf("ListAlerts() total = %d, want 5", total)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestListAlerts_ExcludeSearch_SingleKeyword(t *testing.T) {
	db, mock, cleanup := newAlertsGormDBWithSQLMock(t)
	defer cleanup()

	service := alerts.NewService(db, zap.NewNop())

	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM alerts AS a JOIN devices d ON d\.id = a\.device_id LEFT JOIN alert_rules r ON r\.id = a\.rule_id WHERE \({1,2}COALESCE\(a\.title, ''\) NOT ILIKE \$1 AND COALESCE\(a\.message, ''\) NOT ILIKE \$2 AND COALESCE\(d\.name, ''\) NOT ILIKE \$3 AND COALESCE\(CAST\(d\.ip_address AS TEXT\), ''\) NOT ILIKE \$4\){1,2}`).
		WithArgs("%test%", "%test%", "%test%", "%test%").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

	mock.ExpectQuery(`(?is)SELECT a\.\*, d\.name AS device_name, d\.ip_address AS device_ip, r\.name AS rule_name FROM alerts AS a JOIN devices d ON d\.id = a\.device_id LEFT JOIN alert_rules r ON r\.id = a\.rule_id WHERE \({1,2}COALESCE\(a\.title, ''\) NOT ILIKE \$1 AND COALESCE\(a\.message, ''\) NOT ILIKE \$2 AND COALESCE\(d\.name, ''\) NOT ILIKE \$3 AND COALESCE\(CAST\(d\.ip_address AS TEXT\), ''\) NOT ILIKE \$4\){1,2}`).
		WithArgs("%test%", "%test%", "%test%", "%test%", 10).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "device_id", "title", "message", "category", "severity", "status", "device_name", "device_ip", "rule_name",
		}))

	_, total, err := service.ListAlerts(context.Background(), alerts.ListAlertsFilter{
		Page:          1,
		PageSize:      10,
		ExcludeSearch: "test",
	})
	if err != nil {
		t.Fatalf("ListAlerts() error = %v", err)
	}
	if total != 1 {
		t.Fatalf("ListAlerts() total = %d, want 1", total)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestListAlerts_ExcludeSearch_MultipleKeywordsAndWildcardEscape(t *testing.T) {
	db, mock, cleanup := newAlertsGormDBWithSQLMock(t)
	defer cleanup()

	service := alerts.NewService(db, zap.NewNop())

	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM alerts AS a JOIN devices d ON d\.id = a\.device_id LEFT JOIN alert_rules r ON r\.id = a\.rule_id WHERE \({1,2}COALESCE\(a\.title, ''\) NOT ILIKE \$1 AND COALESCE\(a\.message, ''\) NOT ILIKE \$2 AND COALESCE\(d\.name, ''\) NOT ILIKE \$3 AND COALESCE\(CAST\(d\.ip_address AS TEXT\), ''\) NOT ILIKE \$4\){1,2} AND \({1,2}COALESCE\(a\.title, ''\) NOT ILIKE \$5 AND COALESCE\(a\.message, ''\) NOT ILIKE \$6 AND COALESCE\(d\.name, ''\) NOT ILIKE \$7 AND COALESCE\(CAST\(d\.ip_address AS TEXT\), ''\) NOT ILIKE \$8\){1,2}`).
		WithArgs(`%100\%%`, `%100\%%`, `%100\%%`, `%100\%%`, `%\_down%`, `%\_down%`, `%\_down%`, `%\_down%`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(2))

	mock.ExpectQuery(`(?is)SELECT a\.\*, d\.name AS device_name, d\.ip_address AS device_ip, r\.name AS rule_name FROM alerts AS a JOIN devices d ON d\.id = a\.device_id LEFT JOIN alert_rules r ON r\.id = a\.rule_id WHERE \({1,2}COALESCE\(a\.title, ''\) NOT ILIKE \$1 AND COALESCE\(a\.message, ''\) NOT ILIKE \$2 AND COALESCE\(d\.name, ''\) NOT ILIKE \$3 AND COALESCE\(CAST\(d\.ip_address AS TEXT\), ''\) NOT ILIKE \$4\){1,2} AND \({1,2}COALESCE\(a\.title, ''\) NOT ILIKE \$5 AND COALESCE\(a\.message, ''\) NOT ILIKE \$6 AND COALESCE\(d\.name, ''\) NOT ILIKE \$7 AND COALESCE\(CAST\(d\.ip_address AS TEXT\), ''\) NOT ILIKE \$8\){1,2}`).
		WithArgs(`%100\%%`, `%100\%%`, `%100\%%`, `%100\%%`, `%\_down%`, `%\_down%`, `%\_down%`, `%\_down%`, 10).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "device_id", "title", "message", "category", "severity", "status", "device_name", "device_ip", "rule_name",
		}))

	_, total, err := service.ListAlerts(context.Background(), alerts.ListAlertsFilter{
		Page:          1,
		PageSize:      10,
		ExcludeSearch: "100%, _down, 100%",
	})
	if err != nil {
		t.Fatalf("ListAlerts() error = %v", err)
	}
	if total != 2 {
		t.Fatalf("ListAlerts() total = %d, want 2", total)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func newAlertsGormDBWithSQLMock(t *testing.T) (*gorm.DB, sqlmock.Sqlmock, func()) {
	t.Helper()

	sqlDB, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherRegexp))
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}

	gormDB, err := gorm.Open(postgres.New(postgres.Config{
		Conn:                 sqlDB,
		PreferSimpleProtocol: true,
	}), &gorm.Config{
		SkipDefaultTransaction: true,
		DisableAutomaticPing:   true,
	})
	if err != nil {
		_ = sqlDB.Close()
		t.Fatalf("gorm.Open: %v", err)
	}

	cleanup := func() {
		_ = sqlDB.Close()
	}
	return gormDB, mock, cleanup
}

// 统计卡与顶栏角标必须与列表同口径：传入屏蔽关键字时，六条统计查询每条都要带上 NOT ILIKE 子句，
// 且关键字中的 LIKE 元字符要被转义（50% 不能变成通配匹配）。
func TestGetAlertStatistics_ExcludeSearch_AppliesToEveryQuery(t *testing.T) {
	db, mock, cleanup := newAlertsGormDBWithSQLMock(t)
	defer cleanup()

	service := alerts.NewService(db, zap.NewNop())

	excludeClause := `\(\(COALESCE\(a\.title, ''\) NOT ILIKE \$\d+ AND COALESCE\(a\.message, ''\) NOT ILIKE \$\d+ AND COALESCE\(d\.name, ''\) NOT ILIKE \$\d+ AND COALESCE\(CAST\(d\.ip_address AS TEXT\), ''\) NOT ILIKE \$\d+\)\)`
	twoKeywords := excludeClause + ` AND ` + excludeClause

	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM alerts AS a JOIN devices d ON d\.id = a\.device_id WHERE `+twoKeywords).
		WithArgs("%NTP%", "%NTP%", "%NTP%", "%NTP%", `%50\%%`, `%50\%%`, `%50\%%`, `%50\%%`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM alerts AS a JOIN devices d ON d\.id = a\.device_id WHERE ` + twoKeywords + ` AND a\.status IN`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM alerts AS a JOIN devices d ON d\.id = a\.device_id WHERE ` + twoKeywords + ` AND a\.status = `).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM alerts AS a JOIN devices d ON d\.id = a\.device_id WHERE ` + twoKeywords + ` AND a\.status IN`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`(?is)SELECT severity, COUNT\(\*\) as count FROM alerts AS a JOIN devices d ON d\.id = a\.device_id WHERE ` + twoKeywords + ` AND a\.status IN .* GROUP BY "severity"`).
		WillReturnRows(sqlmock.NewRows([]string{"severity", "count"}))
	mock.ExpectQuery(`(?is)SELECT category, COUNT\(\*\) as count FROM alerts AS a JOIN devices d ON d\.id = a\.device_id WHERE ` + twoKeywords + ` AND a\.status IN .* GROUP BY "category"`).
		WillReturnRows(sqlmock.NewRows([]string{"category", "count"}))
	mock.ExpectQuery(`(?is)SELECT a\.device_id, d\.name AS device_name, COUNT\(\*\) as count FROM alerts AS a JOIN devices d ON d\.id = a\.device_id WHERE ` + twoKeywords + ` AND a\.status IN .* GROUP BY a\.device_id, d\.name ORDER BY count desc LIMIT`).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "device_name", "count"}))

	if _, err := service.GetAlertStatistics(context.Background(), alerts.AlertStatisticsFilter{ExcludeSearch: "NTP,50%"}); err != nil {
		t.Fatalf("GetAlertStatistics() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
