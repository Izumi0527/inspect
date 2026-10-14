package sshutil_test

import (
	"context"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rand"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/sshutil"
	"go.uber.org/zap"
	"golang.org/x/crypto/ssh"
)

// SSHHostKeyStore 的 TOFU 校验与指纹管理：
// Get/Delete 是设备详情页「重置指纹」的管理面入口（一设备多算法各一条记录）；
// verifyOrRecord 经 HostKeyCallbackFor 供日志采集/连接测试/配置备份/巡检统一使用；
// 指纹不一致时通知告警桥、重置记录时解除该设备的告警。

type fakeHostKeyNotifier struct {
	notified []sshutil.HostKeyMismatch
	resolved []int
}

func (n *fakeHostKeyNotifier) NotifyHostKeyMismatch(_ context.Context, mismatch sshutil.HostKeyMismatch) error {
	n.notified = append(n.notified, mismatch)
	return nil
}

func (n *fakeHostKeyNotifier) ResolveHostKeyMismatch(_ context.Context, deviceID int) error {
	n.resolved = append(n.resolved, deviceID)
	return nil
}

func setFakeNotifier(t *testing.T, n sshutil.HostKeyAlertNotifier) {
	t.Helper()
	sshutil.SetHostKeyAlertNotifier(n)
	t.Cleanup(func() { sshutil.SetHostKeyAlertNotifier(nil) })
}

func newEd25519PublicKey(t *testing.T) ssh.PublicKey {
	t.Helper()
	pub, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	key, err := ssh.NewPublicKey(pub)
	if err != nil {
		t.Fatalf("NewPublicKey: %v", err)
	}
	return key
}

func newECDSAPublicKey(t *testing.T) ssh.PublicKey {
	t.Helper()
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	key, err := ssh.NewPublicKey(&priv.PublicKey)
	if err != nil {
		t.Fatalf("NewPublicKey: %v", err)
	}
	return key
}

func TestSSHHostKeyStore_GetReturnsAllAlgorithmRecords(t *testing.T) {
	db, mock, cleanup := newSSHUtilGormDBWithSQLMock(t)
	defer cleanup()
	store := sshutil.NewSSHHostKeyStore(db, zap.NewNop())

	mock.ExpectQuery(`FROM "device_ssh_host_keys" WHERE device_id = \$1`).
		WithArgs(21).
		WillReturnRows(sqlmock.NewRows([]string{"id", "device_id", "fingerprint", "algorithm"}).
			AddRow(5, 21, "SHA256:rsa", "ssh-rsa").
			AddRow(6, 21, "SHA256:ecdsa", "ecdsa-sha2-nistp256"))

	records, err := store.Get(context.Background(), 21)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if len(records) != 2 {
		t.Fatalf("records = %d, want 2", len(records))
	}
	if records[0].Algorithm != "ssh-rsa" || records[1].Algorithm != "ecdsa-sha2-nistp256" {
		t.Fatalf("records = %+v", records)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestSSHHostKeyStore_GetMissingReturnsEmpty(t *testing.T) {
	db, mock, cleanup := newSSHUtilGormDBWithSQLMock(t)
	defer cleanup()
	store := sshutil.NewSSHHostKeyStore(db, zap.NewNop())

	mock.ExpectQuery(`FROM "device_ssh_host_keys" WHERE device_id = \$1`).
		WithArgs(21).
		WillReturnRows(sqlmock.NewRows([]string{"id", "device_id", "fingerprint", "algorithm"}))

	records, err := store.Get(context.Background(), 21)
	if err != nil {
		t.Fatalf("尚未记录时 Get 不应报错: %v", err)
	}
	if len(records) != 0 {
		t.Fatalf("尚未记录时 Get 应返回空列表，实际: %+v", records)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestSSHHostKeyStore_DeleteRemovesRowsAndResolvesAlert(t *testing.T) {
	db, mock, cleanup := newSSHUtilGormDBWithSQLMock(t)
	defer cleanup()
	store := sshutil.NewSSHHostKeyStore(db, zap.NewNop())
	notifier := &fakeHostKeyNotifier{}
	setFakeNotifier(t, notifier)

	mock.ExpectExec(`DELETE FROM "device_ssh_host_keys" WHERE device_id = \$1`).
		WithArgs(21).
		WillReturnResult(sqlmock.NewResult(0, 2))

	deleted, err := store.Delete(context.Background(), 21)
	if err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if !deleted {
		t.Fatal("删除记录时应返回 deleted=true")
	}
	if len(notifier.resolved) != 1 || notifier.resolved[0] != 21 {
		t.Fatalf("重置指纹后应解除设备 21 的告警，resolved = %v", notifier.resolved)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestSSHHostKeyStore_DeleteMissingIsIdempotentWithoutResolve(t *testing.T) {
	db, mock, cleanup := newSSHUtilGormDBWithSQLMock(t)
	defer cleanup()
	store := sshutil.NewSSHHostKeyStore(db, zap.NewNop())
	notifier := &fakeHostKeyNotifier{}
	setFakeNotifier(t, notifier)

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
	if len(notifier.resolved) != 0 {
		t.Fatalf("未删除记录时不应触发告警解除，resolved = %v", notifier.resolved)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

// HostKeyCallbackFor 的核心行为：该算法首次连接记录指纹（TOFU），
// 同算法再连指纹一致放行、不一致拒绝并通知告警。
func TestHostKeyCallbackFor_RecordsThenVerifiesThenRejects(t *testing.T) {
	db, mock, cleanup := newSSHUtilGormDBWithSQLMock(t)
	defer cleanup()
	store := sshutil.NewSSHHostKeyStore(db, zap.NewNop())
	notifier := &fakeHostKeyNotifier{}
	setFakeNotifier(t, notifier)

	keyA := newEd25519PublicKey(t)
	keyB := newEd25519PublicKey(t)
	fpA := ssh.FingerprintSHA256(keyA)
	fpB := ssh.FingerprintSHA256(keyB)
	callback := sshutil.HostKeyCallbackFor(store, 21, zap.NewNop())

	// 第一次连接：无记录 → 写入 TOFU
	mock.ExpectQuery(`FROM "device_ssh_host_keys" WHERE device_id = \$1 AND algorithm = \$2`).
		WithArgs(21, "ssh-ed25519", 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "device_id", "fingerprint", "algorithm"}))
	mock.ExpectQuery(`INSERT INTO "device_ssh_host_keys"`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(9))
	if err := callback("192.168.20.1:22", nil, keyA); err != nil {
		t.Fatalf("首次连接应记录指纹并放行: %v", err)
	}

	// 第二次连接：指纹一致 → 放行
	mock.ExpectQuery(`FROM "device_ssh_host_keys" WHERE device_id = \$1 AND algorithm = \$2`).
		WithArgs(21, "ssh-ed25519", 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "device_id", "fingerprint", "algorithm"}).
			AddRow(9, 21, fpA, "ssh-ed25519"))
	if err := callback("192.168.20.1:22", nil, keyA); err != nil {
		t.Fatalf("指纹一致应放行: %v", err)
	}

	// 第三次连接：同算法不同密钥 → 拒绝 + 通知告警
	mock.ExpectQuery(`FROM "device_ssh_host_keys" WHERE device_id = \$1 AND algorithm = \$2`).
		WithArgs(21, "ssh-ed25519", 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "device_id", "fingerprint", "algorithm"}).
			AddRow(9, 21, fpA, "ssh-ed25519"))
	err := callback("192.168.20.1:22", nil, keyB)
	if err == nil {
		t.Fatal("指纹不一致应拒绝连接")
	}
	if !strings.Contains(err.Error(), "指纹发生变化") {
		t.Fatalf("错误应说明指纹变化: %v", err)
	}
	if len(notifier.notified) != 1 {
		t.Fatalf("指纹不一致应通知告警一次，notified = %d", len(notifier.notified))
	}
	if notifier.notified[0].CurrentFingerprint != fpB || notifier.notified[0].RecordedFingerprint != fpA {
		t.Fatalf("通知内容不符: %+v", notifier.notified[0])
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

// 多算法互不干扰：设备已记录 RSA 指纹，另一算法的密钥首次出现应独立记录，
// 而不是被当作"指纹变化"误报。
func TestHostKeyCallbackFor_MultiAlgorithmIndependent(t *testing.T) {
	db, mock, cleanup := newSSHUtilGormDBWithSQLMock(t)
	defer cleanup()
	store := sshutil.NewSSHHostKeyStore(db, zap.NewNop())
	notifier := &fakeHostKeyNotifier{}
	setFakeNotifier(t, notifier)

	ecdsaKey := newECDSAPublicKey(t)
	callback := sshutil.HostKeyCallbackFor(store, 21, zap.NewNop())

	// 查询限定到 (device_id, algorithm=ecdsa-sha2-nistp256)：该算法无记录 → 独立写入
	mock.ExpectQuery(`FROM "device_ssh_host_keys" WHERE device_id = \$1 AND algorithm = \$2`).
		WithArgs(21, "ecdsa-sha2-nistp256", 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "device_id", "fingerprint", "algorithm"}))
	mock.ExpectQuery(`INSERT INTO "device_ssh_host_keys"`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(10))

	if err := callback("192.168.20.1:22", nil, ecdsaKey); err != nil {
		t.Fatalf("新算法密钥首次出现应独立记录并放行: %v", err)
	}
	if len(notifier.notified) != 0 {
		t.Fatalf("新算法不应触发告警: %+v", notifier.notified)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestHostKeyCallbackFor_NoStoreOrNoDeviceAllows(t *testing.T) {
	setFakeNotifier(t, &fakeHostKeyNotifier{})
	key := newEd25519PublicKey(t)

	// 无指纹存储（未配置 db）：放行
	if err := sshutil.HostKeyCallbackFor(nil, 21, zap.NewNop())("h", nil, key); err != nil {
		t.Fatalf("无指纹存储应放行: %v", err)
	}

	// 无设备上下文（新增设备的连接测试）：放行，不触碰数据库
	db, _, cleanup := newSSHUtilGormDBWithSQLMock(t)
	defer cleanup()
	store := sshutil.NewSSHHostKeyStore(db, zap.NewNop())
	if err := sshutil.HostKeyCallbackFor(store, 0, zap.NewNop())("h", nil, key); err != nil {
		t.Fatalf("无设备上下文应放行: %v", err)
	}
}

func TestSSHHostKeyStore_NilStoreRejectsOperations(t *testing.T) {
	store := sshutil.NewSSHHostKeyStore(nil, zap.NewNop())

	if _, err := store.Get(context.Background(), 21); err == nil {
		t.Fatal("未配置数据库时 Get 应返回错误")
	}
	if _, err := store.Delete(context.Background(), 21); err == nil {
		t.Fatal("未配置数据库时 Delete 应返回错误")
	}
}
