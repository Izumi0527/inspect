package monitoring

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	MinMonitorIntervalSec = 60
	MaxHTTPPathLength     = 256
	MaxItemsPerTemplate   = 50
)

var (
	ErrTemplateNotFound         = errors.New("监控方案不存在")
	ErrTemplateItemNotFound     = errors.New("采集指标不存在")
	ErrLLDRuleNotFound          = errors.New("自动识别规则不存在")
	ErrBuiltinTemplateImmutable = errors.New("内置监控方案不可直接修改或删除，请克隆后编辑或使用绑定与单机微调")
	ErrTemplateValidation       = errors.New("监控方案参数校验失败")
)

var snmpOIDRegex = regexp.MustCompile(`^\.?[0-9]+(\.[0-9]+){2,32}$`)

// TemplateDetailResponse 包含方案主体、采集指标列表、自动识别规则与绑定统计。
type TemplateDetailResponse struct {
	MonitorTemplate
	Macros          []TemplateMacro  `json:"macros"`
	Items           []MonitorItem    `json:"items"`
	LLDRules        []MonitorLLDRule `json:"lld_rules"`
	BoundGroupIDs   []int            `json:"bound_group_ids"`
	BoundDeviceIDs  []int            `json:"bound_device_ids"`
	DeviceOverrides map[int]string   `json:"device_overrides,omitempty"`
}

// CreateTemplateInput 创建或更新监控方案的强类型输入。
type CreateTemplateInput struct {
	Code               string          `json:"code"`
	Name               string          `json:"name"`
	Vendor             string          `json:"vendor"`
	DeviceType         string          `json:"device_type"`
	Description        string          `json:"description"`
	DefaultIntervalSec int             `json:"default_interval_sec"`
	Macros             []TemplateMacro `json:"macros"`
}

// MonitorItemInput 创建或更新采集指标的强类型输入。
type MonitorItemInput struct {
	ItemKey        string            `json:"item_key"`
	Name           string            `json:"name"`
	ApplicationTag string            `json:"application_tag"`
	Protocol       string            `json:"protocol"`
	TargetExpr     string            `json:"target_expr"`
	HTTPScheme     string            `json:"http_scheme"`
	HTTPPort       int               `json:"http_port"`
	HTTPPath       string            `json:"http_path"`
	ValueType      string            `json:"value_type"`
	Unit           string            `json:"unit"`
	IntervalSec    int               `json:"interval_sec"`
	Preprocessing  []PreprocessStep  `json:"preprocessing"`
	ValueMap       map[string]string `json:"value_map"`
	Enabled        *bool             `json:"enabled"`
}

// MonitorLLDRuleInput 创建或更新自动识别规则的强类型输入。
type MonitorLLDRuleInput struct {
	RuleKey      string         `json:"rule_key"`
	Name         string         `json:"name"`
	EntityType   string         `json:"entity_type"`
	PresetFlags  LLDPresetFlags `json:"preset_flags"`
	IncludeRegex string         `json:"include_regex"`
	ExcludeRegex string         `json:"exclude_regex"`
	KeepLostDays *int           `json:"keep_lost_days"`
	Enabled      *bool          `json:"enabled"`
}

// TemplateBindingsInput 绑定设备组与单台设备的请求结构。
type TemplateBindingsInput struct {
	GroupIDs        []int                        `json:"group_ids"`
	ReplaceGroups   bool                         `json:"replace_groups"`
	DeviceIDs       []int                        `json:"device_ids"`
	DeviceOverrides map[int]map[string]string    `json:"device_overrides"`
	ClearOverrides  []int                        `json:"clear_overrides"`
	BindingItems    []DeviceTemplateBindingInput `json:"binding_items"`
}

// DeviceTemplateBindingInput 单台设备绑定及微调参数。
type DeviceTemplateBindingInput struct {
	DeviceID       int               `json:"device_id"`
	OverrideMacros map[string]string `json:"override_macros"`
	ClearOverrides bool              `json:"clear_overrides"`
	Enabled        *bool             `json:"enabled"`
}

// LLDPreviewRequest 自动识别规则预览请求。
type LLDPreviewRequest struct {
	PresetFlags  LLDPresetFlags `json:"preset_flags"`
	IncludeRegex string         `json:"include_regex"`
	ExcludeRegex string         `json:"exclude_regex"`
	Samples      []string       `json:"samples"`
}

// LLDPreviewResult 自动识别规则预览响应。
type LLDPreviewResult struct {
	Matched  []string `json:"matched"`
	Excluded []string `json:"excluded"`
}

// EffectiveTemplateConfig 表示单台设备按三层优先级解析后的最终生效监控配置。
type EffectiveTemplateConfig struct {
	DeviceID           int               `json:"device_id"`
	EffectiveTemplates []MonitorTemplate `json:"effective_templates"`
	Macros             map[string]string `json:"macros"`
	Items              []MonitorItem     `json:"items"`
	LLDRules           []MonitorLLDRule  `json:"lld_rules"`
}

// ValidateSNMPOID 校验 SNMP OID 格式（仅允许数字点分路径）。
func ValidateSNMPOID(oid string) error {
	trimmed := strings.TrimSpace(oid)
	if !snmpOIDRegex.MatchString(trimmed) {
		return fmt.Errorf("%w: invalid SNMP OID %q", ErrTemplateValidation, oid)
	}
	return nil
}

// ValidateHTTPItemFields 严格校验拆分式 HTTP 监控项字段，防止 SSRF 与路径注入。
func ValidateHTTPItemFields(scheme string, port int, path string) error {
	s := strings.ToLower(strings.TrimSpace(scheme))
	if s != "http" && s != "https" {
		return fmt.Errorf("%w: http_scheme must be http or https", ErrTemplateValidation)
	}
	if port < 1 || port > 65535 {
		return fmt.Errorf("%w: http_port must be between 1 and 65535", ErrTemplateValidation)
	}
	if len(path) == 0 || len(path) > MaxHTTPPathLength {
		return fmt.Errorf("%w: http_path length must be between 1 and %d", ErrTemplateValidation, MaxHTTPPathLength)
	}
	if !strings.HasPrefix(path, "/") {
		return fmt.Errorf("%w: http_path must start with '/'", ErrTemplateValidation)
	}
	if strings.Contains(path, "@") || strings.Contains(path, "//") || strings.Contains(path, "://") {
		return fmt.Errorf("%w: http_path contains forbidden characters (@, //, ://)", ErrTemplateValidation)
	}
	if strings.ContainsAny(path, " \t\r\n") {
		return fmt.Errorf("%w: http_path must not contain whitespace", ErrTemplateValidation)
	}
	for _, r := range path {
		if r < 0x20 || r == 0x7f {
			return fmt.Errorf("%w: http_path must not contain control characters", ErrTemplateValidation)
		}
	}
	return nil
}

func validateMonitorItemInput(input *MonitorItemInput) error {
	input.ItemKey = strings.TrimSpace(input.ItemKey)
	input.Name = strings.TrimSpace(input.Name)
	input.Protocol = strings.ToLower(strings.TrimSpace(input.Protocol))
	if input.ItemKey == "" || input.Name == "" {
		return fmt.Errorf("%w: item_key and name are required", ErrTemplateValidation)
	}
	if input.IntervalSec == 0 {
		input.IntervalSec = 300
	}
	if input.IntervalSec < MinMonitorIntervalSec {
		return fmt.Errorf("%w: interval_sec must be >= %d", ErrTemplateValidation, MinMonitorIntervalSec)
	}

	switch input.Protocol {
	case "builtin", "icmp":
	case "snmp_oid":
		if err := ValidateSNMPOID(input.TargetExpr); err != nil {
			return err
		}
	case "tcp_port":
		port, err := strconv.Atoi(strings.TrimSpace(input.TargetExpr))
		if err != nil || port < 1 || port > 65535 {
			return fmt.Errorf("%w: tcp_port target_expr must be a valid port (1..65535)", ErrTemplateValidation)
		}
	case "http":
		if err := ValidateHTTPItemFields(input.HTTPScheme, input.HTTPPort, input.HTTPPath); err != nil {
			return err
		}
	default:
		return fmt.Errorf("%w: unsupported protocol %q", ErrTemplateValidation, input.Protocol)
	}

	if len(input.Preprocessing) > MaxPreprocessSteps {
		return fmt.Errorf("%w: preprocessing steps exceed limit (%d)", ErrTemplateValidation, MaxPreprocessSteps)
	}
	for _, step := range input.Preprocessing {
		if strings.EqualFold(strings.TrimSpace(step.Type), "regex") {
			pattern := step.Params["pattern"]
			if len(pattern) == 0 || len(pattern) > MaxRegexLength {
				return fmt.Errorf("%w: preprocessing regex pattern length must be 1..%d", ErrTemplateValidation, MaxRegexLength)
			}
			if _, err := regexp.Compile(pattern); err != nil {
				return fmt.Errorf("%w: invalid preprocessing regex: %v", ErrTemplateValidation, err)
			}
		}
	}
	if input.ValueType == "" {
		input.ValueType = "float"
	}
	return nil
}

func validateLLDRuleInput(input *MonitorLLDRuleInput) error {
	input.RuleKey = strings.TrimSpace(input.RuleKey)
	input.Name = strings.TrimSpace(input.Name)
	input.EntityType = strings.ToLower(strings.TrimSpace(input.EntityType))
	if input.RuleKey == "" || input.Name == "" {
		return fmt.Errorf("%w: rule_key and name are required", ErrTemplateValidation)
	}
	if input.EntityType == "" {
		input.EntityType = "interface"
	}
	switch input.EntityType {
	case "interface", "optical", "bgp", "disk":
	default:
		return fmt.Errorf("%w: unsupported entity_type %q", ErrTemplateValidation, input.EntityType)
	}
	if len(input.IncludeRegex) > MaxRegexLength {
		return fmt.Errorf("%w: include_regex exceeds max length %d", ErrTemplateValidation, MaxRegexLength)
	}
	if len(input.ExcludeRegex) > MaxRegexLength {
		return fmt.Errorf("%w: exclude_regex exceeds max length %d", ErrTemplateValidation, MaxRegexLength)
	}
	if strings.TrimSpace(input.IncludeRegex) != "" {
		if _, err := regexp.Compile(input.IncludeRegex); err != nil {
			return fmt.Errorf("%w: invalid include_regex: %v", ErrTemplateValidation, err)
		}
	}
	if strings.TrimSpace(input.ExcludeRegex) != "" {
		if _, err := regexp.Compile(input.ExcludeRegex); err != nil {
			return fmt.Errorf("%w: invalid exclude_regex: %v", ErrTemplateValidation, err)
		}
	}
	return nil
}

// ListMonitorTemplates 返回所有监控方案及关联指标/规则列表。
func (w *MetricsWriter) ListMonitorTemplates(ctx context.Context) ([]TemplateDetailResponse, error) {
	if w == nil || w.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	var templates []MonitorTemplate
	if err := w.db.WithContext(ctx).Order("is_builtin DESC, id ASC").Find(&templates).Error; err != nil {
		return nil, err
	}
	if len(templates) == 0 {
		return []TemplateDetailResponse{}, nil
	}

	ids := make([]int64, 0, len(templates))
	for _, t := range templates {
		ids = append(ids, t.ID)
	}

	var items []MonitorItem
	if err := w.db.WithContext(ctx).Where("template_id IN ?", ids).Order("id ASC").Find(&items).Error; err != nil {
		return nil, err
	}
	var rules []MonitorLLDRule
	if err := w.db.WithContext(ctx).Where("template_id IN ?", ids).Order("id ASC").Find(&rules).Error; err != nil {
		return nil, err
	}
	var groupBindings []TemplateGroupBinding
	if err := w.db.WithContext(ctx).Where("template_id IN ? AND enabled = ?", ids, true).Find(&groupBindings).Error; err != nil {
		return nil, err
	}
	var deviceBindings []DeviceTemplateBinding
	if err := w.db.WithContext(ctx).Where("template_id IN ? AND enabled = ?", ids, true).Find(&deviceBindings).Error; err != nil {
		return nil, err
	}

	itemsByTpl := make(map[int64][]MonitorItem)
	for _, item := range items {
		itemsByTpl[item.TemplateID] = append(itemsByTpl[item.TemplateID], item)
	}
	rulesByTpl := make(map[int64][]MonitorLLDRule)
	for _, rule := range rules {
		rulesByTpl[rule.TemplateID] = append(rulesByTpl[rule.TemplateID], rule)
	}
	groupsByTpl := make(map[int64][]int)
	for _, gb := range groupBindings {
		groupsByTpl[gb.TemplateID] = append(groupsByTpl[gb.TemplateID], gb.GroupID)
	}
	devicesByTpl := make(map[int64][]int)
	for _, dbind := range deviceBindings {
		devicesByTpl[dbind.TemplateID] = append(devicesByTpl[dbind.TemplateID], dbind.DeviceID)
	}

	out := make([]TemplateDetailResponse, 0, len(templates))
	for _, t := range templates {
		var macros []TemplateMacro
		if len(t.MacrosJSON) > 0 {
			_ = json.Unmarshal(t.MacrosJSON, &macros)
		}
		out = append(out, TemplateDetailResponse{
			MonitorTemplate: t,
			Macros:          macros,
			Items:           itemsByTpl[t.ID],
			LLDRules:        rulesByTpl[t.ID],
			BoundGroupIDs:   groupsByTpl[t.ID],
			BoundDeviceIDs:  devicesByTpl[t.ID],
		})
	}
	return out, nil
}

// GetMonitorTemplate 返回单个监控方案详情。
func (w *MetricsWriter) GetMonitorTemplate(ctx context.Context, templateID int64) (*TemplateDetailResponse, error) {
	if w == nil || w.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	var tpl MonitorTemplate
	if err := w.db.WithContext(ctx).Where("id = ?", templateID).Take(&tpl).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrTemplateNotFound
		}
		return nil, err
	}
	var items []MonitorItem
	if err := w.db.WithContext(ctx).Where("template_id = ?", templateID).Order("id ASC").Find(&items).Error; err != nil {
		return nil, err
	}
	var rules []MonitorLLDRule
	if err := w.db.WithContext(ctx).Where("template_id = ?", templateID).Order("id ASC").Find(&rules).Error; err != nil {
		return nil, err
	}
	var groupBindings []TemplateGroupBinding
	_ = w.db.WithContext(ctx).Where("template_id = ? AND enabled = ?", templateID, true).Find(&groupBindings).Error
	var deviceBindings []DeviceTemplateBinding
	_ = w.db.WithContext(ctx).Where("template_id = ? AND enabled = ?", templateID, true).Find(&deviceBindings).Error

	groupIDs := make([]int, 0, len(groupBindings))
	for _, gb := range groupBindings {
		groupIDs = append(groupIDs, gb.GroupID)
	}
	deviceIDs := make([]int, 0, len(deviceBindings))
	overrides := make(map[int]string)
	for _, dbind := range deviceBindings {
		deviceIDs = append(deviceIDs, dbind.DeviceID)
		if len(dbind.OverrideMacrosJSON) > 0 && string(dbind.OverrideMacrosJSON) != "{}" {
			overrides[dbind.DeviceID] = string(dbind.OverrideMacrosJSON)
		}
	}
	var macros []TemplateMacro
	if len(tpl.MacrosJSON) > 0 {
		_ = json.Unmarshal(tpl.MacrosJSON, &macros)
	}

	return &TemplateDetailResponse{
		MonitorTemplate: tpl,
		Macros:          macros,
		Items:           items,
		LLDRules:        rules,
		BoundGroupIDs:   groupIDs,
		BoundDeviceIDs:  deviceIDs,
		DeviceOverrides: overrides,
	}, nil
}

// CreateMonitorTemplate 创建自定义监控方案。
func (w *MetricsWriter) CreateMonitorTemplate(ctx context.Context, input CreateTemplateInput) (*MonitorTemplate, error) {
	if w == nil || w.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	name := strings.TrimSpace(input.Name)
	code := strings.TrimSpace(input.Code)
	if name == "" {
		return nil, fmt.Errorf("%w: name is required", ErrTemplateValidation)
	}
	if code == "" {
		code = fmt.Sprintf("custom_%d", time.Now().UTC().UnixNano())
	}
	interval := input.DefaultIntervalSec
	if interval == 0 {
		interval = 300
	}
	if interval < MinMonitorIntervalSec {
		return nil, fmt.Errorf("%w: default_interval_sec must be >= %d", ErrTemplateValidation, MinMonitorIntervalSec)
	}
	now := time.Now().UTC()
	tpl := MonitorTemplate{
		Code:               code,
		Name:               name,
		Vendor:             strings.TrimSpace(input.Vendor),
		DeviceType:         strings.TrimSpace(input.DeviceType),
		Description:        strings.TrimSpace(input.Description),
		IsBuiltin:          false,
		DefaultIntervalSec: interval,
		MacrosJSON:         mustJSONBytes(input.Macros),
		CreatedAt:          now,
		UpdatedAt:          now,
	}
	if err := w.db.WithContext(ctx).Create(&tpl).Error; err != nil {
		return nil, err
	}
	return &tpl, nil
}

// UpdateMonitorTemplate 更新自定义监控方案；内置方案禁止直接修改。
func (w *MetricsWriter) UpdateMonitorTemplate(ctx context.Context, templateID int64, input CreateTemplateInput) (*MonitorTemplate, error) {
	if w == nil || w.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	var tpl MonitorTemplate
	if err := w.db.WithContext(ctx).Where("id = ?", templateID).Take(&tpl).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrTemplateNotFound
		}
		return nil, err
	}
	if tpl.IsBuiltin {
		return nil, ErrBuiltinTemplateImmutable
	}
	if strings.TrimSpace(input.Name) != "" {
		tpl.Name = strings.TrimSpace(input.Name)
	}
	if input.DefaultIntervalSec != 0 {
		if input.DefaultIntervalSec < MinMonitorIntervalSec {
			return nil, fmt.Errorf("%w: default_interval_sec must be >= %d", ErrTemplateValidation, MinMonitorIntervalSec)
		}
		tpl.DefaultIntervalSec = input.DefaultIntervalSec
	}
	tpl.Vendor = strings.TrimSpace(input.Vendor)
	tpl.DeviceType = strings.TrimSpace(input.DeviceType)
	tpl.Description = strings.TrimSpace(input.Description)
	if input.Macros != nil {
		tpl.MacrosJSON = mustJSONBytes(input.Macros)
	}
	tpl.UpdatedAt = time.Now().UTC()

	if err := w.db.WithContext(ctx).Save(&tpl).Error; err != nil {
		return nil, err
	}
	return &tpl, nil
}

// DeleteMonitorTemplate 删除自定义监控方案及关联指标/规则/绑定；内置方案禁止删除。
func (w *MetricsWriter) DeleteMonitorTemplate(ctx context.Context, templateID int64) error {
	if w == nil || w.db == nil {
		return fmt.Errorf("database not initialized")
	}
	return w.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var tpl MonitorTemplate
		if err := tx.Where("id = ?", templateID).Take(&tpl).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrTemplateNotFound
			}
			return err
		}
		if tpl.IsBuiltin {
			return ErrBuiltinTemplateImmutable
		}
		if err := tx.Where("template_id = ?", templateID).Delete(&MonitorItem{}).Error; err != nil {
			return err
		}
		if err := tx.Where("template_id = ?", templateID).Delete(&MonitorLLDRule{}).Error; err != nil {
			return err
		}
		if err := tx.Where("template_id = ?", templateID).Delete(&TemplateGroupBinding{}).Error; err != nil {
			return err
		}
		if err := tx.Where("template_id = ?", templateID).Delete(&DeviceTemplateBinding{}).Error; err != nil {
			return err
		}
		return tx.Where("id = ?", templateID).Delete(&MonitorTemplate{}).Error
	})
}

// CloneMonitorTemplate 克隆指定方案（含内置方案）为可编辑自定义方案，完整复制指标与自动识别规则。
func (w *MetricsWriter) CloneMonitorTemplate(ctx context.Context, sourceID int64, newName string) (*TemplateDetailResponse, error) {
	if w == nil || w.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	var clonedID int64
	err := w.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var src MonitorTemplate
		if err := tx.Where("id = ?", sourceID).Take(&src).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrTemplateNotFound
			}
			return err
		}
		name := strings.TrimSpace(newName)
		if name == "" {
			name = src.Name + " (副本)"
		}
		now := time.Now().UTC()
		cloned := MonitorTemplate{
			Code:               fmt.Sprintf("clone_%s_%d", src.Code, now.UnixNano()),
			Name:               name,
			Vendor:             src.Vendor,
			DeviceType:         src.DeviceType,
			Description:        src.Description,
			IsBuiltin:          false,
			DefaultIntervalSec: src.DefaultIntervalSec,
			MacrosJSON:         src.MacrosJSON,
			CreatedAt:          now,
			UpdatedAt:          now,
		}
		if err := tx.Create(&cloned).Error; err != nil {
			return err
		}
		clonedID = cloned.ID

		var items []MonitorItem
		if err := tx.Where("template_id = ?", sourceID).Find(&items).Error; err != nil {
			return err
		}
		for _, item := range items {
			item.ID = 0
			item.TemplateID = cloned.ID
			item.CreatedAt = now
			item.UpdatedAt = now
			if err := tx.Create(&item).Error; err != nil {
				return err
			}
		}

		var rules []MonitorLLDRule
		if err := tx.Where("template_id = ?", sourceID).Find(&rules).Error; err != nil {
			return err
		}
		for _, rule := range rules {
			rule.ID = 0
			rule.TemplateID = cloned.ID
			rule.CreatedAt = now
			rule.UpdatedAt = now
			if err := tx.Create(&rule).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return w.GetMonitorTemplate(ctx, clonedID)
}

// UpdateTemplateBindings 更新方案的设备组绑定与单台设备绑定/微调（支持内置与自定义方案）。
func (w *MetricsWriter) UpdateTemplateBindings(ctx context.Context, templateID int64, input TemplateBindingsInput) error {
	if w == nil || w.db == nil {
		return fmt.Errorf("database not initialized")
	}
	return w.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var tpl MonitorTemplate
		if err := tx.Where("id = ?", templateID).Take(&tpl).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrTemplateNotFound
			}
			return err
		}

		now := time.Now().UTC()
		if input.ReplaceGroups {
			if err := tx.Where("template_id = ?", templateID).Delete(&TemplateGroupBinding{}).Error; err != nil {
				return err
			}
		}
		for _, gid := range input.GroupIDs {
			if gid <= 0 {
				continue
			}
			gb := TemplateGroupBinding{
				TemplateID: templateID,
				GroupID:    gid,
				Enabled:    true,
				CreatedAt:  now,
			}
			if err := tx.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "template_id"}, {Name: "group_id"}},
				DoUpdates: clause.AssignmentColumns([]string{"enabled"}),
			}).Create(&gb).Error; err != nil {
				return err
			}
		}

		clearSet := make(map[int]bool, len(input.ClearOverrides))
		for _, did := range input.ClearOverrides {
			clearSet[did] = true
		}

		for _, did := range input.DeviceIDs {
			if did <= 0 {
				continue
			}
			overrideJSON := datatypes.JSON([]byte("{}"))
			if !clearSet[did] {
				if ov, ok := input.DeviceOverrides[did]; ok && len(ov) > 0 {
					overrideJSON = mustJSONBytes(ov)
				}
			}
			dbind := DeviceTemplateBinding{
				DeviceID:           did,
				TemplateID:         templateID,
				OverrideMacrosJSON: overrideJSON,
				Enabled:            true,
				CreatedAt:          now,
				UpdatedAt:          now,
			}
			if err := tx.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "device_id"}, {Name: "template_id"}},
				DoUpdates: clause.AssignmentColumns([]string{"override_macros_json", "enabled", "updated_at"}),
			}).Create(&dbind).Error; err != nil {
				return err
			}
		}

		// 支持仅传 DeviceOverrides 或 ClearOverrides 更新已有/新增绑定
		for did, ov := range input.DeviceOverrides {
			if did <= 0 {
				continue
			}
			overrideJSON := mustJSONBytes(ov)
			if clearSet[did] {
				overrideJSON = datatypes.JSON([]byte("{}"))
			}
			dbind := DeviceTemplateBinding{
				DeviceID:           did,
				TemplateID:         templateID,
				OverrideMacrosJSON: overrideJSON,
				Enabled:            true,
				CreatedAt:          now,
				UpdatedAt:          now,
			}
			if err := tx.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "device_id"}, {Name: "template_id"}},
				DoUpdates: clause.AssignmentColumns([]string{"override_macros_json", "enabled", "updated_at"}),
			}).Create(&dbind).Error; err != nil {
				return err
			}
		}

		for _, did := range input.ClearOverrides {
			if did <= 0 {
				continue
			}
			if err := tx.Model(&DeviceTemplateBinding{}).
				Where("device_id = ? AND template_id = ?", did, templateID).
				Updates(map[string]interface{}{
					"override_macros_json": datatypes.JSON([]byte("{}")),
					"updated_at":           now,
				}).Error; err != nil {
				return err
			}
		}

		for _, item := range input.BindingItems {
			if item.DeviceID <= 0 {
				continue
			}
			enabled := true
			if item.Enabled != nil {
				enabled = *item.Enabled
			}
			overrideJSON := datatypes.JSON([]byte("{}"))
			if !item.ClearOverrides && len(item.OverrideMacros) > 0 {
				overrideJSON = mustJSONBytes(item.OverrideMacros)
			}
			dbind := DeviceTemplateBinding{
				DeviceID:           item.DeviceID,
				TemplateID:         templateID,
				OverrideMacrosJSON: overrideJSON,
				Enabled:            enabled,
				CreatedAt:          now,
				UpdatedAt:          now,
			}
			if err := tx.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "device_id"}, {Name: "template_id"}},
				DoUpdates: clause.AssignmentColumns([]string{"override_macros_json", "enabled", "updated_at"}),
			}).Create(&dbind).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// ListTemplateItems 返回指定方案的采集指标列表。
func (w *MetricsWriter) ListTemplateItems(ctx context.Context, templateID int64) ([]MonitorItem, error) {
	if w == nil || w.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	var count int64
	if err := w.db.WithContext(ctx).Model(&MonitorTemplate{}).Where("id = ?", templateID).Count(&count).Error; err != nil {
		return nil, err
	}
	if count == 0 {
		return nil, ErrTemplateNotFound
	}
	var items []MonitorItem
	if err := w.db.WithContext(ctx).Where("template_id = ?", templateID).Order("id ASC").Find(&items).Error; err != nil {
		return nil, err
	}
	return items, nil
}

// CreateTemplateItem 在自定义方案下新增采集指标（每模板上限 50 项）。
func (w *MetricsWriter) CreateTemplateItem(ctx context.Context, templateID int64, input MonitorItemInput) (*MonitorItem, error) {
	if w == nil || w.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	if err := validateMonitorItemInput(&input); err != nil {
		return nil, err
	}
	var created MonitorItem
	err := w.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var tpl MonitorTemplate
		if err := tx.Where("id = ?", templateID).Take(&tpl).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrTemplateNotFound
			}
			return err
		}
		if tpl.IsBuiltin {
			return ErrBuiltinTemplateImmutable
		}
		var cnt int64
		if err := tx.Model(&MonitorItem{}).Where("template_id = ?", templateID).Count(&cnt).Error; err != nil {
			return err
		}
		if cnt >= MaxItemsPerTemplate {
			return fmt.Errorf("%w: template item count exceeds limit (%d)", ErrTemplateValidation, MaxItemsPerTemplate)
		}

		enabled := true
		if input.Enabled != nil {
			enabled = *input.Enabled
		}
		now := time.Now().UTC()
		created = MonitorItem{
			TemplateID:        templateID,
			ItemKey:           input.ItemKey,
			Name:              input.Name,
			ApplicationTag:    strings.TrimSpace(input.ApplicationTag),
			Protocol:          input.Protocol,
			TargetExpr:        strings.TrimSpace(input.TargetExpr),
			HTTPScheme:        strings.ToLower(strings.TrimSpace(input.HTTPScheme)),
			HTTPPort:          input.HTTPPort,
			HTTPPath:          input.HTTPPath,
			ValueType:         input.ValueType,
			Unit:              strings.TrimSpace(input.Unit),
			IntervalSec:       input.IntervalSec,
			PreprocessingJSON: mustJSONBytes(input.Preprocessing),
			ValueMapJSON:      mustJSONBytes(input.ValueMap),
			Enabled:           enabled,
			CreatedAt:         now,
			UpdatedAt:         now,
		}
		return tx.Create(&created).Error
	})
	if err != nil {
		return nil, err
	}
	return &created, nil
}

// UpdateTemplateItem 更新采集指标。
func (w *MetricsWriter) UpdateTemplateItem(ctx context.Context, templateID int64, itemID int64, input MonitorItemInput) (*MonitorItem, error) {
	if w == nil || w.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	if err := validateMonitorItemInput(&input); err != nil {
		return nil, err
	}
	var updated MonitorItem
	err := w.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var tpl MonitorTemplate
		if err := tx.Where("id = ?", templateID).Take(&tpl).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrTemplateNotFound
			}
			return err
		}
		if tpl.IsBuiltin {
			return ErrBuiltinTemplateImmutable
		}
		if err := tx.Where("id = ? AND template_id = ?", itemID, templateID).Take(&updated).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrTemplateItemNotFound
			}
			return err
		}
		updated.ItemKey = input.ItemKey
		updated.Name = input.Name
		updated.ApplicationTag = strings.TrimSpace(input.ApplicationTag)
		updated.Protocol = input.Protocol
		updated.TargetExpr = strings.TrimSpace(input.TargetExpr)
		updated.HTTPScheme = strings.ToLower(strings.TrimSpace(input.HTTPScheme))
		updated.HTTPPort = input.HTTPPort
		updated.HTTPPath = input.HTTPPath
		updated.ValueType = input.ValueType
		updated.Unit = strings.TrimSpace(input.Unit)
		updated.IntervalSec = input.IntervalSec
		updated.PreprocessingJSON = mustJSONBytes(input.Preprocessing)
		updated.ValueMapJSON = mustJSONBytes(input.ValueMap)
		if input.Enabled != nil {
			updated.Enabled = *input.Enabled
		}
		updated.UpdatedAt = time.Now().UTC()
		return tx.Save(&updated).Error
	})
	if err != nil {
		return nil, err
	}
	return &updated, nil
}

// DeleteTemplateItem 删除自定义方案中的采集指标。
func (w *MetricsWriter) DeleteTemplateItem(ctx context.Context, templateID int64, itemID int64) error {
	if w == nil || w.db == nil {
		return fmt.Errorf("database not initialized")
	}
	return w.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var tpl MonitorTemplate
		if err := tx.Where("id = ?", templateID).Take(&tpl).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrTemplateNotFound
			}
			return err
		}
		if tpl.IsBuiltin {
			return ErrBuiltinTemplateImmutable
		}
		res := tx.Where("id = ? AND template_id = ?", itemID, templateID).Delete(&MonitorItem{})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return ErrTemplateItemNotFound
		}
		return nil
	})
}

// ListTemplateLLDRules 返回指定方案的自动识别规则列表。
func (w *MetricsWriter) ListTemplateLLDRules(ctx context.Context, templateID int64) ([]MonitorLLDRule, error) {
	if w == nil || w.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	var count int64
	if err := w.db.WithContext(ctx).Model(&MonitorTemplate{}).Where("id = ?", templateID).Count(&count).Error; err != nil {
		return nil, err
	}
	if count == 0 {
		return nil, ErrTemplateNotFound
	}
	var rules []MonitorLLDRule
	if err := w.db.WithContext(ctx).Where("template_id = ?", templateID).Order("id ASC").Find(&rules).Error; err != nil {
		return nil, err
	}
	return rules, nil
}

// CreateTemplateLLDRule 创建自动识别规则。
func (w *MetricsWriter) CreateTemplateLLDRule(ctx context.Context, templateID int64, input MonitorLLDRuleInput) (*MonitorLLDRule, error) {
	if w == nil || w.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	if err := validateLLDRuleInput(&input); err != nil {
		return nil, err
	}
	var created MonitorLLDRule
	err := w.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var tpl MonitorTemplate
		if err := tx.Where("id = ?", templateID).Take(&tpl).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrTemplateNotFound
			}
			return err
		}
		if tpl.IsBuiltin {
			return ErrBuiltinTemplateImmutable
		}
		keepDays := 7
		if input.KeepLostDays != nil && *input.KeepLostDays >= 0 {
			keepDays = *input.KeepLostDays
		}
		enabled := true
		if input.Enabled != nil {
			enabled = *input.Enabled
		}
		now := time.Now().UTC()
		created = MonitorLLDRule{
			TemplateID:      templateID,
			RuleKey:         input.RuleKey,
			Name:            input.Name,
			EntityType:      input.EntityType,
			PresetFlagsJSON: mustJSONBytes(input.PresetFlags),
			IncludeRegex:    input.IncludeRegex,
			ExcludeRegex:    input.ExcludeRegex,
			KeepLostDays:    keepDays,
			Enabled:         enabled,
			CreatedAt:       now,
			UpdatedAt:       now,
		}
		return tx.Create(&created).Error
	})
	if err != nil {
		return nil, err
	}
	return &created, nil
}

// UpdateTemplateLLDRule 更新自动识别规则。
func (w *MetricsWriter) UpdateTemplateLLDRule(ctx context.Context, templateID int64, ruleID int64, input MonitorLLDRuleInput) (*MonitorLLDRule, error) {
	if w == nil || w.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	if err := validateLLDRuleInput(&input); err != nil {
		return nil, err
	}
	var updated MonitorLLDRule
	err := w.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var tpl MonitorTemplate
		if err := tx.Where("id = ?", templateID).Take(&tpl).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrTemplateNotFound
			}
			return err
		}
		if tpl.IsBuiltin {
			return ErrBuiltinTemplateImmutable
		}
		if err := tx.Where("id = ? AND template_id = ?", ruleID, templateID).Take(&updated).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrLLDRuleNotFound
			}
			return err
		}
		updated.RuleKey = input.RuleKey
		updated.Name = input.Name
		updated.EntityType = input.EntityType
		updated.PresetFlagsJSON = mustJSONBytes(input.PresetFlags)
		updated.IncludeRegex = input.IncludeRegex
		updated.ExcludeRegex = input.ExcludeRegex
		if input.KeepLostDays != nil && *input.KeepLostDays >= 0 {
			updated.KeepLostDays = *input.KeepLostDays
		}
		if input.Enabled != nil {
			updated.Enabled = *input.Enabled
		}
		updated.UpdatedAt = time.Now().UTC()
		return tx.Save(&updated).Error
	})
	if err != nil {
		return nil, err
	}
	return &updated, nil
}

// DeleteTemplateLLDRule 删除自动识别规则。
func (w *MetricsWriter) DeleteTemplateLLDRule(ctx context.Context, templateID int64, ruleID int64) error {
	if w == nil || w.db == nil {
		return fmt.Errorf("database not initialized")
	}
	return w.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var tpl MonitorTemplate
		if err := tx.Where("id = ?", templateID).Take(&tpl).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrTemplateNotFound
			}
			return err
		}
		if tpl.IsBuiltin {
			return ErrBuiltinTemplateImmutable
		}
		res := tx.Where("id = ? AND template_id = ?", ruleID, templateID).Delete(&MonitorLLDRule{})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return ErrLLDRuleNotFound
		}
		return nil
	})
}

// PreviewLLDRule 对样本实体列表执行预设开关与正则编译过滤预览。
func PreviewLLDRule(req LLDPreviewRequest) (LLDPreviewResult, error) {
	rule := MonitorLLDRule{
		PresetFlagsJSON: mustJSONBytes(req.PresetFlags),
		IncludeRegex:    req.IncludeRegex,
		ExcludeRegex:    req.ExcludeRegex,
	}
	matcher, err := CompileLLDMatcher(rule)
	if err != nil {
		return LLDPreviewResult{}, fmt.Errorf("%w: %v", ErrTemplateValidation, err)
	}
	res := LLDPreviewResult{
		Matched:  make([]string, 0, len(req.Samples)),
		Excluded: make([]string, 0),
	}
	for _, sample := range req.Samples {
		if matcher.Match(sample) {
			res.Matched = append(res.Matched, sample)
		} else {
			res.Excluded = append(res.Excluded, sample)
		}
	}
	return res, nil
}

// ResolveEffectiveTemplateConfig 按三层优先级解析单台设备的最终生效监控配置：
// 单台直接指定与微调 > 子分组绑定 > 父分组绑定 > 方案默认；同名项取最短合法采集间隔。
func (w *MetricsWriter) ResolveEffectiveTemplateConfig(ctx context.Context, deviceID int) (*EffectiveTemplateConfig, error) {
	if w == nil || w.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	var dev struct {
		ID      int  `gorm:"column:id"`
		GroupID *int `gorm:"column:group_id"`
	}
	if err := w.db.WithContext(ctx).Table("devices").Select("id, group_id").Where("id = ?", deviceID).Take(&dev).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrDeviceNotFound
		}
		return nil, err
	}

	// 1. 收集分层分组链路（[直接分组, 父分组, 祖父分组...]，限制最大深度防环）
	groupChain := make([]int, 0, 4)
	if dev.GroupID != nil && *dev.GroupID > 0 {
		visited := map[int]bool{}
		currID := *dev.GroupID
		for currID > 0 && !visited[currID] && len(groupChain) < 8 {
			visited[currID] = true
			groupChain = append(groupChain, currID)
			var parent struct {
				ParentID *int `gorm:"column:parent_id"`
			}
			if err := w.db.WithContext(ctx).Table("device_groups").Select("parent_id").Where("id = ?", currID).Take(&parent).Error; err != nil {
				break
			}
			if parent.ParentID == nil {
				break
			}
			currID = *parent.ParentID
		}
	}

	// 2. 查询组绑定与单台直接绑定
	type rankedTemplate struct {
		TemplateID int64
		Priority   int // 数字越小优先级越高: 0=direct, 1+idx=groupChain[idx]
		Overrides  map[string]string
	}
	ranked := make([]rankedTemplate, 0)
	seenTpl := map[int64]bool{}

	var directBindings []DeviceTemplateBinding
	if err := w.db.WithContext(ctx).Where("device_id = ? AND enabled = ?", deviceID, true).Order("id ASC").Find(&directBindings).Error; err != nil {
		return nil, err
	}
	for _, dbind := range directBindings {
		ov := map[string]string{}
		if len(dbind.OverrideMacrosJSON) > 0 {
			_ = json.Unmarshal(dbind.OverrideMacrosJSON, &ov)
		}
		ranked = append(ranked, rankedTemplate{TemplateID: dbind.TemplateID, Priority: 0, Overrides: ov})
		seenTpl[dbind.TemplateID] = true
	}

	if len(groupChain) > 0 {
		var groupBindings []TemplateGroupBinding
		if err := w.db.WithContext(ctx).Where("group_id IN ? AND enabled = ?", groupChain, true).Order("id ASC").Find(&groupBindings).Error; err != nil {
			return nil, err
		}
		for idx, gid := range groupChain {
			for _, gb := range groupBindings {
				if gb.GroupID == gid && !seenTpl[gb.TemplateID] {
					ranked = append(ranked, rankedTemplate{TemplateID: gb.TemplateID, Priority: idx + 1})
					seenTpl[gb.TemplateID] = true
				}
			}
		}
	}

	cfg := &EffectiveTemplateConfig{
		DeviceID:           deviceID,
		EffectiveTemplates: make([]MonitorTemplate, 0, len(ranked)),
		Macros:             make(map[string]string),
		Items:              make([]MonitorItem, 0),
		LLDRules:           make([]MonitorLLDRule, 0),
	}
	if len(ranked) == 0 {
		return cfg, nil
	}

	tplIDs := make([]int64, 0, len(ranked))
	for _, r := range ranked {
		tplIDs = append(tplIDs, r.TemplateID)
	}

	var templates []MonitorTemplate
	if err := w.db.WithContext(ctx).Where("id IN ?", tplIDs).Find(&templates).Error; err != nil {
		return nil, err
	}
	tplMap := make(map[int64]MonitorTemplate, len(templates))
	for _, t := range templates {
		tplMap[t.ID] = t
	}

	var allItems []MonitorItem
	if err := w.db.WithContext(ctx).Where("template_id IN ? AND enabled = ?", tplIDs, true).Order("id ASC").Find(&allItems).Error; err != nil {
		return nil, err
	}
	var allRules []MonitorLLDRule
	if err := w.db.WithContext(ctx).Where("template_id IN ? AND enabled = ?", tplIDs, true).Order("id ASC").Find(&allRules).Error; err != nil {
		return nil, err
	}

	// 先按优先级从低到高合并全部模板默认宏，再统一叠加单台 Overrides，
	// 防止多个直接绑定中较前模板的默认宏覆盖较后模板的显式单机微调。
	for i := len(ranked) - 1; i >= 0; i-- {
		r := ranked[i]
		if tpl, ok := tplMap[r.TemplateID]; ok {
			var macros []TemplateMacro
			if len(tpl.MacrosJSON) > 0 {
				_ = json.Unmarshal(tpl.MacrosJSON, &macros)
			}
			for _, m := range macros {
				if strings.TrimSpace(m.Key) != "" {
					cfg.Macros[m.Key] = m.DefaultValue
				}
			}
		}
	}
	for i := len(ranked) - 1; i >= 0; i-- {
		for k, v := range ranked[i].Overrides {
			if strings.TrimSpace(k) != "" && strings.TrimSpace(v) != "" {
				cfg.Macros[k] = v
			}
		}
	}

	for _, r := range ranked {
		if tpl, ok := tplMap[r.TemplateID]; ok {
			cfg.EffectiveTemplates = append(cfg.EffectiveTemplates, tpl)
		}
	}

	// 同名采集项冲突时取更短合法采集周期 (>= 60s)
	itemByKey := make(map[string]MonitorItem)
	itemOrder := make([]string, 0)
	for _, item := range allItems {
		existing, ok := itemByKey[item.ItemKey]
		if !ok {
			itemByKey[item.ItemKey] = item
			itemOrder = append(itemOrder, item.ItemKey)
			continue
		}
		if item.IntervalSec >= MinMonitorIntervalSec && (existing.IntervalSec < MinMonitorIntervalSec || item.IntervalSec < existing.IntervalSec) {
			itemByKey[item.ItemKey] = item
		}
	}
	for _, key := range itemOrder {
		cfg.Items = append(cfg.Items, itemByKey[key])
	}

	ruleByKey := make(map[string]MonitorLLDRule)
	ruleOrder := make([]string, 0)
	for _, rule := range allRules {
		if _, ok := ruleByKey[rule.RuleKey]; !ok {
			ruleByKey[rule.RuleKey] = rule
			ruleOrder = append(ruleOrder, rule.RuleKey)
		}
	}
	for _, key := range ruleOrder {
		cfg.LLDRules = append(cfg.LLDRules, ruleByKey[key])
	}

	return cfg, nil
}
