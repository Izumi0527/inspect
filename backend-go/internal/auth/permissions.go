package auth

import "github.com/your-org/inspect-system/backend-go/internal/authz"

// NormalizePermissionName 将历史权限字符串统一映射为当前规范（便于兼容旧数据/旧角色配置）。
//
// 约定：权限格式为 "<模块>:<动作>"，例如 "devices:read"。
// 当前后端以复数模块名为准（users/devices/inspections/alerts/reports）。
func NormalizePermissionName(raw string) string {
	return authz.NormalizePermissionKey(raw)
}

// NormalizePermissionList 规范化并去重权限列表，保证对外返回稳定。
func NormalizePermissionList(raw []string) []string {
	return authz.NormalizePermissionList(raw)
}
