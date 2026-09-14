package settings

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"strings"
)

// IP 白名单（security.auth.ip_whitelist_enabled / security.auth.ip_whitelist）：
// 条目为单个 IP 或 CIDR，匹配任一条目即放行。列表为空时视为未限制，避免误把所有人锁在门外。

const (
	ipAllowlistEnabledKey = "security.auth.ip_whitelist_enabled"
	ipAllowlistKey        = "security.auth.ip_whitelist"
)

// parseIPAllowlistEntries 把写入值（[]interface{} / []string / JSON 数组文本）
// 归一为去空白的字符串切片，并逐条校验为合法 IP 或 CIDR。
func parseIPAllowlistEntries(value interface{}) ([]string, error) {
	var raw []interface{}
	switch v := value.(type) {
	case nil:
		return []string{}, nil
	case []interface{}:
		raw = v
	case []string:
		raw = make([]interface{}, 0, len(v))
		for _, item := range v {
			raw = append(raw, item)
		}
	case string:
		trimmed := strings.TrimSpace(v)
		if trimmed == "" {
			return []string{}, nil
		}
		if err := json.Unmarshal([]byte(trimmed), &raw); err != nil {
			return nil, fmt.Errorf("IP 白名单（%s）必须是 IP/CIDR 数组", ipAllowlistKey)
		}
	default:
		return nil, fmt.Errorf("IP 白名单（%s）必须是 IP/CIDR 数组", ipAllowlistKey)
	}

	entries := make([]string, 0, len(raw))
	for _, item := range raw {
		text, ok := item.(string)
		if !ok {
			return nil, fmt.Errorf("IP 白名单（%s）条目必须是字符串", ipAllowlistKey)
		}
		entry := strings.TrimSpace(text)
		if entry == "" {
			continue
		}
		if !isIPOrCIDR(entry) {
			return nil, fmt.Errorf("IP 白名单条目 %q 不是合法的 IP 或 CIDR", entry)
		}
		entries = append(entries, entry)
	}
	return entries, nil
}

func isIPOrCIDR(entry string) bool {
	if strings.Contains(entry, "/") {
		_, _, err := net.ParseCIDR(entry)
		return err == nil
	}
	return net.ParseIP(entry) != nil
}

// IPAllowlistPermits 判断 ip 是否命中任一条目。条目非法或 ip 解析失败均按不命中处理。
func IPAllowlistPermits(entries []string, ip string) bool {
	target := net.ParseIP(strings.TrimSpace(ip))
	if target == nil {
		return false
	}
	for _, entry := range entries {
		entry = strings.TrimSpace(entry)
		if strings.Contains(entry, "/") {
			if _, network, err := net.ParseCIDR(entry); err == nil && network.Contains(target) {
				return true
			}
			continue
		}
		if candidate := net.ParseIP(entry); candidate != nil && candidate.Equal(target) {
			return true
		}
	}
	return false
}

// IPAllowlist 读取当前生效的 IP 白名单策略（供全局中间件逐请求调用）。
// 读库失败或值非法时按未启用处理：白名单是可用性敏感项，宁可放行也不要把所有人锁在门外。
func (s *Service) IPAllowlist(ctx context.Context) (bool, []string) {
	if !s.isReady() {
		return false, nil
	}
	if !s.getSettingBool(ctx, ipAllowlistEnabledKey, false) {
		return false, nil
	}
	return true, s.storedIPAllowlistEntries(ctx)
}

// storedIPAllowlistEntries 读取库中白名单列表；缺失或非法返回 nil。
func (s *Service) storedIPAllowlistEntries(ctx context.Context) []string {
	item, err := s.GetSetting(ctx, ipAllowlistKey)
	if err != nil || item == nil {
		return nil
	}
	entries, err := parseIPAllowlistEntries(item.Value)
	if err != nil {
		return nil
	}
	return entries
}

// ValidateIPAllowlistChange 在批量写入前做自锁防护：若本次写入后白名单将处于
// “启用且非空”状态，则发起请求的 IP 必须命中列表，否则拒绝保存。
// 载荷缺少的键回退读取库中现值；载荷完全不涉及白名单键时直接放行（不读库）。
func (s *Service) ValidateIPAllowlistChange(ctx context.Context, payload map[string]interface{}, requestIP string) error {
	enabledValue, hasEnabled := payload[ipAllowlistEnabledKey]
	listValue, hasList := payload[ipAllowlistKey]
	if !hasEnabled && !hasList {
		return nil
	}

	enabled := false
	if hasEnabled {
		parsed, ok := enabledValue.(bool)
		if !ok {
			return fmt.Errorf("%s 必须是布尔值", ipAllowlistEnabledKey)
		}
		enabled = parsed
	} else {
		enabled = s.getSettingBool(ctx, ipAllowlistEnabledKey, false)
	}
	if !enabled {
		return nil
	}

	var entries []string
	if hasList {
		parsed, err := parseIPAllowlistEntries(listValue)
		if err != nil {
			return err
		}
		entries = parsed
	} else {
		entries = s.storedIPAllowlistEntries(ctx)
	}
	if len(entries) == 0 {
		return nil
	}

	if !IPAllowlistPermits(entries, requestIP) {
		return fmt.Errorf("IP 白名单不包含当前访问 IP（%s），为避免把自己锁在门外已拒绝保存", strings.TrimSpace(requestIP))
	}
	return nil
}
