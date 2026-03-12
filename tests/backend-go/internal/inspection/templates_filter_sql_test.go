package inspection_test

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestListTemplates_ShouldFilterDeviceTypesForArrayAndObject(t *testing.T) {
	db, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(db, zap.NewNop())

	deviceTypeFilterPattern := `jsonb_typeof\(device_types\) = 'array'\s+AND\s+device_types @> .*jsonb_typeof\(device_types\) = 'object'\s+AND\s+COALESCE\(device_types->'device_types','\[\]'::jsonb\) @>`
	countSQL := `SELECT count\(\*\) FROM "inspection_templates".*` + deviceTypeFilterPattern
	selectSQL := `SELECT .* FROM "inspection_templates".*` + deviceTypeFilterPattern

	mock.ExpectQuery(countSQL).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(selectSQL).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "name", "description", "category", "device_types", "check_items", "is_default", "is_active", "created_at", "updated_at",
		}))

	_, err := svc.List(context.Background(), inspection.TemplateFilters{DeviceType: "router"}, inspection.Pagination{Page: 1, PageSize: 20})
	if err != nil {
		t.Fatalf("List: %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations: %v", err)
	}
}

func TestListTemplates_ShouldFilterVendorsForObjectDeviceTypes(t *testing.T) {
	db, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(db, zap.NewNop())

	vendorFilterPattern := `COALESCE\(device_types->'vendors','\[\]'::jsonb\) @>`
	countSQL := `SELECT count\(\*\) FROM "inspection_templates".*` + vendorFilterPattern
	selectSQL := `SELECT .* FROM "inspection_templates".*` + vendorFilterPattern

	mock.ExpectQuery(countSQL).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(selectSQL).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "name", "description", "category", "device_types", "check_items", "is_default", "is_active", "created_at", "updated_at",
		}))

	_, err := svc.List(context.Background(), inspection.TemplateFilters{Vendor: "Cisco"}, inspection.Pagination{Page: 1, PageSize: 20})
	if err != nil {
		t.Fatalf("List: %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations: %v", err)
	}
}

func newGormDBWithSqlmock(t *testing.T) (*gorm.DB, sqlmock.Sqlmock, func()) {
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

