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
	// 按设备性能趋势数据缓存时间（默认 2 分钟）
	DevicePerformanceTTL time.Duration
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
		DevicePerformanceTTL: 2 * time.Minute,
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

func (c *MetricsCache) temperatureKey(start, end time.Time, deviceIDs []int) string {
	return fmt.Sprintf("monitoring:temperature:%d:%d:dev=%s", start.Unix(), end.Unix(), deviceIDsCacheKey(deviceIDs))
}

func (c *MetricsCache) devicePerformanceKey(start, end time.Time, deviceIDs []int) string {
	return fmt.Sprintf("monitoring:device_performance:%d:%d:dev=%s", start.Unix(), end.Unix(), deviceIDsCacheKey(deviceIDs))
}

func (c *MetricsCache) networkTrafficKey(start, end time.Time, deviceIDs []int) string {
	return fmt.Sprintf("monitoring:network_traffic:%d:%d:dev=%s", start.Unix(), end.Unix(), deviceIDsCacheKey(deviceIDs))
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

// GetDevicePerformance 获取缓存的按设备性能趋势数据
func (c *MetricsCache) GetDevicePerformance(ctx context.Context, start, end time.Time, deviceIDs []int) ([]DevicePerformancePoint, bool) {
	if !c.config.Enabled || c.redis == nil {
		return nil, false
	}

	key := c.devicePerformanceKey(start, end, deviceIDs)
	data, err := c.redis.Get(ctx, key).Bytes()
	if err != nil {
		if err != redis.Nil {
			c.logger.Warn("failed to get device performance from cache", zap.Error(err))
		}
		return nil, false
	}

	var result []DevicePerformancePoint
	if err := json.Unmarshal(data, &result); err != nil {
		c.logger.Warn("failed to unmarshal device performance cache", zap.Error(err))
		return nil, false
	}

	c.logger.Debug("device performance cache hit", zap.String("key", key))
	return result, true
}

// SetDevicePerformance 设置按设备性能趋势数据缓存
func (c *MetricsCache) SetDevicePerformance(ctx context.Context, start, end time.Time, deviceIDs []int, data []DevicePerformancePoint) {
	if !c.config.Enabled || c.redis == nil {
		return
	}

	key := c.devicePerformanceKey(start, end, deviceIDs)
	encoded, err := json.Marshal(data)
	if err != nil {
		c.logger.Warn("failed to marshal device performance for cache", zap.Error(err))
		return
	}

	if err := c.redis.Set(ctx, key, encoded, c.config.DevicePerformanceTTL).Err(); err != nil {
		c.logger.Warn("failed to set device performance cache", zap.Error(err))
		return
	}

	c.logger.Debug("device performance cached", zap.String("key", key), zap.Duration("ttl", c.config.DevicePerformanceTTL))
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
