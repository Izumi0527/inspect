package snmpmib

import (
	"fmt"
	"strings"
)

type Registry struct {
	SchemaVersion int               `json:"schema_version"`
	Description   string            `json:"description"`
	Vendors       map[string]Vendor `json:"vendors"`
	Common        CommonSection     `json:"common"`
	Metrics       MetricsSection    `json:"metrics"`
	Catalog       FeatureCatalog    `json:"catalog,omitempty"`
	Trap          TrapSection       `json:"trap"`
}

type Vendor struct {
	DisplayName        string   `json:"display_name"`
	Aliases            []string `json:"aliases"`
	EnterprisePrefixes []string `json:"enterprise_prefixes"`
}

type CommonSection struct {
	Probe      ProbeSection      `json:"probe"`
	System     SystemSection     `json:"system"`
	Interfaces InterfacesSection `json:"interfaces"`
	Ethernet   EthernetSection   `json:"ethernet"`
}

// EthernetSection 承载 EtherLike-MIB 的以太网专有指标。
// 与 InterfacesSection 分开：后者是 IF-MIB（所有接口类型通用），
// 本节仅对以太网口有意义，非以太网设备取不到属预期。
type EthernetSection struct {
	Dot3DuplexStatus OIDDefinition `json:"dot3_duplex_status"`
}

type ProbeSection struct {
	SysDescr OIDDefinition `json:"sys_descr"`
}

type SystemSection struct {
	SysObjectID OIDDefinition `json:"sys_object_id"`
	SysUptime   OIDDefinition `json:"sys_uptime"`
	SysName     OIDDefinition `json:"sys_name"`
	SysLocation OIDDefinition `json:"sys_location"`
	// ENTITY-MIB(RFC 4133) 物理实体表，用于采集设备型号与软件版本。
	// 整机通常是实体表中 entPhysicalClass=chassis 的那一行，实践中取首个非空值即可。
	EntPhysicalDescr       OIDDefinition `json:"ent_physical_descr"`
	EntPhysicalModelName   OIDDefinition `json:"ent_physical_model_name"`
	EntPhysicalSoftwareRev OIDDefinition `json:"ent_physical_software_rev"`
}

type InterfacesSection struct {
	IfDescr       OIDDefinition `json:"if_descr"`
	IfSpeed       OIDDefinition `json:"if_speed"`
	IfInOctets    OIDDefinition `json:"if_in_octets"`
	IfOutOctets   OIDDefinition `json:"if_out_octets"`
	IfHCInOctets  OIDDefinition `json:"if_hc_in_octets"`
	IfHCOutOctets OIDDefinition `json:"if_hc_out_octets"`
	IfHighSpeed   OIDDefinition `json:"if_high_speed"`
	IfOperStatus  OIDDefinition `json:"if_oper_status"`

	// 以下为接口健康类 OID。它们都是可选的：registry 里为空时采集端跳过，
	// 对应检查项判 skip 而非 fail——老设备或精简 agent 不上报属预期。
	IfAdminStatus  OIDDefinition `json:"if_admin_status"`
	IfInErrors     OIDDefinition `json:"if_in_errors"`
	IfOutErrors    OIDDefinition `json:"if_out_errors"`
	IfInDiscards   OIDDefinition `json:"if_in_discards"`
	IfOutDiscards  OIDDefinition `json:"if_out_discards"`
	IfInUcastPkts  OIDDefinition `json:"if_in_ucast_pkts"`
	IfOutUcastPkts OIDDefinition `json:"if_out_ucast_pkts"`
}

type OIDDefinition struct {
	OID       string `json:"oid"`
	Method    string `json:"method"`
	ValueType string `json:"value_type"`
}

type MetricsSection struct {
	CPUUsage    []MetricCandidate `json:"cpu_usage"`
	MemoryUsage []MetricCandidate `json:"memory_usage"`
	Temperature []MetricCandidate `json:"temperature"`
}

type MetricCandidate struct {
	ID        string   `json:"id"`
	Vendors   []string `json:"vendors"`
	Method    string   `json:"method"`
	OIDs      []string `json:"oids"`
	Strategy  string   `json:"strategy"`
	Aggregate string   `json:"aggregate,omitempty"`
}

type FeatureCatalog map[string]VendorFeatureCatalog

type VendorFeatureCatalog map[string][]CatalogOID

type CatalogOID struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	OID         string `json:"oid"`
	Method      string `json:"method"`
	ValueType   string `json:"value_type"`
	Unit        string `json:"unit,omitempty"`
	Description string `json:"description"`
}

type TrapSection struct {
	Core      TrapCoreSection         `json:"core"`
	Overrides map[string]TrapOverride `json:"overrides"`
}

type TrapCoreSection struct {
	TrapOID      string `json:"trap_oid"`
	SysUptime    string `json:"sys_uptime"`
	Community    string `json:"community"`
	Enterprise   string `json:"enterprise"`
	AgentAddress string `json:"agent_address"`
}

type TrapOverride struct {
	Level    string `json:"level"`
	Facility string `json:"facility"`
}

func (r Registry) Validate() error {
	if r.SchemaVersion != 1 {
		return fmt.Errorf("unsupported schema_version: %d", r.SchemaVersion)
	}

	if len(r.Vendors) == 0 {
		return fmt.Errorf("vendors is required")
	}

	if err := validateOIDDefinition("common.probe.sys_descr", r.Common.Probe.SysDescr); err != nil {
		return err
	}
	if err := validateOIDDefinition("common.system.sys_uptime", r.Common.System.SysUptime); err != nil {
		return err
	}
	if err := validateOIDDefinition("common.interfaces.if_descr", r.Common.Interfaces.IfDescr); err != nil {
		return err
	}
	if err := validateOIDDefinition("common.interfaces.if_hc_in_octets", r.Common.Interfaces.IfHCInOctets); err != nil {
		return err
	}
	if err := validateOIDDefinition("common.interfaces.if_hc_out_octets", r.Common.Interfaces.IfHCOutOctets); err != nil {
		return err
	}

	if err := validateMetricCandidates("metrics.cpu_usage", r.Metrics.CPUUsage); err != nil {
		return err
	}
	if err := validateMetricCandidates("metrics.memory_usage", r.Metrics.MemoryUsage); err != nil {
		return err
	}
	if err := validateMetricCandidates("metrics.temperature", r.Metrics.Temperature); err != nil {
		return err
	}
	if err := validateFeatureCatalog(r.Catalog, r.Vendors); err != nil {
		return err
	}

	if strings.TrimSpace(r.Trap.Core.TrapOID) == "" {
		return fmt.Errorf("trap.core.trap_oid is required")
	}
	if strings.TrimSpace(r.Trap.Core.SysUptime) == "" {
		return fmt.Errorf("trap.core.sys_uptime is required")
	}
	if strings.TrimSpace(r.Trap.Core.Community) == "" {
		return fmt.Errorf("trap.core.community is required")
	}
	if strings.TrimSpace(r.Trap.Core.Enterprise) == "" {
		return fmt.Errorf("trap.core.enterprise is required")
	}
	if strings.TrimSpace(r.Trap.Core.AgentAddress) == "" {
		return fmt.Errorf("trap.core.agent_address is required")
	}

	for key, vendor := range r.Vendors {
		if strings.TrimSpace(key) == "" {
			return fmt.Errorf("vendors key cannot be empty")
		}
		if strings.TrimSpace(vendor.DisplayName) == "" {
			return fmt.Errorf("vendors.%s.display_name is required", key)
		}
	}

	for oid, override := range r.Trap.Overrides {
		if strings.TrimSpace(oid) == "" {
			return fmt.Errorf("trap.overrides key cannot be empty")
		}
		if strings.TrimSpace(override.Level) == "" {
			return fmt.Errorf("trap.overrides.%s.level is required", oid)
		}
		if strings.TrimSpace(override.Facility) == "" {
			return fmt.Errorf("trap.overrides.%s.facility is required", oid)
		}
	}

	return nil
}

func (r Registry) ResolveVendor(vendor string) string {
	normalized := normalizeToken(vendor)
	if normalized == "" {
		return ""
	}

	if _, ok := r.Vendors[normalized]; ok {
		return normalized
	}

	for key, item := range r.Vendors {
		for _, alias := range item.Aliases {
			if normalizeToken(alias) == normalized {
				return key
			}
		}
	}

	return normalized
}

func (r Registry) CatalogEntries(vendor string, category string) []CatalogOID {
	if len(r.Catalog) == 0 {
		return nil
	}

	resolvedVendor := r.ResolveVendor(vendor)
	if resolvedVendor == "" {
		return nil
	}

	vendorCatalog, ok := r.Catalog[resolvedVendor]
	if !ok {
		return nil
	}

	normalizedCategory := normalizeToken(category)
	if normalizedCategory == "" {
		return nil
	}

	for key, entries := range vendorCatalog {
		if normalizeToken(key) != normalizedCategory {
			continue
		}
		return append([]CatalogOID(nil), entries...)
	}

	return nil
}

func (r Registry) MetricCandidates(metricName string, vendor string) []MetricCandidate {
	var source []MetricCandidate
	switch metricName {
	case "cpu_usage":
		source = r.Metrics.CPUUsage
	case "memory_usage":
		source = r.Metrics.MemoryUsage
	case "temperature":
		source = r.Metrics.Temperature
	default:
		return nil
	}

	if len(source) == 0 {
		return nil
	}

	resolvedVendor := r.ResolveVendor(vendor)
	if resolvedVendor == "" {
		return append([]MetricCandidate(nil), source...)
	}

	exact := make([]MetricCandidate, 0, len(source))
	fallback := make([]MetricCandidate, 0, len(source))
	for _, candidate := range source {
		if candidateSupportsVendor(candidate, resolvedVendor) {
			exact = append(exact, candidate)
			continue
		}
		if candidateIsWildcard(candidate) {
			fallback = append(fallback, candidate)
		}
	}

	return append(exact, fallback...)
}

func validateOIDDefinition(path string, item OIDDefinition) error {
	if strings.TrimSpace(item.OID) == "" {
		return fmt.Errorf("%s.oid is required", path)
	}
	if strings.TrimSpace(item.Method) == "" {
		return fmt.Errorf("%s.method is required", path)
	}
	return nil
}

func validateMetricCandidates(path string, items []MetricCandidate) error {
	if len(items) == 0 {
		return fmt.Errorf("%s cannot be empty", path)
	}
	for idx, item := range items {
		if strings.TrimSpace(item.ID) == "" {
			return fmt.Errorf("%s[%d].id is required", path, idx)
		}
		if strings.TrimSpace(item.Method) == "" {
			return fmt.Errorf("%s[%d].method is required", path, idx)
		}
		if len(item.OIDs) == 0 {
			return fmt.Errorf("%s[%d].oids cannot be empty", path, idx)
		}
		for oidIdx, oid := range item.OIDs {
			if strings.TrimSpace(oid) == "" {
				return fmt.Errorf("%s[%d].oids[%d] cannot be empty", path, idx, oidIdx)
			}
		}
		if strings.TrimSpace(item.Strategy) == "" {
			return fmt.Errorf("%s[%d].strategy is required", path, idx)
		}
	}
	return nil
}

func validateFeatureCatalog(catalog FeatureCatalog, vendors map[string]Vendor) error {
	if len(catalog) == 0 {
		return nil
	}

	for vendorKey, categories := range catalog {
		normalizedVendor := normalizeToken(vendorKey)
		if normalizedVendor == "" {
			return fmt.Errorf("catalog vendor key cannot be empty")
		}
		if _, ok := vendors[normalizedVendor]; !ok {
			return fmt.Errorf("catalog.%s must reference an existing vendor", vendorKey)
		}
		if len(categories) == 0 {
			return fmt.Errorf("catalog.%s cannot be empty", vendorKey)
		}

		for categoryKey, entries := range categories {
			normalizedCategory := normalizeToken(categoryKey)
			if normalizedCategory == "" {
				return fmt.Errorf("catalog.%s category key cannot be empty", vendorKey)
			}
			if len(entries) == 0 {
				return fmt.Errorf("catalog.%s.%s cannot be empty", vendorKey, categoryKey)
			}
			for idx, entry := range entries {
				if err := validateCatalogOID(
					fmt.Sprintf("catalog.%s.%s[%d]", vendorKey, categoryKey, idx),
					entry,
				); err != nil {
					return err
				}
			}
		}
	}

	return nil
}

func validateCatalogOID(path string, item CatalogOID) error {
	if strings.TrimSpace(item.ID) == "" {
		return fmt.Errorf("%s.id is required", path)
	}
	if strings.TrimSpace(item.Name) == "" {
		return fmt.Errorf("%s.name is required", path)
	}
	if strings.TrimSpace(item.OID) == "" {
		return fmt.Errorf("%s.oid is required", path)
	}
	if strings.TrimSpace(item.Method) == "" {
		return fmt.Errorf("%s.method is required", path)
	}
	if strings.TrimSpace(item.ValueType) == "" {
		return fmt.Errorf("%s.value_type is required", path)
	}
	if strings.TrimSpace(item.Description) == "" {
		return fmt.Errorf("%s.description is required", path)
	}
	return nil
}

func candidateSupportsVendor(candidate MetricCandidate, vendor string) bool {
	for _, item := range candidate.Vendors {
		if normalizeToken(item) == vendor {
			return true
		}
	}
	return false
}

func candidateIsWildcard(candidate MetricCandidate) bool {
	if len(candidate.Vendors) == 0 {
		return true
	}
	for _, item := range candidate.Vendors {
		if strings.TrimSpace(item) == "*" {
			return true
		}
	}
	return false
}

func normalizeToken(value string) string {
	normalized := strings.TrimSpace(strings.ToLower(value))
	normalized = strings.ReplaceAll(normalized, "-", "_")
	normalized = strings.ReplaceAll(normalized, " ", "_")
	return normalized
}
