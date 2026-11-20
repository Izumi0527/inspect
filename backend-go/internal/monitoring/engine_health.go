package monitoring

import (
	"context"
	"errors"
	"net"
	"strings"
	"sync"
	"time"
)

// 采集失败白名单错误码常量：仅允许下列枚举落库并展示，严禁透传原始底层错误。
const (
	CollectionErrorNone           = ""
	CollectionErrorAuthFailed     = "auth_failed"
	CollectionErrorTimeout        = "timeout"
	CollectionErrorUnreachable    = "unreachable"
	CollectionErrorUnsupportedOID = "unsupported_oid"
	CollectionErrorRateLimited    = "rate_limited"
)

var collectionErrorWhitelistMessages = map[string]string{
	CollectionErrorAuthFailed:     "SNMP 认证或团体字校验失败，请核对设备凭据与 SNMP 版本配置",
	CollectionErrorTimeout:        "采集请求超时，请检查设备负载或网络链路延迟",
	CollectionErrorUnreachable:    "设备网络不可达或目标端口未放行，请检查连通性与防火墙策略",
	CollectionErrorUnsupportedOID: "设备未上报部分标准 MIB 节点，请检查厂商适配或自定义采集项配置",
	CollectionErrorRateLimited:    "设备或采集队列触发限流保护，已自动降频等待恢复",
}

// SafeCollectionErrorMessage 根据白名单错误码返回脱敏中文诊断文案；未知码回落为空或 unreachable 兜底。
func SafeCollectionErrorMessage(code string) string {
	return collectionErrorWhitelistMessages[code]
}

// ClassifyCollectionError 将采集/探测阶段产生的底层错误归类为白名单错误码与脱敏中文文案。
// 严禁把原始 err.Error() 写入返回值或数据库，防止凭据、社区名或内部拓扑细节泄露。
func ClassifyCollectionError(err error, stage string) (code, safeMessage string) {
	if err == nil {
		return CollectionErrorNone, ""
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return CollectionErrorTimeout, collectionErrorWhitelistMessages[CollectionErrorTimeout]
	}
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return CollectionErrorTimeout, collectionErrorWhitelistMessages[CollectionErrorTimeout]
	}

	lower := strings.ToLower(err.Error())
	switch {
	case containsAnyToken(lower,
		"auth", "wrong digest", "usm", "unknown user", "bad community",
		"community not configured", "username not configured", "password not configured",
		"unsupported snmp version", "decryption", "credential", "凭据"):
		code = CollectionErrorAuthFailed
	case containsAnyToken(lower,
		"rate limit", "rate_limited", "too many requests", "429", "throttl", "限流"):
		code = CollectionErrorRateLimited
	case containsAnyToken(lower,
		"nosuchobject", "nosuchinstance", "nosuchname", "no such object",
		"no such instance", "no such name", "unsupported oid", "oid not supported"):
		code = CollectionErrorUnsupportedOID
	case containsAnyToken(lower,
		"timeout", "timed out", "deadline exceeded", "i/o timeout"):
		code = CollectionErrorTimeout
	case containsAnyToken(lower,
		"unreachable", "connection refused", "no route to host", "connect failed",
		"broken pipe", "eof", "network is down", "host is down"):
		code = CollectionErrorUnreachable
	default:
		if strings.Contains(strings.ToLower(stage), "probe") || strings.Contains(strings.ToLower(stage), "icmp") {
			code = CollectionErrorUnreachable
		} else {
			code = CollectionErrorTimeout
		}
	}
	return code, collectionErrorWhitelistMessages[code]
}

func containsAnyToken(text string, tokens ...string) bool {
	for _, token := range tokens {
		if strings.Contains(text, token) {
			return true
		}
	}
	return false
}

// BackoffDurationForFailures 根据连续失败次数返回指数退避时长（3次=5m，4次=10m，>=5次=15m）。
func BackoffDurationForFailures(consecutiveFailures int) time.Duration {
	switch {
	case consecutiveFailures < 3:
		return 0
	case consecutiveFailures == 3:
		return 5 * time.Minute
	case consecutiveFailures == 4:
		return 10 * time.Minute
	default:
		return 15 * time.Minute
	}
}

// BackoffDeviceSummary 表示当前处于采集退避熔断状态的设备脱敏摘要。
type BackoffDeviceSummary struct {
	DeviceID            int        `json:"device_id"`
	DeviceName          string     `json:"device_name,omitempty"`
	LastErrorCode       string     `json:"last_error_code"`
	LastErrorMessage    string     `json:"last_error_message"`
	ConsecutiveFailures int        `json:"consecutive_failures"`
	BackoffUntil        *time.Time `json:"backoff_until,omitempty"`
}

// EngineHealthSnapshot 表示采集引擎最近一轮运行与队列健康快照。
type EngineHealthSnapshot struct {
	LastRoundStartedAt  *time.Time             `json:"last_round_started_at,omitempty"`
	LastRoundFinishedAt *time.Time             `json:"last_round_finished_at,omitempty"`
	DurationMS          int64                  `json:"duration_ms"`
	TotalDevices        int                    `json:"total_devices"`
	SuccessDevices      int                    `json:"success_devices"`
	FailedDevices       int                    `json:"failed_devices"`
	BackoffDevices      int                    `json:"backoff_devices"`
	PendingWriteQueue   int                    `json:"pending_write_queue"`
	BackoffDeviceList   []BackoffDeviceSummary `json:"backoff_device_list"`
}

// EngineHealthTracker 提供线程安全的采集引擎自监控指标追踪。
type EngineHealthTracker struct {
	mu       sync.RWMutex
	snapshot EngineHealthSnapshot
}

// NewEngineHealthTracker 创建初始化完备的采集引擎健康追踪器。
func NewEngineHealthTracker() *EngineHealthTracker {
	return &EngineHealthTracker{
		snapshot: EngineHealthSnapshot{
			BackoffDeviceList: []BackoffDeviceSummary{},
		},
	}
}

// RecordRoundStart 记录新一轮采集开始时间与待采设备总数。
func (t *EngineHealthTracker) RecordRoundStart(startedAt time.Time, totalDevices int) {
	if t == nil {
		return
	}
	ts := startedAt.UTC()
	t.mu.Lock()
	t.snapshot.LastRoundStartedAt = &ts
	t.snapshot.TotalDevices = totalDevices
	t.mu.Unlock()
}

// RecordRoundFinish 记录一轮采集完成时的耗时、成功/失败/退避设备数及退避摘要清单。
func (t *EngineHealthTracker) RecordRoundFinish(
	finishedAt time.Time,
	durationMS int64,
	totalDevices int,
	successDevices int,
	failedDevices int,
	backoffList []BackoffDeviceSummary,
) {
	if t == nil {
		return
	}
	ts := finishedAt.UTC()
	if durationMS < 0 {
		durationMS = 0
	}
	copiedList := make([]BackoffDeviceSummary, len(backoffList))
	for i, item := range backoffList {
		item.LastErrorMessage = SafeCollectionErrorMessage(item.LastErrorCode)
		copiedList[i] = item
	}

	t.mu.Lock()
	t.snapshot.LastRoundFinishedAt = &ts
	t.snapshot.DurationMS = durationMS
	t.snapshot.TotalDevices = totalDevices
	t.snapshot.SuccessDevices = successDevices
	t.snapshot.FailedDevices = failedDevices
	t.snapshot.BackoffDevices = len(copiedList)
	t.snapshot.BackoffDeviceList = copiedList
	t.mu.Unlock()
}

// SetPendingWriteQueue 直接设置待写队列长度（负值夹紧为 0）。
func (t *EngineHealthTracker) SetPendingWriteQueue(pending int) {
	if t == nil {
		return
	}
	if pending < 0 {
		pending = 0
	}
	t.mu.Lock()
	t.snapshot.PendingWriteQueue = pending
	t.mu.Unlock()
}

// IncPendingWriteQueue 原子增减待写队列计数，防止并发写入下发生负数漂移。
func (t *EngineHealthTracker) IncPendingWriteQueue(delta int) {
	if t == nil {
		return
	}
	t.mu.Lock()
	t.snapshot.PendingWriteQueue += delta
	if t.snapshot.PendingWriteQueue < 0 {
		t.snapshot.PendingWriteQueue = 0
	}
	t.mu.Unlock()
}

// Snapshot 返回当前采集引擎健康状态的线程安全副本。
func (t *EngineHealthTracker) Snapshot() EngineHealthSnapshot {
	if t == nil {
		return EngineHealthSnapshot{BackoffDeviceList: []BackoffDeviceSummary{}}
	}
	t.mu.RLock()
	defer t.mu.RUnlock()

	out := t.snapshot
	if t.snapshot.LastRoundStartedAt != nil {
		v := *t.snapshot.LastRoundStartedAt
		out.LastRoundStartedAt = &v
	}
	if t.snapshot.LastRoundFinishedAt != nil {
		v := *t.snapshot.LastRoundFinishedAt
		out.LastRoundFinishedAt = &v
	}
	out.BackoffDeviceList = make([]BackoffDeviceSummary, len(t.snapshot.BackoffDeviceList))
	for i, item := range t.snapshot.BackoffDeviceList {
		if item.BackoffUntil != nil {
			v := *item.BackoffUntil
			item.BackoffUntil = &v
		}
		out.BackoffDeviceList[i] = item
	}
	return out
}
