package handlers

import (
	"net/http"
	"regexp"
	"strings"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/snmpmib"
)

// KnowledgeHandler 提供内置华为官方 MIB / 告警 / 日志知识库只读查询端点。
type KnowledgeHandler struct {
	Auth PermissionService
}

const (
	maxKnowledgeOIDLen      = 128
	maxKnowledgeModuleLen   = 64
	maxKnowledgeMnemonicLen = 128
	maxKnowledgeEventIDLen  = 64
	maxKnowledgeMessageLen  = 2048
)

var knowledgeOIDPattern = regexp.MustCompile(`^\.?[0-9]+(\.[0-9]+)*$`)

type knowledgeLookupData struct {
	Matched bool               `json:"matched"`
	Kind    string             `json:"kind"`
	Alarm   *knowledgeAlarmDTO `json:"alarm,omitempty"`
	Log     *knowledgeLogDTO   `json:"log,omitempty"`
	MIB     *knowledgeMIBDTO   `json:"mib,omitempty"`
}

type knowledgeAlarmDTO struct {
	OID          string                   `json:"oid"`
	Module       string                   `json:"module"`
	AlarmName    string                   `json:"alarm_name"`
	SubID        string                   `json:"sub_id"`
	AlarmID      string                   `json:"alarm_id"`
	Severity     string                   `json:"severity"`
	AlarmType    string                   `json:"alarm_type"`
	TrapTemplate string                   `json:"trap_template"`
	Meaning      string                   `json:"meaning"`
	Parameters   []snmpmib.KnowledgeParam `json:"parameters"`
	Impact       string                   `json:"impact"`
	Causes       []string                 `json:"causes"`
	Procedures   []string                 `json:"procedures"`
	Reference    string                   `json:"reference"`
	VariantCount int                      `json:"variant_count"`
}

type knowledgeLogDTO struct {
	Module     string                   `json:"module"`
	Severity   int                      `json:"severity"`
	Mnemonic   string                   `json:"mnemonic"`
	Template   string                   `json:"template"`
	Meaning    string                   `json:"meaning"`
	Parameters []snmpmib.KnowledgeParam `json:"parameters"`
	Causes     []string                 `json:"causes"`
	Procedures []string                 `json:"procedures"`
}

type knowledgeMIBDTO struct {
	OID            string `json:"oid"`
	Name           string `json:"name"`
	MIB            string `json:"mib"`
	DataType       string `json:"data_type"`
	Access         string `json:"access"`
	Meaning        string `json:"meaning"`
	ImplSpec       string `json:"impl_spec"`
	InstanceSuffix string `json:"instance_suffix"`
}

// Register 注册知识库查询路由（受全局认证与权限点保护）。
func (h KnowledgeHandler) Register(group *echo.Group) {
	group.GET("/knowledge/huawei/lookup", h.LookupHuaweiKnowledge)
	group.GET("/knowledge/huawei/stats", h.GetHuaweiKnowledgeStats)
}

// LookupHuaweiKnowledge 按 OID / 模块+助记符 / 原始消息检索华为官方排障知识。
func (h KnowledgeHandler) LookupHuaweiKnowledge(c echo.Context) error {
	if _, err := requireAnyPermission(c, h.Auth, monitoringReadPermission, "alerts:read", logsReadPermission); err != nil {
		return err
	}
	oid := strings.TrimSpace(c.QueryParam("oid"))
	module := strings.TrimSpace(c.QueryParam("module"))
	mnemonic := strings.TrimSpace(c.QueryParam("mnemonic"))
	message := strings.TrimSpace(c.QueryParam("message"))
	eventID := strings.TrimSpace(c.QueryParam("event_id"))
	if err := validateKnowledgeLookupParams(oid, module, mnemonic, message, eventID); err != nil {
		return err
	}

	catalog, err := snmpmib.DefaultHuaweiKnowledgeCatalog()
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load huawei knowledge catalog")
	}
	result, ok := catalog.LookupByContext(oid, module, mnemonic, message, eventID)
	if !ok || !result.Matched {
		return c.JSON(http.StatusOK, map[string]any{"success": true, "data": knowledgeLookupData{Matched: false, Kind: ""}})
	}
	return c.JSON(http.StatusOK, map[string]any{"success": true, "data": toKnowledgeLookupData(result)})
}

// GetHuaweiKnowledgeStats 返回内置华为官方知识库的统计概览。
func (h KnowledgeHandler) GetHuaweiKnowledgeStats(c echo.Context) error {
	if _, err := requireAnyPermission(c, h.Auth, monitoringReadPermission, "alerts:read", logsReadPermission); err != nil {
		return err
	}
	catalog, err := snmpmib.DefaultHuaweiKnowledgeCatalog()
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load huawei knowledge catalog")
	}
	return c.JSON(http.StatusOK, map[string]any{"success": true, "data": catalog.Stats()})
}

func validateKnowledgeLookupParams(oid, module, mnemonic, message, eventID string) error {
	if oid == "" && module == "" && mnemonic == "" && message == "" && eventID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "at least one query parameter is required")
	}
	if len(oid) > maxKnowledgeOIDLen || (oid != "" && !knowledgeOIDPattern.MatchString(oid)) {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid oid parameter")
	}
	if len(module) > maxKnowledgeModuleLen || len(mnemonic) > maxKnowledgeMnemonicLen || len(eventID) > maxKnowledgeEventIDLen || len(message) > maxKnowledgeMessageLen {
		return echo.NewHTTPError(http.StatusBadRequest, "query parameter exceeds maximum length")
	}
	return nil
}

func toKnowledgeLookupData(result snmpmib.KnowledgeLookupResult) knowledgeLookupData {
	data := knowledgeLookupData{Matched: result.Matched, Kind: result.Kind}
	if result.Alarm != nil {
		data.Alarm = &knowledgeAlarmDTO{
			OID: result.Alarm.OID, Module: result.Alarm.Module, AlarmName: result.Alarm.AlarmName,
			SubID: result.Alarm.SubID, AlarmID: result.Alarm.AlarmID, Severity: result.Alarm.Severity,
			AlarmType: result.Alarm.AlarmType, TrapTemplate: result.Alarm.TrapTemplate,
			Meaning: result.Alarm.Meaning, Parameters: nonNilSlice(result.Alarm.Parameters),
			Impact: result.Alarm.Impact, Causes: nonNilSlice(result.Alarm.Causes),
			Procedures: nonNilSlice(result.Alarm.Procedures), Reference: result.Alarm.Reference,
			VariantCount: len(result.Alarm.Variants),
		}
	}
	if result.Log != nil {
		data.Log = &knowledgeLogDTO{
			Module: result.Log.Module, Severity: result.Log.Severity, Mnemonic: result.Log.Mnemonic,
			Template: result.Log.Template, Meaning: result.Log.Meaning,
			Parameters: nonNilSlice(result.Log.Parameters), Causes: nonNilSlice(result.Log.Causes),
			Procedures: nonNilSlice(result.Log.Procedures),
		}
	}
	if result.MIB != nil {
		data.MIB = &knowledgeMIBDTO{
			OID: result.MIB.OID, Name: result.MIB.Name, MIB: result.MIB.MIB,
			DataType: result.MIB.DataType, Access: result.MIB.Access,
			Meaning: result.MIB.Meaning, ImplSpec: result.MIB.ImplSpec,
			InstanceSuffix: result.InstanceSuffix,
		}
	}
	return data
}

func nonNilSlice[T any](items []T) []T {
	if items == nil {
		return []T{}
	}
	return items
}
