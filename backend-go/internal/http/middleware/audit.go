package middleware

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/auth"
	"github.com/your-org/inspect-system/backend-go/internal/settings"
)

const (
	auditDetailsContextKey = "audit.details"
	maxAuditBodyInspectLen = 64 * 1024
)

// AuditSink 审计写入依赖（*settings.Service 满足该接口）。
type AuditSink interface {
	RecordAuditLog(ctx context.Context, entry settings.AuditEntry)
}

// SetAuditDetails 允许处理器向当前请求上下文注入结构化审计详情；
// AuditTrail 在记录前会自动过滤凭据键，防止敏感信息落库。
func SetAuditDetails(c echo.Context, details interface{}) {
	if c == nil || details == nil {
		return
	}
	c.Set(auditDetailsContextKey, details)
}

// auditResourceRule 路由前缀（去掉 /api/v1 后）到资源类型的映射。
type auditResourceRule struct {
	prefix string
	typ    string
	label  string
}

// 命中即记录（按最长前缀优先匹配）；新增业务资源时在此追加即可纳入审计。
var auditResourceRules = []auditResourceRule{
	{"/devices/groups", "device_group", "设备分组"},
	{"/devices", "device", "设备"},
	{"/monitoring", "monitoring", "监控"},
	{"/inspections", "inspection", "巡检任务"},
	{"/templates", "inspection_template", "巡检模板"},
	{"/strategies", "inspection_strategy", "巡检策略"},
	{"/alerts", "alert", "告警"},
	{"/reports", "report", "报表"},
	{"/users", "user", "用户"},
	{"/roles", "role", "角色"},
	{"/settings", "setting", "系统设置"},
	{"/logs", "log", "日志"},
	{"/dashboard/network-topology", "topology_layout", "拓扑布局"},
}

var auditActionLabels = map[string]string{
	"create":        "创建",
	"update":        "更新",
	"delete":        "删除",
	"export":        "导出",
	"import":        "导入",
	"config_change": "配置变更",
}

// readOnlyMonitoringPostPaths 列出监控中心下承载纯查询/预览语义的只读 POST 路由，
// 避免高频查询与渲染请求在审计表产生噪音；报表导出保留审计留痕。
var readOnlyMonitoringPostPaths = map[string]bool{
	"/monitoring/dashboard/v2":            true,
	"/monitoring/devices/historical":      true,
	"/monitoring/devices/temperature":     true,
	"/monitoring/network/traffic/history": true,
	"/monitoring/graphs/adhoc":            true,
	"/monitoring/reports/download":        true,
	"/monitoring/reports/download/check":  true,
}

// isAuditExcluded 排除高频/只读查询型 POST 及非业务变更路由，避免审计噪音。
// /auth/ 由登录登出显式埋点覆盖；探测类（probe）是高频只读性质的主动操作。
func isAuditExcluded(method, relPath string) bool {
	if strings.HasPrefix(relPath, "/auth/") || strings.HasPrefix(relPath, "/ws") {
		return true
	}
	if strings.Contains(relPath, "probe") {
		return true
	}
	if method != http.MethodPost {
		return false
	}
	trimmed := strings.TrimRight(relPath, "/")
	if readOnlyMonitoringPostPaths[trimmed] {
		return true
	}
	// 排除 POST /monitoring/templates/:id/lld-rules/preview
	if strings.HasPrefix(trimmed, "/monitoring/templates/") && strings.HasSuffix(trimmed, "/lld-rules/preview") {
		return true
	}
	return false
}

// deriveAuditAction 由方法与路径推导审计动作，取值与前端 actionLabels 对齐。
func deriveAuditAction(method, relPath, resourceType string) string {
	switch {
	case strings.Contains(relPath, "/export"):
		return "export"
	case strings.Contains(relPath, "/import"):
		return "import"
	case resourceType == "setting":
		return "config_change"
	}
	switch method {
	case http.MethodPost:
		return "create"
	case http.MethodDelete:
		return "delete"
	default: // PUT / PATCH
		return "update"
	}
}

func extractAuditResourceID(c echo.Context) string {
	for _, key := range []string{"id", "device_id", "alert_id", "group_id", "template_id", "rule_id"} {
		if value := strings.TrimSpace(c.Param(key)); value != "" {
			return value
		}
	}
	return ""
}

func readSanitizedJSONBody(c echo.Context) interface{} {
	req := c.Request()
	if req == nil || req.Body == nil {
		return nil
	}
	ct := strings.ToLower(req.Header.Get(echo.HeaderContentType))
	if !strings.Contains(ct, "application/json") {
		return nil
	}
	raw, err := io.ReadAll(io.LimitReader(req.Body, maxAuditBodyInspectLen+1))
	if err != nil {
		return nil
	}
	// 恢复 Body，保证后续 handler 正常读取与 Bind。
	if len(raw) > maxAuditBodyInspectLen {
		origBody := req.Body
		req.Body = struct {
			io.Reader
			io.Closer
		}{
			Reader: io.MultiReader(bytes.NewReader(raw), origBody),
			Closer: origBody,
		}
		return nil
	}
	_ = req.Body.Close()
	req.Body = io.NopCloser(bytes.NewReader(raw))

	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || !json.Valid(trimmed) {
		return nil
	}
	var parsed interface{}
	if err := json.Unmarshal(trimmed, &parsed); err != nil {
		return nil
	}
	return settings.SanitizeAuditDetails(parsed)
}

func resolveAuditDetails(c echo.Context, fallbackBody interface{}) interface{} {
	if injected := c.Get(auditDetailsContextKey); injected != nil {
		return settings.SanitizeAuditDetails(injected)
	}
	return settings.SanitizeAuditDetails(fallbackBody)
}

// AuditTrail 对变更类请求（POST/PUT/PATCH/DELETE）按路由规则自动写入审计日志。
// 注册在认证中间件之后：到达此处的请求均已通过认证，用户取自 context。
// sink 为 nil 时直通；写入由 RecordAuditLog 保证尽力而为不阻断业务。
func AuditTrail(sink AuditSink) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if sink == nil {
				return next(c)
			}

			method := c.Request().Method
			switch method {
			case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
			default:
				return next(c)
			}

			relPath := strings.TrimPrefix(c.Request().URL.Path, "/api/v1")
			if isAuditExcluded(method, relPath) {
				return next(c)
			}

			var rule *auditResourceRule
			for i := range auditResourceRules {
				if strings.HasPrefix(relPath, auditResourceRules[i].prefix) {
					rule = &auditResourceRules[i]
					break
				}
			}
			if rule == nil {
				return next(c)
			}

			bodySummary := readSanitizedJSONBody(c)
			err := next(c)

			status := "success"
			errMsg := ""
			if err != nil {
				status = "failed"
				if httpErr, ok := err.(*echo.HTTPError); ok {
					errMsg = fmt.Sprintf("%v", httpErr.Message)
				} else {
					errMsg = err.Error()
				}
			} else if c.Response().Status >= http.StatusBadRequest {
				status = "failed"
			}

			userID := ""
			if user, ok := c.Get(auth.ContextUserKey).(*auth.UserRecord); ok && user != nil {
				userID = user.ID
			}

			action := deriveAuditAction(method, relPath, rule.typ)
			description := fmt.Sprintf("%s%s %s %s", auditActionLabels[action], rule.label, method, c.Request().URL.Path)

			sink.RecordAuditLog(c.Request().Context(), settings.AuditEntry{
				UserID:       userID,
				Action:       action,
				ResourceType: rule.typ,
				ResourceID:   extractAuditResourceID(c),
				Description:  description,
				Details:      resolveAuditDetails(c, bodySummary),
				IPAddress:    c.RealIP(),
				UserAgent:    c.Request().UserAgent(),
				Status:       status,
				ErrorMessage: errMsg,
			})

			return err
		}
	}
}
