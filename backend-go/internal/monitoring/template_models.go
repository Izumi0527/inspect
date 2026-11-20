package monitoring

import (
	"time"

	"gorm.io/datatypes"
)

// TemplateMacro 描述监控方案中的友好阈值参数定义（无 {$...} 黑话）。
type TemplateMacro struct {
	Key          string `json:"key"`
	Label        string `json:"label"`
	Unit         string `json:"unit,omitempty"`
	DefaultValue string `json:"default_value"`
	Description  string `json:"description,omitempty"`
}

// MonitorTemplate 对应数据库表 monitor_templates（UI 称“监控方案”）。
type MonitorTemplate struct {
	ID                 int64          `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	Code               string         `gorm:"column:code;size:64;not null;uniqueIndex" json:"code"`
	Name               string         `gorm:"column:name;size:128;not null" json:"name"`
	Vendor             string         `gorm:"column:vendor;size:64;not null;default:''" json:"vendor"`
	DeviceType         string         `gorm:"column:device_type;size:64;not null;default:''" json:"device_type"`
	Description        string         `gorm:"column:description;size:512;not null;default:''" json:"description"`
	IsBuiltin          bool           `gorm:"column:is_builtin;not null;default:false" json:"is_builtin"`
	DefaultIntervalSec int            `gorm:"column:default_interval_sec;not null;default:300" json:"default_interval_sec"`
	MacrosJSON         datatypes.JSON `gorm:"column:macros_json;type:jsonb;not null;default:'[]'" json:"macros_json"`
	CreatedAt          time.Time      `gorm:"column:created_at;not null;autoCreateTime" json:"created_at"`
	UpdatedAt          time.Time      `gorm:"column:updated_at;not null;autoUpdateTime" json:"updated_at"`
}

func (MonitorTemplate) TableName() string {
	return "monitor_templates"
}

// MonitorItem 对应数据库表 monitor_items（UI 称“采集指标”）。
// HTTP 监控项强制拆分为 HTTPScheme + HTTPPort + HTTPPath，禁止自由完整 URL。
type MonitorItem struct {
	ID                int64          `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	TemplateID        int64          `gorm:"column:template_id;not null;uniqueIndex:idx_monitor_items_tpl_key,priority:1" json:"template_id"`
	ItemKey           string         `gorm:"column:item_key;size:128;not null;uniqueIndex:idx_monitor_items_tpl_key,priority:2" json:"item_key"`
	Name              string         `gorm:"column:name;size:128;not null" json:"name"`
	ApplicationTag    string         `gorm:"column:application_tag;size:64;not null;default:''" json:"application_tag"`
	Protocol          string         `gorm:"column:protocol;size:24;not null;default:'snmp_oid'" json:"protocol"`
	TargetExpr        string         `gorm:"column:target_expr;size:256;not null;default:''" json:"target_expr"`
	HTTPScheme        string         `gorm:"column:http_scheme;size:16;not null;default:''" json:"http_scheme"`
	HTTPPort          int            `gorm:"column:http_port;not null;default:0" json:"http_port"`
	HTTPPath          string         `gorm:"column:http_path;size:256;not null;default:''" json:"http_path"`
	ValueType         string         `gorm:"column:value_type;size:24;not null;default:'float'" json:"value_type"`
	Unit              string         `gorm:"column:unit;size:32;not null;default:''" json:"unit"`
	IntervalSec       int            `gorm:"column:interval_sec;not null;default:300" json:"interval_sec"`
	PreprocessingJSON datatypes.JSON `gorm:"column:preprocessing_json;type:jsonb;not null;default:'[]'" json:"preprocessing_json"`
	ValueMapJSON      datatypes.JSON `gorm:"column:value_map_json;type:jsonb;not null;default:'{}'" json:"value_map_json"`
	Enabled           bool           `gorm:"column:enabled;not null;default:true" json:"enabled"`
	CreatedAt         time.Time      `gorm:"column:created_at;not null;autoCreateTime" json:"created_at"`
	UpdatedAt         time.Time      `gorm:"column:updated_at;not null;autoUpdateTime" json:"updated_at"`
}

func (MonitorItem) TableName() string {
	return "monitor_items"
}

// MonitorLLDRule 对应数据库表 monitor_lld_rules（UI 称“端口与硬件自动识别”）。
type MonitorLLDRule struct {
	ID              int64          `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	TemplateID      int64          `gorm:"column:template_id;not null;uniqueIndex:idx_monitor_lld_tpl_key,priority:1" json:"template_id"`
	RuleKey         string         `gorm:"column:rule_key;size:128;not null;uniqueIndex:idx_monitor_lld_tpl_key,priority:2" json:"rule_key"`
	Name            string         `gorm:"column:name;size:128;not null" json:"name"`
	EntityType      string         `gorm:"column:entity_type;size:32;not null;default:'interface'" json:"entity_type"`
	PresetFlagsJSON datatypes.JSON `gorm:"column:preset_flags_json;type:jsonb;not null;default:'{}'" json:"preset_flags_json"`
	IncludeRegex    string         `gorm:"column:include_regex;size:256;not null;default:''" json:"include_regex"`
	ExcludeRegex    string         `gorm:"column:exclude_regex;size:256;not null;default:''" json:"exclude_regex"`
	KeepLostDays    int            `gorm:"column:keep_lost_days;not null;default:7" json:"keep_lost_days"`
	Enabled         bool           `gorm:"column:enabled;not null;default:true" json:"enabled"`
	CreatedAt       time.Time      `gorm:"column:created_at;not null;autoCreateTime" json:"created_at"`
	UpdatedAt       time.Time      `gorm:"column:updated_at;not null;autoUpdateTime" json:"updated_at"`
}

func (MonitorLLDRule) TableName() string {
	return "monitor_lld_rules"
}

// TemplateGroupBinding 对应数据库表 template_group_bindings（按设备组自动生效）。
type TemplateGroupBinding struct {
	ID         int64     `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	TemplateID int64     `gorm:"column:template_id;not null;uniqueIndex:idx_tpl_group_binding,priority:1" json:"template_id"`
	GroupID    int       `gorm:"column:group_id;not null;uniqueIndex:idx_tpl_group_binding,priority:2;index:idx_tpl_group_binding_gid" json:"group_id"`
	Enabled    bool      `gorm:"column:enabled;not null;default:true" json:"enabled"`
	CreatedAt  time.Time `gorm:"column:created_at;not null;autoCreateTime" json:"created_at"`
}

func (TemplateGroupBinding) TableName() string {
	return "template_group_bindings"
}

// DeviceTemplateBinding 对应数据库表 device_template_bindings（单独指定设备与单台阈值微调）。
type DeviceTemplateBinding struct {
	ID                 int64          `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	DeviceID           int            `gorm:"column:device_id;type:bigint;not null;uniqueIndex:idx_device_tpl_binding,priority:1" json:"device_id"`
	TemplateID         int64          `gorm:"column:template_id;not null;uniqueIndex:idx_device_tpl_binding,priority:2;index:idx_device_tpl_binding_tid" json:"template_id"`
	OverrideMacrosJSON datatypes.JSON `gorm:"column:override_macros_json;type:jsonb;not null;default:'{}'" json:"override_macros_json"`
	Enabled            bool           `gorm:"column:enabled;not null;default:true" json:"enabled"`
	CreatedAt          time.Time      `gorm:"column:created_at;not null;autoCreateTime" json:"created_at"`
	UpdatedAt          time.Time      `gorm:"column:updated_at;not null;autoUpdateTime" json:"updated_at"`
}

func (DeviceTemplateBinding) TableName() string {
	return "device_template_bindings"
}
