package snmpmib

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
)

//go:embed huawei-alarms.json
var embeddedAlarmCatalog []byte

var (
	defaultAlarmCatalog *AlarmCatalog
	alarmCatalogOnce    sync.Once
	alarmCatalogErr     error
)

// AlarmCatalog 是华为 S 系列产品文档「告警节点详细描述」的全量知识库，
// 由 scripts/mib/extract-huawei-alarms.py 生成为 huawei-alarms.json 并嵌入。
//
// 它与 Registry.Trap.Overrides 的分工：Overrides 是运维手工钉死的少量覆盖，优先级最高；
// 本知识库提供文档级的默认判定（级别/设施/名称/含义/绑定变量语义），覆盖不到的再落关键词猜测。
type AlarmCatalog struct {
	SchemaVersion    int                        `json:"schema_version"`
	Source           string                     `json:"source"`
	Generator        string                     `json:"generator"`
	SeverityVarbinds map[string]SeverityVarbind `json:"severity_varbinds"`
	ReasonVarbinds   map[string]string          `json:"reason_varbinds"`
	Traps            map[string]TrapDefinition  `json:"traps"`
	Nodes            map[string]NodeDefinition  `json:"nodes"`
}

// TrapDefinition 单条告警（Trap）定义。
// Level 取 critical/warning/info；Facility 取 system/interface/security/routing/switching/snmp/ssh
// 之外还允许 hardware/configuration —— 这两者只用于告警分类，日志入库时由 normalizeFacility 折回 system。
type TrapDefinition struct {
	Name     string   `json:"name"`
	MIB      string   `json:"mib"`
	Level    string   `json:"level"`
	Facility string   `json:"facility"`
	Cleared  bool     `json:"cleared,omitempty"`
	Meaning  string   `json:"meaning"`
	Vars     []string `json:"vars"`
}

// NodeDefinition 绑定变量节点：名称、所属 MIB 与整数枚举（值 → 名）。
type NodeDefinition struct {
	Name string            `json:"name"`
	MIB  string            `json:"mib"`
	Enum map[string]string `json:"enum,omitempty"`
}

// SeverityVarbind 携带告警级别的绑定变量（如 hwBaseTrapSeverity），Values 为枚举值 → 级别词。
type SeverityVarbind struct {
	Name   string            `json:"name"`
	Values map[string]string `json:"values"`
}

// maxInstanceSuffixDepth 表列实例索引最多剥离的段数：
// 华为实体索引通常 1 段，nlm 变量表索引最多 3 段，留余量到 8。
const maxInstanceSuffixDepth = 8

var (
	validAlarmLevels     = map[string]struct{}{"critical": {}, "warning": {}, "info": {}}
	validAlarmFacilities = map[string]struct{}{
		"system": {}, "interface": {}, "security": {}, "routing": {}, "switching": {},
		"snmp": {}, "ssh": {}, "hardware": {}, "configuration": {},
	}
)

// DefaultAlarmCatalog 返回嵌入的知识库（首次加载并校验，之后复用）。
func DefaultAlarmCatalog() (*AlarmCatalog, error) {
	alarmCatalogOnce.Do(func() {
		var catalog AlarmCatalog
		alarmCatalogErr = json.Unmarshal(embeddedAlarmCatalog, &catalog)
		if alarmCatalogErr == nil {
			alarmCatalogErr = catalog.Validate()
		}
		if alarmCatalogErr == nil {
			defaultAlarmCatalog = &catalog
		}
	})
	return defaultAlarmCatalog, alarmCatalogErr
}

// NormalizeOID 去掉 gosnmp 解码时附带的前导点与空白，使其可直接作为知识库键。
func NormalizeOID(oid string) string {
	return strings.TrimPrefix(strings.TrimSpace(oid), ".")
}

// LookupTrap 按告警 OID 精确查找定义。
func (c *AlarmCatalog) LookupTrap(oid string) (TrapDefinition, bool) {
	if c == nil {
		return TrapDefinition{}, false
	}
	def, ok := c.Traps[NormalizeOID(oid)]
	return def, ok
}

// LookupNode 查找绑定变量节点：先精确匹配，再逐段剥离尾部实例索引做前缀匹配。
// 返回节点定义与被剥离的实例后缀（如 "12"、"0"；精确命中为空串）。
func (c *AlarmCatalog) LookupNode(oid string) (NodeDefinition, string, bool) {
	if c == nil {
		return NodeDefinition{}, "", false
	}
	normalized := NormalizeOID(oid)
	if node, ok := c.Nodes[normalized]; ok {
		return node, "", true
	}
	parts := strings.Split(normalized, ".")
	for depth := 1; depth <= maxInstanceSuffixDepth && depth < len(parts); depth++ {
		prefix := strings.Join(parts[:len(parts)-depth], ".")
		if node, ok := c.Nodes[prefix]; ok {
			return node, strings.Join(parts[len(parts)-depth:], "."), true
		}
	}
	return NodeDefinition{}, "", false
}

// SeverityFromVarbinds 从 Trap 变量绑定中找出厂商严重级别变量并折算为本系统级别：
// critical/major → critical，minor/warning → warning，cleared/indeterminate → info。
// vars 键为变量 OID（可带前导点与实例后缀），值为整数文本。
func (c *AlarmCatalog) SeverityFromVarbinds(vars map[string]string) (string, bool) {
	if c == nil {
		return "", false
	}
	for oid, raw := range vars {
		normalized := NormalizeOID(oid)
		varbind, ok := c.SeverityVarbinds[normalized]
		if !ok {
			// 标量实例 .0 或表列实例后缀
			node, _, found := c.LookupNode(normalized)
			if !found {
				continue
			}
			for defOID, candidate := range c.SeverityVarbinds {
				if candidate.Name == node.Name {
					varbind, ok = c.SeverityVarbinds[defOID], true
					break
				}
			}
			if !ok {
				continue
			}
		}
		word, ok := varbind.Values[strings.TrimSpace(raw)]
		if !ok {
			return "", false
		}
		switch word {
		case "critical", "major":
			return "critical", true
		case "minor", "warning":
			return "warning", true
		case "cleared", "indeterminate":
			return "info", true
		default:
			return "", false
		}
	}
	return "", false
}

// Validate 校验知识库结构：schema 版本、级别与设施值域、OID 非空。
func (c AlarmCatalog) Validate() error {
	if c.SchemaVersion != 1 {
		return fmt.Errorf("unsupported alarm catalog schema_version: %d", c.SchemaVersion)
	}
	for oid, def := range c.Traps {
		if strings.TrimSpace(oid) == "" || strings.TrimSpace(def.Name) == "" {
			return fmt.Errorf("traps entry with empty oid or name")
		}
		if _, ok := validAlarmLevels[def.Level]; !ok {
			return fmt.Errorf("traps.%s.level invalid: %q", oid, def.Level)
		}
		if _, ok := validAlarmFacilities[def.Facility]; !ok {
			return fmt.Errorf("traps.%s.facility invalid: %q", oid, def.Facility)
		}
	}
	for oid, node := range c.Nodes {
		if strings.TrimSpace(oid) == "" || strings.TrimSpace(node.Name) == "" {
			return fmt.Errorf("nodes entry with empty oid or name")
		}
	}
	return nil
}
