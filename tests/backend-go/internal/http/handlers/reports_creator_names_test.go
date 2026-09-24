package handlers_test

import (
	"context"
	"testing"
	_ "unsafe"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/gorm"
)

//go:linkname attachReportCreatorNames github.com/your-org/inspect-system/backend-go/internal/http/handlers.attachReportCreatorNames
func attachReportCreatorNames(ctx context.Context, db *gorm.DB, items []map[string]interface{})

// 报表列表的创建人原先直接显示用户 UUID：按页批量解析成全名（无全名用用户名），
// 系统生成（generated_by 为空）与已删除用户不写 created_by_name，由前端兜底。
func TestAttachReportCreatorNames_ResolvesFullNameThenUsername(t *testing.T) {
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	alice, bob, gone := "u-alice", "u-bob", "u-gone"
	items := []map[string]interface{}{
		{"generated_by": &alice},
		{"generated_by": &bob},
		{"generated_by": &gone},
		{"generated_by": (*string)(nil)},
	}
	mock.ExpectQuery(`SELECT id, username, full_name FROM "users" WHERE id IN \(\$1,\$2,\$3\)`).
		WithArgs(alice, bob, gone).
		WillReturnRows(sqlmock.NewRows([]string{"id", "username", "full_name"}).
			AddRow(alice, "alice", "张三").
			AddRow(bob, "bob", nil))

	attachReportCreatorNames(context.Background(), gormDB, items)

	if items[0]["created_by_name"] != "张三" || items[1]["created_by_name"] != "bob" {
		t.Fatalf("names = %v / %v, want 张三 / bob", items[0]["created_by_name"], items[1]["created_by_name"])
	}
	for _, idx := range []int{2, 3} {
		if _, ok := items[idx]["created_by_name"]; ok {
			t.Fatalf("items[%d] 不应写 created_by_name", idx)
		}
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

// 整页都是系统生成的报告时不发查询。
func TestAttachReportCreatorNames_NoCreatorsNoQuery(t *testing.T) {
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	attachReportCreatorNames(context.Background(), gormDB, []map[string]interface{}{{"generated_by": (*string)(nil)}})

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
