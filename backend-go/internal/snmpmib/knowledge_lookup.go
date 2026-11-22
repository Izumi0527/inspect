package snmpmib

import (
	"regexp"
	"slices"
	"strconv"
	"strings"
)

// KnowledgeLookupResult 汇总上下文知识检索结果。
type KnowledgeLookupResult struct {
	Matched        bool                 `json:"matched"`
	Kind           string               `json:"kind"` // "alarm", "log", "mib", ""
	Alarm          *AlarmKnowledgeEntry `json:"alarm,omitempty"`
	Log            *LogKnowledgeEntry   `json:"log,omitempty"`
	MIB            *MIBNodeEntry        `json:"mib,omitempty"`
	InstanceSuffix string               `json:"instance_suffix,omitempty"`
}

var (
	vrpHeaderExtractRe = regexp.MustCompile(`(?:\s*%%\s*[0-9]{2}\s*)?([A-Za-z0-9_-]+)/([0-7])/([A-Za-z0-9_()\[\].-]+?)(?:\([lsLS]\))?(?:\[[0-9]+\])?(?:[:\s]|$)`)
	oidExtractRe       = regexp.MustCompile(`(?:\.?)(?:1\.3\.6\.1|1\.0\.8802)(?:\.[0-9]+)+`)
	eventIDExtractRe   = regexp.MustCompile(`(?i)\b(?:EventID|SubID|SubId)\s*[=:]\s*([0-9]+)`)
)

// LookupMIB 按 OID 查找 MIB 节点定义：先精确匹配，再最多剥离 8 段实例后缀做前缀匹配。
// 优先直接查原 OID（命中 56813 FM* 原生定义），未命中时回退 2011 规范前缀。
func (c *HuaweiKnowledgeCatalog) LookupMIB(oid string) (MIBNodeEntry, string, bool) {
	if c == nil {
		return MIBNodeEntry{}, "", false
	}
	normalized := NormalizeOID(oid)
	if node, suffix, ok := c.lookupMIBDirect(normalized); ok {
		return node, suffix, true
	}
	if canonical := CanonicalizeHuaweiEnterpriseOID(normalized); canonical != "" && canonical != normalized {
		return c.lookupMIBDirect(canonical)
	}
	return MIBNodeEntry{}, "", false
}

func (c *HuaweiKnowledgeCatalog) lookupMIBDirect(normalized string) (MIBNodeEntry, string, bool) {
	if normalized == "" {
		return MIBNodeEntry{}, "", false
	}
	if node, ok := c.mibByOID[normalized]; ok {
		return node, "", true
	}
	parts := strings.Split(normalized, ".")
	for depth := 1; depth <= maxInstanceSuffixDepth && depth < len(parts); depth++ {
		prefix := strings.Join(parts[:len(parts)-depth], ".")
		if node, ok := c.mibByOID[prefix]; ok {
			return node, strings.Join(parts[len(parts)-depth:], "."), true
		}
	}
	return MIBNodeEntry{}, "", false
}

// LookupAlarm 按 OID 查找官方告警排障知识；若传入 eventID（如 SubID / AlarmID），
// 且该 OID 存在 Variants，则优先匹配对应变体并回填主结构体展示字段。
// 优先直接查原 OID（命中 56813 FM* 原生定义），未命中时回退 2011 规范前缀。
func (c *HuaweiKnowledgeCatalog) LookupAlarm(oid string, eventID ...string) (AlarmKnowledgeEntry, bool) {
	if c == nil {
		return AlarmKnowledgeEntry{}, false
	}
	normalized := NormalizeOID(oid)
	if normalized == "" {
		return AlarmKnowledgeEntry{}, false
	}
	entry, ok := c.alarmByOID[normalized]
	if !ok {
		if canonical := CanonicalizeHuaweiEnterpriseOID(normalized); canonical != "" && canonical != normalized {
			entry, ok = c.alarmByOID[canonical]
		}
	}
	if !ok {
		return AlarmKnowledgeEntry{}, false
	}
	cloned := cloneAlarmKnowledge(entry)
	if len(eventID) > 0 && len(cloned.Variants) > 0 {
		target := strings.TrimSpace(eventID[0])
		if target != "" {
			for _, variant := range cloned.Variants {
				if strings.TrimSpace(variant.SubID) == target || strings.TrimSpace(variant.AlarmID) == target {
					applyAlarmVariant(&cloned, variant)
					break
				}
			}
		}
	}
	return cloned, true
}

// LookupLog 按模块名与助记符（大小写不敏感）精确查找官方 VRP 日志知识。
func (c *HuaweiKnowledgeCatalog) LookupLog(module, mnemonic string) (LogKnowledgeEntry, bool) {
	if c == nil {
		return LogKnowledgeEntry{}, false
	}
	mod := strings.ToUpper(strings.TrimSpace(module))
	mnem := strings.ToUpper(strings.TrimSpace(mnemonic))
	if mod == "" || mnem == "" {
		return LogKnowledgeEntry{}, false
	}
	entry, ok := c.logByKey[logLookupKey(mod, mnem)]
	if !ok {
		return LogKnowledgeEntry{}, false
	}
	return cloneLogKnowledge(entry), true
}

// LookupLogFromMessage 从原始 VRP 日志/告警文本中提取 MOD/SEV/MNEMONIC 头并检索官方日志知识。
func (c *HuaweiKnowledgeCatalog) LookupLogFromMessage(message string) (LogKnowledgeEntry, bool) {
	if c == nil || strings.TrimSpace(message) == "" {
		return LogKnowledgeEntry{}, false
	}
	matches := vrpHeaderExtractRe.FindAllStringSubmatch(message, -1)
	for _, m := range matches {
		if len(m) < 4 {
			continue
		}
		mod := strings.ToUpper(strings.TrimSpace(m[1]))
		sev, err := strconv.Atoi(m[2])
		mnem := strings.ToUpper(strings.TrimSpace(m[3]))
		if err == nil {
			if entry, ok := c.logBySevKey[logSeverityLookupKey(mod, sev, mnem)]; ok {
				return cloneLogKnowledge(entry), true
			}
		}
		if entry, ok := c.LookupLog(mod, mnem); ok {
			return entry, true
		}
	}
	return LogKnowledgeEntry{}, false
}

// LookupByContext 按请求上下文组合检索官方知识：
// 1. 显式 oid 优先查告警（支持 eventID 匹配变体）
// 2. 显式 module+mnemonic 查日志
// 3. message 中含 OID 则先查告警（含从正文提取 EventID），再查日志头，最后回退 MIB 节点
// 4. 显式 oid 未命中告警时回退 MIB 节点
func (c *HuaweiKnowledgeCatalog) LookupByContext(oid, module, mnemonic, message, eventID string) (KnowledgeLookupResult, bool) {
	if c == nil {
		return KnowledgeLookupResult{}, false
	}
	cleanOID := NormalizeOID(oid)
	cleanEventID := strings.TrimSpace(eventID)
	if cleanEventID == "" && message != "" {
		if m := eventIDExtractRe.FindStringSubmatch(message); len(m) == 2 {
			cleanEventID = m[1]
		}
	}

	if cleanOID != "" {
		if alarm, ok := c.LookupAlarm(cleanOID, cleanEventID); ok {
			return KnowledgeLookupResult{Matched: true, Kind: "alarm", Alarm: &alarm}, true
		}
	}

	if strings.TrimSpace(module) != "" && strings.TrimSpace(mnemonic) != "" {
		if logEntry, ok := c.LookupLog(module, mnemonic); ok {
			return KnowledgeLookupResult{Matched: true, Kind: "log", Log: &logEntry}, true
		}
	}

	var extractedOIDs []string
	if strings.TrimSpace(message) != "" {
		extractedOIDs = oidExtractRe.FindAllString(message, -1)
		for _, candidate := range extractedOIDs {
			if alarm, ok := c.LookupAlarm(candidate, cleanEventID); ok {
				return KnowledgeLookupResult{Matched: true, Kind: "alarm", Alarm: &alarm}, true
			}
		}
		if logEntry, ok := c.LookupLogFromMessage(message); ok {
			return KnowledgeLookupResult{Matched: true, Kind: "log", Log: &logEntry}, true
		}
	}

	if cleanOID != "" {
		if node, suffix, ok := c.LookupMIB(cleanOID); ok {
			return KnowledgeLookupResult{Matched: true, Kind: "mib", MIB: &node, InstanceSuffix: suffix}, true
		}
	}

	for _, candidate := range extractedOIDs {
		if node, suffix, ok := c.LookupMIB(candidate); ok {
			return KnowledgeLookupResult{Matched: true, Kind: "mib", MIB: &node, InstanceSuffix: suffix}, true
		}
	}

	return KnowledgeLookupResult{}, false
}

func cloneAlarmKnowledge(src AlarmKnowledgeEntry) AlarmKnowledgeEntry {
	out := src
	out.Parameters = slices.Clone(src.Parameters)
	out.Causes = slices.Clone(src.Causes)
	out.Procedures = slices.Clone(src.Procedures)
	if len(src.Variants) > 0 {
		out.Variants = make([]AlarmVariantEntry, len(src.Variants))
		for i, variant := range src.Variants {
			variant.Parameters = slices.Clone(variant.Parameters)
			variant.Causes = slices.Clone(variant.Causes)
			variant.Procedures = slices.Clone(variant.Procedures)
			out.Variants[i] = variant
		}
	} else {
		out.Variants = nil
	}
	return out
}

func applyAlarmVariant(dst *AlarmKnowledgeEntry, variant AlarmVariantEntry) {
	dst.SubID = variant.SubID
	dst.AlarmID = variant.AlarmID
	dst.Severity = variant.Severity
	dst.AlarmType = variant.AlarmType
	dst.TrapTemplate = variant.TrapTemplate
	dst.Meaning = variant.Meaning
	dst.Parameters = slices.Clone(variant.Parameters)
	dst.Impact = variant.Impact
	dst.Causes = slices.Clone(variant.Causes)
	dst.Procedures = slices.Clone(variant.Procedures)
	dst.Reference = variant.Reference
}

func cloneLogKnowledge(src LogKnowledgeEntry) LogKnowledgeEntry {
	out := src
	out.Parameters = slices.Clone(src.Parameters)
	out.Causes = slices.Clone(src.Causes)
	out.Procedures = slices.Clone(src.Procedures)
	return out
}
