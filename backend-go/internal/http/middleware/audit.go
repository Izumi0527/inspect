package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/auth"
	"github.com/your-org/inspect-system/backend-go/internal/settings"
)

// AuditSink 审计写入依赖（*settings.Service 满足该接口）。
type AuditSink interface {
	RecordAuditLog(ctx context.Context, entry settings.AuditEntry)
}

// auditResourceRule 路由前缀（去掉 /api/v1 后）到资源类型的映射。
type auditResourceRule struct {
	prefix string
	typ    string
	label  string
}

// 命中即记录；新增业务资源时在此追加一行即可纳入审计。
var auditResourceRules = []auditResourceRule{
	{"/devices", "device", "设备"},
	{"/inspections", "inspection", "巡检任务"},
	{"/templates", "inspection_template", "巡检模板"},
	{"/strategies", "inspection_strategy", "巡检策略"},
	{"/alerts", "alert", "告警"},
	{"/reports", "report", "报表"},
	{"/users", "user", "用户"},
	{"/roles", "role", "角色"},
	{"/settings", "setting", "系统设置"},
	{"/logs", "log", "日志"},
}

var auditActionLabels = map[string]string{
	"create":        "创建",
	"update":        "更新",
	"delete":        "删除",
	"export":        "导出",
	"import":        "导入",
	"config_change": "配置变更",
}

// isAuditExcluded 排除高频/非业务变更路由，避免审计噪音。
// /auth/ 由登录登出显式埋点覆盖；探测类（probe）是高频只读性质的主动操作。
func isAuditExcluded(relPath string) bool {
	if strings.HasPrefix(relPath, "/auth/") || strings.HasPrefix(relPath, "/ws") {
		return true
	}
	return strings.Contains(relPath, "probe")
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
			if isAuditExcluded(relPath) {
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
				ResourceID:   c.Param("id"),
				Description:  description,
				IPAddress:    c.RealIP(),
				UserAgent:    c.Request().UserAgent(),
				Status:       status,
				ErrorMessage: errMsg,
			})

			return err
		}
	}
}
