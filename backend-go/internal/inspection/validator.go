package inspection

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
)

// Validation error types
var (
	// Template related errors
	ErrTemplateNotFound           = errors.New("模板不存在")
	ErrCannotModifyBuiltInTemplate = errors.New("不能修改内置模板")
	ErrCannotDeleteBuiltInTemplate = errors.New("不能删除内置模板")
	ErrTemplateNameRequired       = errors.New("模板名称不能为空")
	ErrTemplateNameTooLong        = errors.New("模板名称过长")
	ErrDuplicateTemplateName      = errors.New("模板名称已存在")

	// Check item related errors
	ErrNoCheckItems            = errors.New("模板必须包含至少一个检查项")
	ErrInvalidCheckItemsFormat = errors.New("检查项格式无效")
	ErrCheckItemMissingFields  = errors.New("检查项缺少必需字段")
	ErrInvalidCheckItemType    = errors.New("检查项类型无效")

	// Configuration related errors
	ErrOIDRequired      = errors.New("SNMP 检查项必须包含 OID")
	ErrInvalidOIDFormat = errors.New("OID 格式无效")
	ErrCommandRequired  = errors.New("SSH 检查项必须包含命令")
	ErrInvalidThreshold = errors.New("阈值配置无效：警告阈值必须小于严重告警阈值")

	// Import/Export related errors
	ErrInvalidImportFormat    = errors.New("导入文件格式无效")
	ErrImportValidationFailed = errors.New("导入数据验证失败")

	// OID test related errors
	ErrDeviceNotFound       = errors.New("设备不存在")
	ErrSNMPConnectionFailed = errors.New("SNMP 连接失败")
	ErrOIDQueryFailed       = errors.New("OID 查询失败")
)

// ValidationError represents a detailed validation error with context
type ValidationError struct {
	Field   string
	Message string
	Err     error
}

func (e *ValidationError) Error() string {
	if e.Field != "" {
		return fmt.Sprintf("%s: %s", e.Field, e.Message)
	}
	return e.Message
}

func (e *ValidationError) Unwrap() error {
	return e.Err
}

// CheckItem represents a single check item in a template
type CheckItem struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	Description string                 `json:"description,omitempty"`
	Type        string                 `json:"type"`
	Category    string                 `json:"category,omitempty"`
	Weight      float64                `json:"weight,omitempty"`
	Config      map[string]interface{} `json:"config"`
	Enabled     bool                   `json:"enabled"`
}

// DeviceTypesConfig represents the device types configuration in a template
type DeviceTypesConfig struct {
	Vendors     []string `json:"vendors"`
	DeviceTypes []string `json:"device_types"`
	Models      []string `json:"models,omitempty"`
}

// ThresholdConfig represents threshold configuration for check items
type ThresholdConfig struct {
	Warning  float64 `json:"warning"`
	Critical float64 `json:"critical"`
}

// TemplateValidator defines the interface for template validation
type TemplateValidator interface {
	// ValidateTemplate validates a complete template
	ValidateTemplate(ctx context.Context, template *Template) error

	// ValidateTemplateName validates the template name
	ValidateTemplateName(name string) error

	// ValidateCheckItems validates all check items in a template
	ValidateCheckItems(checkItems []CheckItem) error

	// ValidateCheckItem validates a single check item
	ValidateCheckItem(item *CheckItem) error

	// ValidateCheckItemType validates the check item type
	ValidateCheckItemType(itemType string) error

	// ValidateSNMPConfig validates SNMP check item configuration
	ValidateSNMPConfig(config map[string]interface{}) error

	// ValidateSSHConfig validates SSH check item configuration
	ValidateSSHConfig(config map[string]interface{}) error

	// ValidateThreshold validates threshold configuration
	ValidateThreshold(threshold *ThresholdConfig) error

	// ValidateOIDFormat validates OID format
	ValidateOIDFormat(oid string) error
}

// templateValidator implements the TemplateValidator interface
type templateValidator struct {
	db *Service
}

// NewTemplateValidator creates a new template validator
func NewTemplateValidator(service *Service) TemplateValidator {
	return &templateValidator{
		db: service,
	}
}

// ValidateTemplate validates a complete template
// Validates: Requirements 12.1, 12.2
func (v *templateValidator) ValidateTemplate(ctx context.Context, template *Template) error {
	// Validate template name
	if err := v.ValidateTemplateName(template.Name); err != nil {
		return err
	}

	// Parse and validate check items
	var checkItems []CheckItem
	if err := json.Unmarshal(template.CheckItems, &checkItems); err != nil {
		return &ValidationError{
			Field:   "check_items",
			Message: "检查项格式无效",
			Err:     ErrInvalidCheckItemsFormat,
		}
	}

	// Validate check items
	if err := v.ValidateCheckItems(checkItems); err != nil {
		return err
	}

	return nil
}

// ValidateTemplateName validates the template name
// Validates: Requirement 12.1
func (v *templateValidator) ValidateTemplateName(name string) error {
	trimmedName := strings.TrimSpace(name)

	if trimmedName == "" {
		return &ValidationError{
			Field:   "name",
			Message: "模板名称不能为空",
			Err:     ErrTemplateNameRequired,
		}
	}

	if len(trimmedName) > 255 {
		return &ValidationError{
			Field:   "name",
			Message: "模板名称长度不能超过 255 个字符",
			Err:     ErrTemplateNameTooLong,
		}
	}

	return nil
}

// ValidateCheckItems validates all check items in a template
// Validates: Requirements 12.2, 12.3, 12.4, 12.5, 12.6
func (v *templateValidator) ValidateCheckItems(checkItems []CheckItem) error {
	// Validate at least one check item exists
	if len(checkItems) == 0 {
		return &ValidationError{
			Field:   "check_items",
			Message: "模板必须包含至少一个检查项",
			Err:     ErrNoCheckItems,
		}
	}

	// Validate each check item
	for i, item := range checkItems {
		if err := v.ValidateCheckItem(&item); err != nil {
			return &ValidationError{
				Field:   fmt.Sprintf("check_items[%d]", i),
				Message: fmt.Sprintf("检查项 '%s' 验证失败: %s", item.ID, err.Error()),
				Err:     err,
			}
		}
	}

	return nil
}

// ValidateCheckItem validates a single check item
// Validates: Requirements 12.3, 12.4, 12.5, 12.6
func (v *templateValidator) ValidateCheckItem(item *CheckItem) error {
	// Validate required fields
	if strings.TrimSpace(item.ID) == "" {
		return &ValidationError{
			Field:   "id",
			Message: "检查项 ID 不能为空",
			Err:     ErrCheckItemMissingFields,
		}
	}

	if strings.TrimSpace(item.Name) == "" {
		return &ValidationError{
			Field:   "name",
			Message: "检查项名称不能为空",
			Err:     ErrCheckItemMissingFields,
		}
	}

	if strings.TrimSpace(item.Type) == "" {
		return &ValidationError{
			Field:   "type",
			Message: "检查项类型不能为空",
			Err:     ErrCheckItemMissingFields,
		}
	}

	// Validate check item type
	if err := v.ValidateCheckItemType(item.Type); err != nil {
		return err
	}

	// Validate type-specific configuration
	switch strings.ToLower(item.Type) {
	case "snmp":
		if err := v.ValidateSNMPConfig(item.Config); err != nil {
			return err
		}
	case "ssh":
		if err := v.ValidateSSHConfig(item.Config); err != nil {
			return err
		}
	}

	// Validate threshold if present
	if thresholdData, ok := item.Config["threshold"]; ok {
		var threshold ThresholdConfig
		// Convert map to threshold config
		if thresholdMap, ok := thresholdData.(map[string]interface{}); ok {
			if warning, ok := thresholdMap["warning"].(float64); ok {
				threshold.Warning = warning
			}
			if critical, ok := thresholdMap["critical"].(float64); ok {
				threshold.Critical = critical
			}
			if err := v.ValidateThreshold(&threshold); err != nil {
				return err
			}
		}
	}

	return nil
}

// ValidateCheckItemType validates the check item type
// Validates: Requirement 12.4
func (v *templateValidator) ValidateCheckItemType(itemType string) error {
	validTypes := []string{"snmp", "ssh", "http", "ping", "script"}
	normalizedType := strings.ToLower(strings.TrimSpace(itemType))

	for _, validType := range validTypes {
		if normalizedType == validType {
			return nil
		}
	}

	return &ValidationError{
		Field:   "type",
		Message: fmt.Sprintf("检查项类型 '%s' 无效，有效值为: %s", itemType, strings.Join(validTypes, ", ")),
		Err:     ErrInvalidCheckItemType,
	}
}

// ValidateSNMPConfig validates SNMP check item configuration
// Validates: Requirement 12.5
func (v *templateValidator) ValidateSNMPConfig(config map[string]interface{}) error {
	// Check if OID is present
	oidValue, ok := config["oid"]
	if !ok {
		return &ValidationError{
			Field:   "config.oid",
			Message: "SNMP 检查项必须包含 OID",
			Err:     ErrOIDRequired,
		}
	}

	// Validate OID format
	oid, ok := oidValue.(string)
	if !ok {
		return &ValidationError{
			Field:   "config.oid",
			Message: "OID 必须是字符串类型",
			Err:     ErrInvalidOIDFormat,
		}
	}

	if err := v.ValidateOIDFormat(oid); err != nil {
		return err
	}

	return nil
}

// ValidateSSHConfig validates SSH check item configuration
// Validates: Requirement 7.3
func (v *templateValidator) ValidateSSHConfig(config map[string]interface{}) error {
	// Check if command is present
	commandValue, ok := config["command"]
	if !ok {
		return &ValidationError{
			Field:   "config.command",
			Message: "SSH 检查项必须包含命令",
			Err:     ErrCommandRequired,
		}
	}

	// Validate command is a non-empty string
	command, ok := commandValue.(string)
	if !ok || strings.TrimSpace(command) == "" {
		return &ValidationError{
			Field:   "config.command",
			Message: "SSH 命令不能为空",
			Err:     ErrCommandRequired,
		}
	}

	return nil
}

// ValidateThreshold validates threshold configuration
// Validates: Requirement 12.6
func (v *templateValidator) ValidateThreshold(threshold *ThresholdConfig) error {
	if threshold.Warning >= threshold.Critical {
		return &ValidationError{
			Field:   "config.threshold",
			Message: fmt.Sprintf("警告阈值 (%.2f) 必须小于严重告警阈值 (%.2f)", threshold.Warning, threshold.Critical),
			Err:     ErrInvalidThreshold,
		}
	}

	return nil
}

// ValidateOIDFormat validates OID format
// Validates: Requirement 12.5
// OID format: numbers and dots, e.g., 1.3.6.1.4.1.9.9.109.1.1.1.1.7
func (v *templateValidator) ValidateOIDFormat(oid string) error {
	oid = strings.TrimSpace(oid)

	if oid == "" {
		return &ValidationError{
			Field:   "oid",
			Message: "OID 不能为空",
			Err:     ErrInvalidOIDFormat,
		}
	}

	// OID pattern: starts with a digit, followed by zero or more groups of dot and digits
	oidPattern := regexp.MustCompile(`^[0-9]+(\.[0-9]+)*$`)
	if !oidPattern.MatchString(oid) {
		return &ValidationError{
			Field:   "oid",
			Message: fmt.Sprintf("OID 格式无效: '%s'，OID 应该由数字和点组成，例如: 1.3.6.1.4.1.9.9.109.1.1.1.1.7", oid),
			Err:     ErrInvalidOIDFormat,
		}
	}

	return nil
}

// CanModifyTemplate checks if a template can be modified
func CanModifyTemplate(template *Template) error {
	if template.IsDefault {
		return ErrCannotModifyBuiltInTemplate
	}
	return nil
}

// CanDeleteTemplate checks if a template can be deleted
func CanDeleteTemplate(template *Template) error {
	if template.IsDefault {
		return ErrCannotDeleteBuiltInTemplate
	}
	return nil
}
