package logs_test

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/logs"
	"go.uber.org/zap"
)

// SSHHostKeyStore.Get / Delete 是设备详情页「重置指纹」的管理面入口：
// 查询返回当前记录（尚未记录时返回 nil），删除幂等（尚未记录时不报错）。
// 采集链路 verifyOrRecord 的 TOFU 校验语义不受影响。

func TestSSHHostKeyStore_GetReturnsRecord(t *testing.T) {
	db, mock, cleanup := newLogsGormDBWithSQLMock(t, sqlmock.QueryMatcherRegexp)
	defer cleanup()
	store := logs.NewSSHHostKeyStore(db, zap.NewNop())

	mock.ExpectQuery(`FROM "device_ssh_host_keys" WHERE device_id = \$1`).
		WithArgs(21, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "device_id", "fingerprint", "algorithm"}).
			AddRow(4, 21, "SHA256:abc", "ssh-rsa"))

	record, err := store.Get(context.Background(), 21)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if record == nil {
		t.Fatal("已有记录时 Get 应返回记录")
	}
	if record.Fingerprint != "SHA256:abc" || record.Algorithm != "ssh-rsa" {
		t.Fatalf("记录内容不符: %+v", record)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestSSHHostKeyStore_GetMissingReturnsNil(t *testing.T) {
	db, mock, cleanup := newLogsGormDBWithSQLMock(t, sqlmock.QueryMatcherRegexp)
	defer cleanup()
	store := logs.NewSSHHostKeyStore(db, zap.NewNop())

	mock.ExpectQuery(`FROM "device_ssh_host_keys" WHERE device_id = \$1`).
		WithArgs(21, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "device_id", "fingerprint", "algorithm"}))

	record, err := store.Get(context.Background(), 21)
	if err != nil {
		t.Fatalf("尚未记录时 Get 不应报错: %v", err)
	}
	if record != nil {
		t.Fatalf("尚未记录时 Get 应返回 nil，实际: %+v", record)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestSSHHostKeyStore_DeleteRemovesRow(t *testing.T) {
	db, mock, cleanup := newLogsGormDBWithSQLMock(t, sqlmock.QueryMatcherRegexp)
	defer cleanup()
	store := logs.NewSSHHostKeyStore(db, zap.NewNop())

	mock.ExpectExec(`DELETE FROM "device_ssh_host_keys" WHERE device_id = \$1`).
		WithArgs(21).
		WillReturnResult(sqlmock.NewResult(0, 1))

	deleted, err := store.Delete(context.Background(), 21)
	if err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if !deleted {
		t.Fatal("删除一行时应返回 deleted=true")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestSSHHostKeyStore_DeleteMissingIsIdempotent(t *testing.T) {
	db, mock, cleanup := newLogsGormDBWithSQLMock(t, sqlmock.QueryMatcherRegexp)
	defer cleanup()
	store := logs.NewSSHHostKeyStore(db, zap.NewNop())

	mock.ExpectExec(`DELETE FROM "device_ssh_host_keys" WHERE device_id = \$1`).
		WithArgs(21).
		WillReturnResult(sqlmock.NewResult(0, 0))

	deleted, err := store.Delete(context.Background(), 21)
	if err != nil {
		t.Fatalf("尚未记录时 Delete 应幂等成功: %v", err)
	}
	if deleted {
		t.Fatal("未删除任何行时 deleted 应为 false")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestSSHHostKeyStore_NilStoreRejectsOperations(t *testing.T) {
	store := logs.NewSSHHostKeyStore(nil, zap.NewNop())

	if _, err := store.Get(context.Background(), 21); err == nil {
		t.Fatal("未配置数据库时 Get 应返回错误")
	}
	if _, err := store.Delete(context.Background(), 21); err == nil {
		t.Fatal("未配置数据库时 Delete 应返回错误")
	}
}
