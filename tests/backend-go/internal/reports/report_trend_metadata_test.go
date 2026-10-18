package reports_test

// 趋势报告元数据（生成人 / 生成时间）的解析守卫：UUID 必须解析成可读
// 名称、带时区的时间戳必须转业务时区可读格式，且缺数据库时原样保留
// 而不是静默变空。

import (
	"context"
	"strings"
	"testing"
	"time"
	_ "unsafe"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/reports"
	"gorm.io/datatypes"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

//go:linkname normalizeReportTimestamp github.com/your-org/inspect-system/backend-go/internal/reports.normalizeReportTimestamp
func normalizeReportTimestamp(raw string, loc *time.Location) string

//go:linkname resolveReportCreatorName github.com/your-org/inspect-system/backend-go/internal/reports.resolveReportCreatorName
func resolveReportCreatorName(ctx context.Context, db *gorm.DB, report reports.Report) string

//go:linkname reportDisplayLocation github.com/your-org/inspect-system/backend-go/internal/reports.reportDisplayLocation
func reportDisplayLocation(ctx context.Context, db *gorm.DB) *time.Location

func newReportsDBWithSqlmock(t *testing.T) (*gorm.DB, sqlmock.Sqlmock, func()) {
	t.Helper()
	sqlDB, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherEqual))
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
	return gormDB, mock, func() { _ = sqlDB.Close() }
}

func TestNormalizeReportTimestamp(t *testing.T) {
	shanghai, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		t.Skipf("当前环境缺少时区数据: %v", err)
	}

	// 生成侧历史格式：UTC RFC3339 → 业务时区可读格式
	if got := normalizeReportTimestamp("2026-10-18T13:23:03Z", shanghai); got != "2026-10-18 21:23:03" {
		t.Errorf("UTC RFC3339 未按业务时区转换: %q", got)
	}
	// 带偏移的 RFC3339 同样换算
	if got := normalizeReportTimestamp("2026-10-18T21:23:03+08:00", shanghai); got != "2026-10-18 21:23:03" {
		t.Errorf("带偏移时间换算错误: %q", got)
	}
	// 已是可读格式：原样返回，不做二次解释
	if got := normalizeReportTimestamp("2026-10-18 19:00:00", shanghai); got != "2026-10-18 19:00:00" {
		t.Errorf("可读格式应原样保留: %q", got)
	}
	// 无法解析的输入：原样返回，不丢信息
	if got := normalizeReportTimestamp("不是时间", shanghai); got != "不是时间" {
		t.Errorf("不可解析输入应原样保留: %q", got)
	}
	if got := normalizeReportTimestamp("", shanghai); got != "" {
		t.Errorf("空输入应为空串: %q", got)
	}
}

func TestResolveReportCreatorName_PrefersFullName(t *testing.T) {
	const creatorQuery = `SELECT COALESCE(NULLIF(TRIM(full_name), ''), username) AS name FROM users WHERE id = $1 LIMIT 1`

	db, mock, cleanup := newReportsDBWithSqlmock(t)
	defer cleanup()

	creatorID := "dff7f0df-baca-464e-900b-87ed6e4c9a01"
	report := reports.Report{GeneratedBy: &creatorID}

	// 全名优先：与报表列表 attachReportCreatorNames 同口径
	mock.ExpectQuery(creatorQuery).WillReturnRows(sqlmock.NewRows([]string{"name"}).AddRow("张运维"))
	if got := resolveReportCreatorName(context.Background(), db, report); got != "张运维" {
		t.Errorf("应返回全名: %q", got)
	}

	// 查不到用户行：保留原始标识（UUID），不静默变空
	mock.ExpectQuery(creatorQuery).WillReturnRows(sqlmock.NewRows([]string{"name"}))
	if got := resolveReportCreatorName(context.Background(), db, report); got != creatorID {
		t.Errorf("查不到时应保留原值: %q", got)
	}

	// 无数据库（如单元测试/离线渲染）：保留原值
	if got := resolveReportCreatorName(context.Background(), nil, report); got != creatorID {
		t.Errorf("db 为 nil 时应保留原值: %q", got)
	}

	// 未设置生成人：空串
	if got := resolveReportCreatorName(context.Background(), db, reports.Report{}); got != "" {
		t.Errorf("未设置生成人应为空串: %q", got)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("SQL 期望未满足: %v", err)
	}
}

func TestReportDisplayLocation_FallsBackToBusinessTimezone(t *testing.T) {
	const tzQuery = `SELECT COALESCE(value, '') FROM system_settings WHERE key = 'system.timezone' LIMIT 1`

	db, mock, cleanup := newReportsDBWithSqlmock(t)
	defer cleanup()

	mock.ExpectQuery(tzQuery).WillReturnRows(sqlmock.NewRows([]string{"value"}).AddRow("Asia/Shanghai"))
	if loc := reportDisplayLocation(context.Background(), db); loc == nil || loc.String() != "Asia/Shanghai" {
		t.Errorf("应读取 system.timezone: %v", loc)
	}

	// 非法时区名：退回默认业务时区而不是报错
	mock.ExpectQuery(tzQuery).WillReturnRows(sqlmock.NewRows([]string{"value"}).AddRow("Not/AZone"))
	loc := reportDisplayLocation(context.Background(), db)
	if loc == nil || loc.String() == "Not/AZone" {
		t.Errorf("非法时区名应回退默认: %v", loc)
	}

	// 无数据库：仍是默认业务时区（不 panic）
	if loc := reportDisplayLocation(context.Background(), nil); loc == nil {
		t.Errorf("db 为 nil 时不应返回 nil")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("SQL 期望未满足: %v", err)
	}
}

// 端到端：HTML 产物是明文，可直接断言生成人显示为名称而非 UUID。
func TestTrendReport_HTMLLocalizesCreatorAndTimestamp(t *testing.T) {
	const tzQuery = `SELECT COALESCE(value, '') FROM system_settings WHERE key = 'system.timezone' LIMIT 1`
	const creatorQuery = `SELECT COALESCE(NULLIF(TRIM(full_name), ''), username) AS name FROM users WHERE id = $1 LIMIT 1`

	db, mock, cleanup := newReportsDBWithSqlmock(t)
	defer cleanup()

	mock.ExpectQuery(tzQuery).WillReturnRows(sqlmock.NewRows([]string{"value"}).AddRow("Asia/Shanghai"))
	mock.ExpectQuery(creatorQuery).WillReturnRows(sqlmock.NewRows([]string{"name"}).AddRow("张运维"))

	creatorID := "dff7f0df-baca-464e-900b-87ed6e4c9a01"
	report := reports.Report{
		ID:            9400,
		Title:         "趋势分析报告 - 2026-10-18",
		ReportType:    "trend",
		GeneratedBy:   &creatorID,
		DeviceFilters: datatypes.JSON([]byte(trendSamplePayload)),
	}
	path, err := reports.GenerateReportFile(context.Background(), db, t.TempDir(), report, "html")
	if err != nil {
		if strings.Contains(err.Error(), "未找到可用的PDF中文字体") {
			t.Skipf("当前环境缺少字体: %v", err)
		}
		t.Fatalf("GenerateReportFile: %v", err)
	}
	body, err := readReportText(t, path, "html"), error(nil)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(body, "张运维") {
		t.Errorf("产物应显示生成人名称")
	}
	if strings.Contains(body, creatorID) {
		t.Errorf("产物不应显示生成人 UUID")
	}
	// 时间戳：样本 payload 写的是 RFC3339 UTC，产物应为业务时区可读格式
	if strings.Contains(body, "2026-10-18T19:00:00Z") {
		t.Errorf("产物不应保留机器格式时间戳")
	}
	if !strings.Contains(body, "2026-10-19 03:00:00") {
		t.Errorf("生成时间应按业务时区(+8)呈现")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("SQL 期望未满足: %v", err)
	}
}

// 通用报表（custom/alert/performance 走 generic 渲染）此前直接打印
// report.generated_by 的 UUID。同一个「报表概览」表不应有两套口径：
// 生成人解析、生成时间业务时区化，在 generic 路径同样必须成立。
func TestGenericReport_LocalizesCreatorAndTimestamp(t *testing.T) {
	const tzQuery = `SELECT COALESCE(value, '') FROM system_settings WHERE key = 'system.timezone' LIMIT 1`
	const creatorQuery = `SELECT COALESCE(NULLIF(TRIM(full_name), ''), username) AS name FROM users WHERE id = $1 LIMIT 1`

	db, mock, cleanup := newReportsDBWithSqlmock(t)
	defer cleanup()

	mock.ExpectQuery(tzQuery).WillReturnRows(sqlmock.NewRows([]string{"value"}).AddRow("Asia/Shanghai"))
	mock.ExpectQuery(creatorQuery).WillReturnRows(sqlmock.NewRows([]string{"name"}).AddRow("张运维"))

	creatorID := "dff7f0df-baca-464e-900b-87ed6e4c9a01"
	generatedAt := time.Date(2026, 10, 18, 11, 23, 3, 0, time.UTC)
	report := reports.Report{
		ID:          9500,
		Title:       "自定义报表",
		ReportType:  "custom",
		GeneratedBy: &creatorID,
		GeneratedAt: &generatedAt,
		DeviceFilters: datatypes.JSON([]byte(`{
			"generic_data": {
				"report_name": "自定义报表",
				"generated_at": "2026-10-18T19:00:00Z",
				"summary": {"total": 7}
			}
		}`)),
	}
	path, err := reports.GenerateReportFile(context.Background(), db, t.TempDir(), report, "html")
	if err != nil {
		if strings.Contains(err.Error(), "未找到可用的PDF中文字体") {
			t.Skipf("当前环境缺少字体: %v", err)
		}
		t.Fatalf("GenerateReportFile: %v", err)
	}
	body := readReportText(t, path, "html")
	if !strings.Contains(body, "张运维") {
		t.Errorf("通用报表应显示生成人名称")
	}
	if strings.Contains(body, creatorID) {
		t.Errorf("通用报表不应显示生成人 UUID")
	}
	if !strings.Contains(body, "2026-10-19 03:00:00") {
		t.Errorf("通用报表生成时间应按业务时区呈现")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("SQL 期望未满足: %v", err)
	}
}
