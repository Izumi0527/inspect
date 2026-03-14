package authz

import (
	"sort"
	"strings"
)

// NormalizePermissionKey 将历史/非规范权限 key 统一映射为当前后端标准 key。
//
// 约定：权限格式为 "<模块>:<动作>"，例如 "devices:read"。
// 当前后端以复数模块名为准（users/devices/inspections/alerts/reports）。
func NormalizePermissionKey(raw string) string {
	trimmed := strings.ToLower(strings.TrimSpace(raw))
	if trimmed == "" {
		return ""
	}

	parts := strings.Split(trimmed, ":")
	if len(parts) != 2 {
		return trimmed
	}

	module := strings.TrimSpace(parts[0])
	action := strings.TrimSpace(parts[1])
	if module == "" || action == "" {
		return trimmed
	}

	// 模块名兼容映射（历史版本可能使用单数形式）
	switch module {
	case "user":
		module = "users"
	case "device":
		module = "devices"
	case "inspection":
		module = "inspections"
	case "alert":
		module = "alerts"
	case "report":
		module = "reports"
	}

	// 动作兼容映射（少量常见别名）
	switch action {
	case "view", "list":
		action = "read"
	}

	return module + ":" + action
}

// NormalizePermissionList 规范化并去重权限列表，尽量保证对外返回稳定（保持输入顺序）。
func NormalizePermissionList(raw []string) []string {
	if len(raw) == 0 {
		return []string{}
	}

	seen := make(map[string]struct{}, len(raw))
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		normalized := NormalizePermissionKey(item)
		if normalized == "" {
			continue
		}
		if _, ok := seen[normalized]; ok {
			continue
		}
		seen[normalized] = struct{}{}
		out = append(out, normalized)
	}
	return out
}

// NormalizePermissionKeys 规范化并去重权限 key 列表，同时按字典序排序，便于对外返回稳定。
func NormalizePermissionKeys(raw []string) []string {
	out := NormalizePermissionList(raw)
	sort.Strings(out)
	return out
}
