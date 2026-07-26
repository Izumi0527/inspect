package monitoring

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

// CacheConfig 缓存配置
type CacheConfig struct {
	// 系统性能历史数据缓存时间（默认 2 分钟）
	SystemPerformanceTTL time.Duration
	// 设备温度历史数据缓存时间（默认 2 分钟）
	TemperatureTTL time.Duration
	// 网络流量历史数据缓存时间（默认 2 分钟）
	NetworkTrafficTTL time.Duration
	// 是否启用缓存（默认启用）
	Enabled bool
}

// DefaultCacheConfig 返回默认缓存配置
func DefaultCacheConfig() CacheConfig {
	return CacheConfig{
		SystemPerformanceTTL: 2 * time.Minute,
		TemperatureTTL:       2 * time.Minute,
		NetworkTrafficTTL:    2 * time.Minute,
		Enabled:              true,
	}
}

// MetricsCache 监控数据缓存服务
type MetricsCache struct {
	redis  *redis.Client
	config CacheConfig
	logger *zap.Logger
}

// NewMetricsCache 创建监控数据缓存服务
func NewMetricsCache(redis *redis.Client, config CacheConfig, logger *zap.Logger) *MetricsCache {
	if logger == nil {
		logger = zap.NewNop()
	}
	return &MetricsCache{
		redis:  redis,
		config: config,
		logger: logger,
	}
}

// 缓存键生成函数（设备维度必须纳入键，否则不同筛选之间会串数据）
func deviceIDsCacheKey(deviceIDs []int) string {
	if len(deviceIDs) == 0 {
		return "all"
	}
	sorted := append([]int(nil), deviceIDs...)
	sort.Ints(sorted)
	parts := make([]string, len(sorted))
	for i, id := range sorted {
		parts[i] = strconv.Itoa(id)
	}
	return strings.Join(parts, ",")
}

func (c *MetricsCache) systemPerformanceKey(start, end time.Time, metrics []string, deviceIDs []int) string {
	return fmt.Sprintf("monitoring:system_performance:%d:%d:%v:dev=%s", start.Unix(), end.Unix(), metrics, deviceIDsCacheKey(deviceIDs))
}

func (c *MetricsCache) temperatureKey(start, end time.Time, deviceIDs []int) string {
	return fmt.Sprintf("monitoring:temperature:%d:%d:dev=%s", start.Unix(), end.Unix(), deviceIDsCacheKey(deviceIDs))
}

func (c *MetricsCache) networkTrafficKey(start, end time.Time, deviceIDs []int) string {
	return fmt.Sprintf("monitoring:network_traffic:%d:%d:dev=%s", start.Unix(), end.Unix(), deviceIDsCacheKey(deviceIDs))
}

// GetSystemPerformance 获取缓存的系统性能数据
func (c *MetricsCache) GetSystemPerformance(ctx context.Context, start, end time.Time, metrics []string, deviceIDs []int) ([]SystemPerformancePoint, bool) {
	if !c.config.Enabled || c.redis == nil {
		return nil, false
	}

	key := c.systemPerformanceKey(start, end, metrics, deviceIDs)
	data, err := c.redis.Get(ctx, key).Bytes()
	if err != nil {
		if err != redis.Nil {
			c.logger.Warn("failed to get system performance from cache", zap.Error(err))
		}
		return nil, false
	}

	var result []SystemPerformancePoint
	if err := json.Unmarshal(data, &result); err != nil {
		c.logger.Warn("failed to unmarshal system performance cache", zap.Error(err))
		return nil, false
	}

	c.logger.Debug("system performance cache hit", zap.String("key", key))
	return result, true
}

// SetSystemPerformance 设置系统性能数据缓存
func (c *MetricsCache) SetSystemPerformance(ctx context.Context, start, end time.Time, metrics []string, deviceIDs []int, data []SystemPerformancePoint) {
	if !c.config.Enabled || c.redis == nil {
		return
	}

	key := c.systemPerformanceKey(start, end, metrics, deviceIDs)
	encoded, err := json.Marshal(data)
	if err != nil {
		c.logger.Warn("failed to marshal system performance for cache", zap.Error(err))
		return
	}

	if err := c.redis.Set(ctx, key, encoded, c.config.SystemPerformanceTTL).Err(); err != nil {
		c.logger.Warn("failed to set system performance cache", zap.Error(err))
		return
	}

	c.logger.Debug("system performance cached", zap.String("key", key), zap.Duration("ttl", c.config.SystemPerformanceTTL))
}

// GetTemperature 获取缓存的温度数据
func (c *MetricsCache) GetTemperature(ctx context.Context, start, end time.Time, deviceIDs []int) ([]TemperatureHistoryPoint, bool) {
	if !c.config.Enabled || c.redis == nil {
		return nil, false
	}

	key := c.temperatureKey(start, end, deviceIDs)
	data, err := c.redis.Get(ctx, key).Bytes()
	if err != nil {
		if err != redis.Nil {
			c.logger.Warn("failed to get temperature from cache", zap.Error(err))
		}
		return nil, false
	}

	var result []TemperatureHistoryPoint
	if err := json.Unmarshal(data, &result); err != nil {
		c.logger.Warn("failed to unmarshal temperature cache", zap.Error(err))
		return nil, false
	}

	c.logger.Debug("temperature cache hit", zap.String("key", key))
	return result, true
}

// SetTemperature 设置温度数据缓存
func (c *MetricsCache) SetTemperature(ctx context.Context, start, end time.Time, deviceIDs []int, data []TemperatureHistoryPoint) {
	if !c.config.Enabled || c.redis == nil {
		return
	}

	key := c.temperatureKey(start, end, deviceIDs)
	encoded, err := json.Marshal(data)
	if err != nil {
		c.logger.Warn("failed to marshal temperature for cache", zap.Error(err))
		return
	}

	if err := c.redis.Set(ctx, key, encoded, c.config.TemperatureTTL).Err(); err != nil {
		c.logger.Warn("failed to set temperature cache", zap.Error(err))
		return
	}

	c.logger.Debug("temperature cached", zap.String("key", key), zap.Duration("ttl", c.config.TemperatureTTL))
}

// GetNetworkTraffic 获取缓存的网络流量数据
func (c *MetricsCache) GetNetworkTraffic(ctx context.Context, start, end time.Time, deviceIDs []int) ([]NetworkTrafficPoint, bool) {
	if !c.config.Enabled || c.redis == nil {
		return nil, false
	}

	key := c.networkTrafficKey(start, end, deviceIDs)
	data, err := c.redis.Get(ctx, key).Bytes()
	if err != nil {
		if err != redis.Nil {
			c.logger.Warn("failed to get network traffic from cache", zap.Error(err))
		}
		return nil, false
	}

	var result []NetworkTrafficPoint
	if err := json.Unmarshal(data, &result); err != nil {
		c.logger.Warn("failed to unmarshal network traffic cache", zap.Error(err))
		return nil, false
	}

	c.logger.Debug("network traffic cache hit", zap.String("key", key))
	return result, true
}

// SetNetworkTraffic 设置网络流量数据缓存
func (c *MetricsCache) SetNetworkTraffic(ctx context.Context, start, end time.Time, deviceIDs []int, data []NetworkTrafficPoint) {
	if !c.config.Enabled || c.redis == nil {
		return
	}

	key := c.networkTrafficKey(start, end, deviceIDs)
	encoded, err := json.Marshal(data)
	if err != nil {
		c.logger.Warn("failed to marshal network traffic for cache", zap.Error(err))
		return
	}

	if err := c.redis.Set(ctx, key, encoded, c.config.NetworkTrafficTTL).Err(); err != nil {
		c.logger.Warn("failed to set network traffic cache", zap.Error(err))
		return
	}

	c.logger.Debug("network traffic cached", zap.String("key", key), zap.Duration("ttl", c.config.NetworkTrafficTTL))
}

// ClearAll 清除所有监控数据缓存
func (c *MetricsCache) ClearAll(ctx context.Context) error {
	if !c.config.Enabled || c.redis == nil {
		return nil
	}

	patterns := []string{
		"monitoring:system_performance:*",
		"monitoring:temperature:*",
		"monitoring:network_traffic:*",
	}

	for _, pattern := range patterns {
		iter := c.redis.Scan(ctx, 0, pattern, 0).Iterator()
		for iter.Next(ctx) {
			if err := c.redis.Del(ctx, iter.Val()).Err(); err != nil {
				c.logger.Warn("failed to delete cache key", zap.String("key", iter.Val()), zap.Error(err))
			}
		}
		if err := iter.Err(); err != nil {
			return err
		}
	}

	c.logger.Info("all monitoring cache cleared")
	return nil
}
