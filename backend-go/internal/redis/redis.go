package redis

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/your-org/inspect-system/backend-go/internal/config"
)

func NewClient(cfg config.Config) (*redis.Client, error) {
	maskedURL := maskRedisURL(cfg.RedisURL)
	opts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return nil, fmt.Errorf("解析 REDIS_URL 失败（REDIS_URL=%s）: %s", maskedURL, sanitizeRedisErrorMessage(err, cfg.RedisURL))
	}

	client := redis.NewClient(opts)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		_ = client.Close()
		return nil, fmt.Errorf("连接 Redis 失败（REDIS_URL=%s）: %w。请确认 Redis 已启动，且地址/端口与当前环境一致（例如 Docker 端口映射、dev 默认端口等）", maskedURL, err)
	}

	return client, nil
}

func maskRedisURL(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "<空>"
	}

	parsed, err := url.Parse(trimmed)
	if err == nil {
		if parsed.User != nil {
			username := parsed.User.Username()
			parsed.User = url.UserPassword(username, "******")
		}
		return parsed.String()
	}

	// 尽最大努力脱敏：保留主机与路径，仅隐藏用户名/密码段。
	if schemeIdx := strings.Index(trimmed, "://"); schemeIdx >= 0 {
		rest := trimmed[schemeIdx+3:]
		if atIdx := strings.Index(rest, "@"); atIdx >= 0 {
			return trimmed[:schemeIdx+3] + "<已脱敏>@" + rest[atIdx+1:]
		}
	}

	return "<无法解析>"
}

func sanitizeRedisErrorMessage(err error, rawURL string) string {
	if err == nil {
		return ""
	}

	message := err.Error()
	rawTrimmed := strings.TrimSpace(rawURL)
	masked := maskRedisURL(rawTrimmed)
	if rawTrimmed != "" && masked != "" && rawTrimmed != masked {
		message = strings.ReplaceAll(message, rawTrimmed, masked)
	}
	return maskRedisCredentialsInText(message)
}

func maskRedisCredentialsInText(text string) string {
	schemes := []string{"redis://", "rediss://"}
	for _, scheme := range schemes {
		start := 0
		for {
			idx := strings.Index(text[start:], scheme)
			if idx < 0 {
				break
			}
			idx += start

			afterScheme := idx + len(scheme)
			atIdx := strings.Index(text[afterScheme:], "@")
			if atIdx < 0 {
				break
			}
			atIdx += afterScheme

			text = text[:afterScheme] + "<已脱敏>@" + text[atIdx+1:]
			start = afterScheme + len("<已脱敏>@")
		}
	}
	return text
}
