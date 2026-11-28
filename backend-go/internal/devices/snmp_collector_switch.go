package devices

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/gosnmp/gosnmp"
	"github.com/your-org/inspect-system/backend-go/internal/snmpmib"
)

type StackMemberMetrics struct {
	Index     string `json:"index"`
	MemberID  *int64 `json:"member_id,omitempty"`
	Priority  *int64 `json:"priority,omitempty"`
	Role      *int64 `json:"role,omitempty"`
	RoleLabel string `json:"role_label,omitempty"`
	MAC       string `json:"mac,omitempty"`
}

type StackPortMetrics struct {
	Index       string `json:"index"`
	Name        string `json:"name,omitempty"`
	Status      *int64 `json:"status,omitempty"`
	StatusLabel string `json:"status_label,omitempty"`
}

type StackMetrics struct {
	Enabled       *bool                `json:"enabled,omitempty"`
	IsStackDevice *bool                `json:"is_stack_device,omitempty"`
	TopoType      *int64               `json:"topo_type,omitempty"`
	TopoTypeLabel string               `json:"topo_type_label,omitempty"`
	Members       []StackMemberMetrics `json:"members,omitempty"`
	Ports         []StackPortMetrics   `json:"ports,omitempty"`
}

type ConfigSaveMetrics struct {
	RunModifiedLast   *int64 `json:"run_modified_last,omitempty"`
	RunSavedLast      *int64 `json:"run_saved_last,omitempty"`
	StartModifiedLast *int64 `json:"start_modified_last,omitempty"`
	RunModifiedTicks  *int64 `json:"run_modified_ticks,omitempty"`
	RunSavedTicks     *int64 `json:"run_saved_ticks,omitempty"`
	IsSaved           *bool  `json:"is_saved,omitempty"`
}

type VLANMetrics struct {
	BridgeNumPorts    *int64 `json:"bridge_num_ports,omitempty"`
	MaxVlanID         *int64 `json:"max_vlan_id,omitempty"`
	MaxSupportedVlans *int64 `json:"max_supported_vlans,omitempty"`
	NumVlans          *int64 `json:"num_vlans,omitempty"`
	GvrpStatus        *int64 `json:"gvrp_status,omitempty"`
	FdbDynamicCount   *int64 `json:"fdb_dynamic_count,omitempty"`
}

type FlashPartitionMetrics struct {
	Index        string   `json:"index"`
	Name         string   `json:"name,omitempty"`
	TotalBytes   *int64   `json:"total_bytes,omitempty"`
	FreeBytes    *int64   `json:"free_bytes,omitempty"`
	UsedBytes    *int64   `json:"used_bytes,omitempty"`
	UsagePercent *float64 `json:"usage_percent,omitempty"`
}

var stackRoleLabels = map[int64]string{1: "master", 2: "standby", 3: "slave"}
var irfStatusLabels = map[int64]string{1: "unknown", 2: "loading", 3: "up", 4: "down", 5: "absent"}

func (c *SNMPCollector) collectSwitchExtendedMetrics(
	target snmpClient, metrics *SNMPMetrics, registry *snmpmib.Registry,
	vendor, sysObjectID, sysDescr string, diag *SNMPCollectionDiagnostics,
) {
	if target == nil || metrics == nil || registry == nil {
		return
	}
	metrics.Stack = collectStackMetrics(target, registry.CatalogEntriesForDevice(vendor, "stack", sysObjectID, sysDescr), diag)
	metrics.ConfigSave = collectConfigSaveMetrics(target, registry.CatalogEntriesForDevice(vendor, "config_man", sysObjectID, sysDescr), diag)
	metrics.VLAN = collectVLANMetrics(target, registry.Common.QBridge)
	metrics.FlashPartitions = collectFlashPartitions(target, registry.CatalogEntriesForDevice(vendor, "flash", sysObjectID, sysDescr), diag)
	if es := registry.CatalogEntriesForDevice(vendor, "stp", sysObjectID, sysDescr); len(es) > 0 && strings.Contains(normalizeCollectorToken(es[0].ID), "bpdu_guard") {
		metrics.STP.BpduGuard = getCatalogNumeric(target, "stp", es[0].ID, es[0].OID, diag)
	}
}

func readSTPBridgeID(client snmpClient, rawOID string) string {
	oid := strings.TrimSpace(rawOID)
	if oid == "" {
		return ""
	}
	pkt, err := client.Get([]string{oid})
	if err != nil || pkt == nil || len(pkt.Variables) == 0 || isNoSuchPDU(pkt.Variables[0]) {
		return ""
	}
	if raw, ok := pkt.Variables[0].Value.([]byte); ok && len(raw) == 8 {
		return fmt.Sprintf("%d/%s", uint16(raw[0])<<8|uint16(raw[1]), formatMACBytes(raw[2:]))
	} else if ok && len(raw) > 0 {
		return formatMACBytes(raw)
	}
	return strings.TrimSpace(formatSNMPValue(pkt.Variables[0].Value))
}
func collectVLANMetrics(target snmpClient, qb snmpmib.QBridgeSection) VLANMetrics {
	out := VLANMetrics{
		BridgeNumPorts: readNumericScalar(target, qb.Dot1dBaseNumPorts.OID), MaxVlanID: readNumericScalar(target, qb.Dot1qMaxVlanID.OID),
		MaxSupportedVlans: readNumericScalar(target, qb.Dot1qMaxSupportedVlans.OID), NumVlans: readNumericScalar(target, qb.Dot1qNumVlans.OID),
		GvrpStatus: readNumericScalar(target, qb.Dot1qGvrpStatus.OID),
	}
	sum, has := int64(0), false
	walkEntryPDUs(target, "", snmpmib.CatalogOID{OID: qb.Dot1qFdbDynamicCount.OID}, nil, func(_ string, pdu gosnmp.SnmpPDU) {
		if val, ok := numericPDUInt64(pdu); ok && val >= 0 {
			sum, has = sum+val, true
		}
	})
	if has {
		out.FdbDynamicCount = &sum
	}
	return out
}
func collectConfigSaveMetrics(target snmpClient, entries []snmpmib.CatalogOID, diag *SNMPCollectionDiagnostics) ConfigSaveMetrics {
	out := ConfigSaveMetrics{}
	var modTicks, saveTicks *int64
	for _, entry := range entries {
		raw := getCatalogNumeric(target, "config_man", entry.ID, entry.OID, diag)
		if raw == nil {
			continue
		}
		sec, id := *raw/100, normalizeCollectorToken(entry.ID)
		if strings.Contains(id, "run_modified_last") {
			out.RunModifiedLast, out.RunModifiedTicks, modTicks = &sec, raw, raw
		} else if strings.Contains(id, "run_saved_last") {
			out.RunSavedLast, out.RunSavedTicks, saveTicks = &sec, raw, raw
		} else if strings.Contains(id, "start_modified_last") {
			out.StartModifiedLast = &sec
		}
	}
	if modTicks != nil && saveTicks != nil {
		// TimeTicks 为 32 位无符号整型（约 497.1 天回绕），按 RFC 1982 模差判定先后关系
		delta := uint32(*modTicks) - uint32(*saveTicks)
		saved := !(*saveTicks == 0 && *modTicks > 0 && (out.StartModifiedLast == nil || *out.StartModifiedLast == 0)) && (delta == 0 || delta >= 0x80000000)
		out.IsSaved = &saved
	}
	return out
}
func collectStackMetrics(target snmpClient, entries []snmpmib.CatalogOID, diag *SNMPCollectionDiagnostics) StackMetrics {
	out, members, ports := StackMetrics{}, make(map[string]*StackMemberMetrics), make(map[string]*StackPortMetrics)
	for _, entry := range entries {
		id := normalizeCollectorToken(entry.ID)
		if strings.EqualFold(strings.TrimSpace(entry.Method), "get") {
			applyStackScalar(&out, id, getCatalogNumeric(target, "stack", entry.ID, entry.OID, diag))
			continue
		}
		walkEntryPDUs(target, "stack", entry, diag, func(idx string, pdu gosnmp.SnmpPDU) {
			applyStackTablePDU(id, idx, pdu, members, ports)
		})
	}
	out.Members, out.Ports = sortedMapValues(members), sortedMapValues(ports)
	return out
}

func applyStackScalar(out *StackMetrics, id string, val *int64) {
	if val == nil {
		return
	}
	b, v := *val == 1, *val
	if strings.Contains(id, "stack_run") {
		out.Enabled = &b
	} else if strings.Contains(id, "is_stack_device") {
		out.IsStackDevice = &b
	} else if strings.Contains(id, "topo_type") {
		out.TopoType, out.TopoTypeLabel = &v, map[int64]string{1: "chain", 2: "ring"}[v]
	}
}

func applyStackTablePDU(id, idx string, pdu gosnmp.SnmpPDU, members map[string]*StackMemberMetrics, ports map[string]*StackPortMetrics) {
	if strings.Contains(id, "port_") {
		if ports[idx] == nil {
			ports[idx] = &StackPortMetrics{Index: idx}
		}
		if strings.Contains(id, "port_name") {
			ports[idx].Name = SanitizeInterfaceDescription(decodeSNMPTextValue(pdu.Value))
		} else if val, ok := numericPDUInt64(pdu); ok {
			labels := map[bool]map[int64]string{false: {1: "up", 2: "down"}, true: irfStatusLabels}[strings.Contains(id, "irf_")]
			ports[idx].Status, ports[idx].StatusLabel = &val, labels[val]
		}
		return
	}
	if members[idx] == nil {
		members[idx] = &StackMemberMetrics{Index: idx}
	}
	if strings.Contains(id, "member_mac") {
		if raw, ok := pdu.Value.([]byte); ok && len(raw) > 0 {
			members[idx].MAC = formatMACBytes(raw)
		}
	} else if val, ok := numericPDUInt64(pdu); ok {
		if strings.Contains(id, "current_id") {
			members[idx].MemberID = &val
		} else if strings.Contains(id, "priority") {
			members[idx].Priority = &val
		} else if strings.Contains(id, "role") {
			members[idx].Role, members[idx].RoleLabel = &val, stackRoleLabels[val]
		}
	}
}

func collectFlashPartitions(target snmpClient, entries []snmpmib.CatalogOID, diag *SNMPCollectionDiagnostics) []FlashPartitionMetrics {
	parts := make(map[string]*FlashPartitionMetrics)
	for _, entry := range entries {
		id := normalizeCollectorToken(entry.ID)
		walkEntryPDUs(target, "flash", entry, diag, func(idx string, pdu gosnmp.SnmpPDU) {
			if parts[idx] == nil {
				parts[idx] = &FlashPartitionMetrics{Index: idx}
			}
			if strings.Contains(id, "part_name") {
				parts[idx].Name = SanitizeInterfaceDescription(decodeSNMPTextValue(pdu.Value))
			} else if val, ok := numericPDUInt64(pdu); ok && val >= 0 {
				if strings.Contains(id, "space_free") {
					parts[idx].FreeBytes = &val
				} else if strings.Contains(id, "part_space") {
					parts[idx].TotalBytes = &val
				}
			}
		})
	}
	out := sortedMapValues(parts)
	for i := range out {
		if out[i].TotalBytes != nil && out[i].FreeBytes != nil && *out[i].TotalBytes > 0 && *out[i].FreeBytes <= *out[i].TotalBytes {
			used := *out[i].TotalBytes - *out[i].FreeBytes
			pct := float64(used) / float64(*out[i].TotalBytes) * 100
			out[i].UsedBytes, out[i].UsagePercent = &used, &pct
		}
	}
	return out
}

// enrichComponentsWithFaultLights 读取硬件故障指示灯（hwEntityFaultLight / FMEntityFaultLight）补充单板告警等级与描述。
func enrichComponentsWithFaultLights(client snmpClient, items []ComponentStatusMetrics, entries []snmpmib.CatalogOID) []ComponentStatusMetrics {
	if client == nil || len(items) == 0 || len(entries) == 0 {
		return items
	}
	lights := make(map[string]int64)
	for _, entry := range entries {
		if !strings.Contains(normalizeCollectorToken(entry.ID), "fault_light") {
			continue
		}
		walkEntryPDUs(client, "", entry, nil, func(idx string, pdu gosnmp.SnmpPDU) {
			if val, ok := numericPDUInt64(pdu); ok {
				lights[idx] = val
			}
		})
	}
	for i := range items {
		if val, ok := lights[items[i].Index]; ok && (val == 3 || val == 5 || val == 7) {
			items[i].StatusLevel, items[i].StatusLabel = "critical", "故障灯告警"
		} else if ok && val == 6 && items[i].StatusLevel != "critical" {
			items[i].StatusLevel, items[i].StatusLabel = "warning", "黄灯告警"
		}
	}
	return items
}
func getCatalogNumeric(client snmpClient, category, id, rawOID string, diag *SNMPCollectionDiagnostics) *int64 {
	oid := strings.TrimSpace(rawOID)
	if oid == "" {
		return nil
	}
	start, probe := time.Now(), newDiagnosticSNMPClient(client)
	val := readNumericScalar(probe, oid)
	recordCandidateDiagnostic(diag, category, id, "get", oid, val != nil, probe, time.Since(start))
	return val
}
func walkEntryPDUs(client snmpClient, category string, entry snmpmib.CatalogOID, diag *SNMPCollectionDiagnostics, fn func(idx string, pdu gosnmp.SnmpPDU)) {
	oid := strings.TrimSpace(entry.OID)
	if oid == "" {
		return
	}
	start, probe := time.Now(), newDiagnosticSNMPClient(client)
	result, err := probe.BulkWalkAll(oid)
	recordCandidateDiagnostic(diag, category, entry.ID, entry.Method, oid, err == nil && len(result) > 0, probe, time.Since(start))
	for _, pdu := range result {
		idx := extractOIDIndexSuffix(pdu.Name, oid)
		if idx == "" {
			idx = strings.TrimSpace(pdu.Name)
		}
		fn(idx, pdu)
	}
}
func sortedMapValues[T any](m map[string]*T) []T {
	if len(m) == 0 {
		return nil
	}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := make([]T, 0, len(keys))
	for _, k := range keys {
		out = append(out, *m[k])
	}
	return out
}
