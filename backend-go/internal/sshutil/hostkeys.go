package sshutil

import (
	"context"
	"errors"
	"fmt"
	"net"
	"time"

	"go.uber.org/zap"
	"golang.org/x/crypto/ssh"
	"gorm.io/gorm"
)

// DeviceSSHHostKey 记录设备 SSH 主机密钥指纹，用于 TOFU（首次信任）校验：
// 首次连接某算法的主机密钥时记录指纹，之后同算法指纹不一致则拒绝，防止中间人
// 伪装设备收割凭据。按 (device_id, algorithm) 一设备多算法各记一条——SSH 服务器
// 可同时提供 RSA/ECDSA/ED25519 多种主机密钥，客户端按偏好协商，只存单条会在
// 协商算法变化时把"同一设备的另一把密钥"误报为"指纹变化"。
// 注意 key.Type() 返回公钥格式类型（RSA 密钥恒为 ssh-rsa，与签名算法
// ssh-rsa/rsa-sha2-* 无关），即此处按"密钥"维度区分，签名算法变化不误报。
type DeviceSSHHostKey struct {
	ID          int       `gorm:"primaryKey;autoIncrement"`
	DeviceID    int       `gorm:"column:device_id;not null;uniqueIndex:idx_device_ssh_host_keys_device_algorithm"`
	Fingerprint string    `gorm:"column:fingerprint;size:128;not null"`
	Algorithm   string    `gorm:"column:algorithm;size:50;not null;uniqueIndex:idx_device_ssh_host_keys_device_algorithm"`
	CreatedAt   time.Time `gorm:"column:created_at;not null"`
	UpdatedAt   time.Time `gorm:"column:updated_at;not null"`
}

func (DeviceSSHHostKey) TableName() string {
	return "device_ssh_host_keys"
}

// HostKeyMismatch 描述一次主机密钥指纹不匹配（记录值与当前出示值）。
type HostKeyMismatch struct {
	DeviceID            int
	RecordedFingerprint string
	RecordedAlgorithm   string
	CurrentFingerprint  string
	CurrentAlgorithm    string
}

// HostKeyAlertNotifier 接收指纹校验的失败/恢复事件，用于产生与解除系统告警。
// 实现方见 alerts.SSHHostKeyAlertBridge；未注入时校验行为不受影响。
type HostKeyAlertNotifier interface {
	NotifyHostKeyMismatch(ctx context.Context, mismatch HostKeyMismatch) error
	ResolveHostKeyMismatch(ctx context.Context, deviceID int) error
}

// hostKeyAlertNotifier 进程级通知器（启动时设置一次，运行期只读）。
var hostKeyAlertNotifier HostKeyAlertNotifier

// SetHostKeyAlertNotifier 注入指纹变化告警通知器（进程级，启动时设置一次）。
func SetHostKeyAlertNotifier(n HostKeyAlertNotifier) {
	hostKeyAlertNotifier = n
}

// SSHHostKeyStore 基于 device_ssh_host_keys 表的主机密钥指纹存储。
// 日志采集、连接测试、配置备份、巡检统一用它做 TOFU 校验；
// 管理面（设备详情页）用 Get/Delete 查询与重置指纹。
type SSHHostKeyStore struct {
	db     *gorm.DB
	logger *zap.Logger
}

// NewSSHHostKeyStore 构造主机密钥指纹存储。
func NewSSHHostKeyStore(db *gorm.DB, logger *zap.Logger) *SSHHostKeyStore {
	return &SSHHostKeyStore{db: db, logger: logger}
}

// Get 查询设备已记录的全部主机密钥指纹（按算法各一条）；尚未记录时返回空列表。
func (s *SSHHostKeyStore) Get(ctx context.Context, deviceID int) ([]DeviceSSHHostKey, error) {
	if s == nil || s.db == nil {
		return nil, errors.New("主机密钥指纹存储未初始化")
	}
	var records []DeviceSSHHostKey
	if err := s.db.WithContext(ctx).Where("device_id = ?", deviceID).Order("algorithm").Find(&records).Error; err != nil {
		return nil, fmt.Errorf("查询主机密钥指纹失败: %w", err)
	}
	return records, nil
}

// Delete 删除设备的全部主机密钥指纹记录（幂等）；返回是否实际删除了一行。
// 仅在确认设备密钥合法变更（如设备重置/更换）后使用：删除后下一次 SSH
// 连接将重新记录设备出示的密钥，并解除该设备的指纹变化告警。
func (s *SSHHostKeyStore) Delete(ctx context.Context, deviceID int) (bool, error) {
	if s == nil || s.db == nil {
		return false, errors.New("主机密钥指纹存储未初始化")
	}
	result := s.db.WithContext(ctx).Where("device_id = ?", deviceID).Delete(&DeviceSSHHostKey{})
	if result.Error != nil {
		return false, fmt.Errorf("删除主机密钥指纹失败: %w", result.Error)
	}
	deleted := result.RowsAffected > 0
	if deleted {
		s.resolveMismatch(ctx, deviceID)
	}
	return deleted, nil
}

// verifyOrRecord 校验设备某算法的主机密钥指纹：该算法首次连接记录（TOFU），
// 同算法指纹不一致则拒绝并通知告警。不同算法各自独立、互不干扰。
func (s *SSHHostKeyStore) verifyOrRecord(ctx context.Context, deviceID int, key ssh.PublicKey) error {
	if s == nil || s.db == nil {
		return nil
	}

	fingerprint := ssh.FingerprintSHA256(key)
	algorithm := key.Type()
	var record DeviceSSHHostKey
	err := s.db.WithContext(ctx).Where("device_id = ? AND algorithm = ?", deviceID, algorithm).Take(&record).Error
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		// 该算法首次连接：记录指纹。并发首连可能撞唯一索引，失败时重查比对兜底。
		createErr := s.db.WithContext(ctx).Create(&DeviceSSHHostKey{
			DeviceID:    deviceID,
			Fingerprint: fingerprint,
			Algorithm:   algorithm,
		}).Error
		if createErr != nil {
			var existing DeviceSSHHostKey
			if reErr := s.db.WithContext(ctx).Where("device_id = ? AND algorithm = ?", deviceID, algorithm).Take(&existing).Error; reErr == nil {
				if existing.Fingerprint == fingerprint {
					return nil
				}
				s.notifyMismatch(ctx, existing, key)
				return hostKeyMismatchError(deviceID, &existing, key)
			}
			return fmt.Errorf("记录主机密钥指纹失败: %w", createErr)
		}
		if s.logger != nil {
			s.logger.Info("SSH主机密钥指纹已记录（首次信任）",
				zap.Int("device_id", deviceID),
				zap.String("fingerprint", fingerprint),
				zap.String("algorithm", algorithm))
		}
		return nil
	case err != nil:
		return fmt.Errorf("查询主机密钥指纹失败: %w", err)
	case record.Fingerprint != fingerprint:
		s.notifyMismatch(ctx, record, key)
		return hostKeyMismatchError(deviceID, &record, key)
	default:
		return nil
	}
}

// notifyMismatch 尽力而为地通知告警桥（失败只记日志，不改变拒绝结果）。
// 用独立超时且不随握手 ctx 取消：告警落库不应因 SSH 握手超时而丢失。
func (s *SSHHostKeyStore) notifyMismatch(ctx context.Context, record DeviceSSHHostKey, current ssh.PublicKey) {
	notifier := hostKeyAlertNotifier
	if notifier == nil {
		return
	}
	nctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	mismatch := HostKeyMismatch{
		DeviceID:            record.DeviceID,
		RecordedFingerprint: record.Fingerprint,
		RecordedAlgorithm:   record.Algorithm,
		CurrentFingerprint:  ssh.FingerprintSHA256(current),
		CurrentAlgorithm:    current.Type(),
	}
	if err := notifier.NotifyHostKeyMismatch(nctx, mismatch); err != nil && s.logger != nil {
		s.logger.Warn("指纹变化告警通知失败", zap.Int("device_id", record.DeviceID), zap.Error(err))
	}
}

// resolveMismatch 在指纹记录被重置后解除该设备的指纹变化告警（尽力而为）。
func (s *SSHHostKeyStore) resolveMismatch(ctx context.Context, deviceID int) {
	notifier := hostKeyAlertNotifier
	if notifier == nil {
		return
	}
	nctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	if err := notifier.ResolveHostKeyMismatch(nctx, deviceID); err != nil && s.logger != nil {
		s.logger.Warn("指纹告警解除通知失败", zap.Int("device_id", deviceID), zap.Error(err))
	}
}

// hostKeyMismatchError 构造指纹不一致的拒绝错误：带上记录与当前值的算法，
// 并给出可达的操作指引（设备详情页重置指纹），便于区分密钥轮换与算法协商变化。
func hostKeyMismatchError(deviceID int, record *DeviceSSHHostKey, current ssh.PublicKey) error {
	return fmt.Errorf("设备 %d 的 SSH 主机密钥指纹发生变化（记录: %s（%s），当前: %s（%s）），已拒绝连接；若确认为合法变更，请在设备详情页重置主机密钥指纹后重试",
		deviceID, record.Fingerprint, record.Algorithm, ssh.FingerprintSHA256(current), current.Type())
}

// HostKeyCallbackFor 构造统一的 TOFU 主机密钥校验回调，供日志采集、连接测试、
// 配置备份、巡检等全部 SSH 连接点使用。deviceID<=0（无设备上下文，如新增设备
// 的连接测试）或 store 为 nil（未配置指纹存储）时退化为放行。
// logger 为 nil 时回退用 store 自带的 logger，无 logger 的调用方（如配置备份）
// 无需额外传递即可保留校验失败的诊断日志。
func HostKeyCallbackFor(store *SSHHostKeyStore, deviceID int, logger *zap.Logger) ssh.HostKeyCallback {
	if store != nil && logger == nil {
		logger = store.logger
	}
	if store == nil || deviceID <= 0 {
		if logger != nil && store == nil && deviceID > 0 {
			logger.Warn("SSH主机密钥校验未启用（未配置指纹存储），连接不受中间人保护",
				zap.Int("device_id", deviceID))
		}
		return func(hostname string, remote net.Addr, key ssh.PublicKey) error {
			return nil
		}
	}
	return func(hostname string, remote net.Addr, key ssh.PublicKey) error {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := store.verifyOrRecord(ctx, deviceID, key); err != nil {
			if logger != nil {
				logger.Error("SSH主机密钥校验失败",
					zap.Int("device_id", deviceID),
					zap.String("host", hostname),
					zap.Error(err))
			}
			return err
		}
		return nil
	}
}
