package handlers

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

// ReportDownloadTokenStore 为“报告文件下载”提供短期票据能力。
//
// 设计目标：
// - 前端通过 export 接口拿到短期 token 后，用表单 POST 提交 token 触发浏览器原生下载（避免 fetch->blob 的内存占用）。
// - token 必须不可预测、短 TTL；并支持“限制使用次数”（兼容浏览器断点续传/重试）。
//
// 注意：
// - token 是 bearer secret：谁拿到谁能下载，因此务必避免把 token 放在 URL（易被日志/Referer 泄露）。
// - 无 Redis 时使用内存存储，仅适用于单实例/开发环境；生产建议启用 Redis。
type ReportDownloadTokenStore struct {
	redis  *redis.Client
	logger *zap.Logger

	now func() time.Time

	mu          sync.Mutex
	items       map[string]reportDownloadTokenEntry
	lastCleanup time.Time
}

type reportDownloadTokenEntry struct {
	Filename      string
	ExpiresAt     time.Time
	RemainingUses int
}

const reportDownloadTokenRedisKeyPrefix = "inspect:monitoring:report_download_token:"

var reportDownloadTokenConsumeScript = redis.NewScript(`
local keyType = redis.call("TYPE", KEYS[1])["ok"]
if keyType == "none" then
  return nil
end
if keyType == "string" then
  local legacy = redis.call("GET", KEYS[1])
  if legacy then
    redis.call("DEL", KEYS[1])
    return legacy
  end
  return nil
end

local filename = redis.call("HGET", KEYS[1], "filename")
if not filename then
  return nil
end

local remaining = tonumber(redis.call("HGET", KEYS[1], "remaining_uses") or "0")
if remaining <= 0 then
  redis.call("DEL", KEYS[1])
  return ""
end

remaining = remaining - 1
if remaining <= 0 then
  redis.call("DEL", KEYS[1])
else
  redis.call("HSET", KEYS[1], "remaining_uses", remaining)
end

return filename
`)

type ReportDownloadTokenInfo struct {
	Filename      string
	ExpiresAt     time.Time
	RemainingUses int
}

func NewReportDownloadTokenStore(redisClient *redis.Client, logger *zap.Logger) *ReportDownloadTokenStore {
	store := &ReportDownloadTokenStore{
		redis:  redisClient,
		logger: logger,
		now:    func() time.Time { return time.Now().UTC() },
		items:  make(map[string]reportDownloadTokenEntry),
	}
	return store
}

func (s *ReportDownloadTokenStore) Issue(ctx context.Context, filename string, ttl time.Duration, maxUses int) (string, time.Time, error) {
	if s == nil {
		return "", time.Time{}, fmt.Errorf("token store not initialized")
	}
	name := strings.TrimSpace(filename)
	if name == "" {
		return "", time.Time{}, fmt.Errorf("filename is required")
	}
	if ttl <= 0 {
		ttl = 5 * time.Minute
	}
	if maxUses <= 0 {
		maxUses = 1
	}
	if maxUses > 20 {
		maxUses = 20
	}

	token, err := generateHighEntropyToken(32)
	if err != nil {
		return "", time.Time{}, err
	}

	expiresAt := s.now().Add(ttl)
	if s.redis != nil {
		key := reportDownloadTokenRedisKeyPrefix + token
		pipe := s.redis.Pipeline()
		pipe.HSet(ctx, key, "filename", name, "remaining_uses", maxUses)
		pipe.Expire(ctx, key, ttl)
		if _, err := pipe.Exec(ctx); err != nil {
			if s.logger != nil {
				s.logger.Warn("监控报告下载票据写入Redis失败", zap.Error(err))
			}
			return "", time.Time{}, err
		}
		return token, expiresAt, nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.cleanupLocked()
	s.items[token] = reportDownloadTokenEntry{Filename: name, ExpiresAt: expiresAt, RemainingUses: maxUses}
	return token, expiresAt, nil
}

// Consume 校验并“消费” token（扣减剩余次数），成功时返回文件名；失败返回 ok=false（过期/不存在/已用尽）。
func (s *ReportDownloadTokenStore) Consume(ctx context.Context, token string) (string, bool, error) {
	if s == nil {
		return "", false, fmt.Errorf("token store not initialized")
	}
	value := strings.TrimSpace(token)
	if value == "" {
		return "", false, nil
	}

	if s.redis != nil {
		key := reportDownloadTokenRedisKeyPrefix + value
		result, err := reportDownloadTokenConsumeScript.Run(ctx, s.redis, []string{key}).Result()
		if err != nil {
			if err == redis.Nil {
				return "", false, nil
			}
			return "", false, err
		}
		str, ok := result.(string)
		if !ok || strings.TrimSpace(str) == "" {
			return "", false, nil
		}
		return strings.TrimSpace(str), true, nil
	}

	now := s.now()
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cleanupLocked()

	entry, ok := s.items[value]
	if !ok {
		return "", false, nil
	}
	if !entry.ExpiresAt.IsZero() && now.After(entry.ExpiresAt) {
		delete(s.items, value)
		return "", false, nil
	}

	if entry.RemainingUses <= 0 {
		delete(s.items, value)
		return "", false, nil
	}

	entry.RemainingUses--
	if entry.RemainingUses <= 0 {
		delete(s.items, value)
	} else {
		s.items[value] = entry
	}
	return entry.Filename, true, nil
}

// Inspect 返回 token 对应的文件名、过期时间与剩余次数（不消费）。
func (s *ReportDownloadTokenStore) Inspect(ctx context.Context, token string) (ReportDownloadTokenInfo, bool, error) {
	if s == nil {
		return ReportDownloadTokenInfo{}, false, fmt.Errorf("token store not initialized")
	}
	value := strings.TrimSpace(token)
	if value == "" {
		return ReportDownloadTokenInfo{}, false, nil
	}

	now := s.now()
	if s.redis != nil {
		key := reportDownloadTokenRedisKeyPrefix + value

		keyType, err := s.redis.Type(ctx, key).Result()
		if err != nil {
			if err == redis.Nil {
				return ReportDownloadTokenInfo{}, false, nil
			}
			return ReportDownloadTokenInfo{}, false, err
		}

		switch strings.ToLower(strings.TrimSpace(keyType)) {
		case "none":
			return ReportDownloadTokenInfo{}, false, nil
		case "string":
			// 兼容旧实现：token->filename（单次使用，不含剩余次数）。
			pipe := s.redis.Pipeline()
			filenameCmd := pipe.Get(ctx, key)
			ttlCmd := pipe.TTL(ctx, key)
			_, err := pipe.Exec(ctx)
			if err != nil && err != redis.Nil {
				return ReportDownloadTokenInfo{}, false, err
			}

			filename := strings.TrimSpace(filenameCmd.Val())
			ttl := ttlCmd.Val()
			if filename == "" || ttl <= 0 {
				return ReportDownloadTokenInfo{}, false, nil
			}

			expiresAt := now.Add(ttl)
			return ReportDownloadTokenInfo{
				Filename:      filename,
				ExpiresAt:     expiresAt,
				RemainingUses: 1,
			}, true, nil
		case "hash":
			pipe := s.redis.Pipeline()
			valuesCmd := pipe.HMGet(ctx, key, "filename", "remaining_uses")
			ttlCmd := pipe.TTL(ctx, key)
			_, err := pipe.Exec(ctx)
			if err != nil && err != redis.Nil {
				return ReportDownloadTokenInfo{}, false, err
			}

			values := valuesCmd.Val()
			if len(values) != 2 {
				return ReportDownloadTokenInfo{}, false, nil
			}

			filename := strings.TrimSpace(redisValueToString(values[0]))
			remainingRaw := strings.TrimSpace(redisValueToString(values[1]))
			remaining := 0
			if remainingRaw != "" {
				if parsed, parseErr := strconv.Atoi(remainingRaw); parseErr == nil {
					remaining = parsed
				}
			}

			ttl := ttlCmd.Val()
			if filename == "" || ttl <= 0 || remaining <= 0 {
				return ReportDownloadTokenInfo{}, false, nil
			}

			expiresAt := now.Add(ttl)
			return ReportDownloadTokenInfo{
				Filename:      filename,
				ExpiresAt:     expiresAt,
				RemainingUses: remaining,
			}, true, nil
		default:
			return ReportDownloadTokenInfo{}, false, nil
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.cleanupLocked()

	entry, ok := s.items[value]
	if !ok {
		return ReportDownloadTokenInfo{}, false, nil
	}
	if !entry.ExpiresAt.IsZero() && now.After(entry.ExpiresAt) {
		delete(s.items, value)
		return ReportDownloadTokenInfo{}, false, nil
	}
	if entry.RemainingUses <= 0 {
		delete(s.items, value)
		return ReportDownloadTokenInfo{}, false, nil
	}

	return ReportDownloadTokenInfo{
		Filename:      entry.Filename,
		ExpiresAt:     entry.ExpiresAt,
		RemainingUses: entry.RemainingUses,
	}, true, nil
}

func redisValueToString(value interface{}) string {
	switch v := value.(type) {
	case nil:
		return ""
	case string:
		return v
	case []byte:
		return string(v)
	case int:
		return strconv.Itoa(v)
	case int64:
		return strconv.FormatInt(v, 10)
	default:
		return fmt.Sprint(v)
	}
}

func (s *ReportDownloadTokenStore) cleanupLocked() {
	if s == nil {
		return
	}
	now := s.now()
	// 避免每次都全量扫描：超过 30 秒才做一次清理
	if !s.lastCleanup.IsZero() && now.Sub(s.lastCleanup) < 30*time.Second {
		return
	}
	s.lastCleanup = now

	for token, entry := range s.items {
		if !entry.ExpiresAt.IsZero() && now.After(entry.ExpiresAt) {
			delete(s.items, token)
		}
	}
}

func generateHighEntropyToken(bytesLen int) (string, error) {
	if bytesLen <= 0 {
		bytesLen = 32
	}
	buf := make([]byte, bytesLen)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate token failed: %w", err)
	}
	// URL 安全且无 padding，便于表单提交
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
