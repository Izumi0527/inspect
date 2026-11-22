package snmpmib

import (
	"bytes"
	"compress/gzip"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"sync"
)

//go:embed huawei-mib-catalog.json.gz
var embeddedHuaweiMIBCatalog []byte

//go:embed huawei-alarms-kb.json.gz
var embeddedHuaweiAlarmsKB []byte

//go:embed huawei-logs-kb.json.gz
var embeddedHuaweiLogsKB []byte

const maxKnowledgeJSONBytes = 32 << 20 // 32 MiB 解压保护上限，防止畸形 gzip 膨胀。

var (
	defaultHuaweiKnowledgeCatalog *HuaweiKnowledgeCatalog
	huaweiKnowledgeOnce           sync.Once
	huaweiKnowledgeErr            error
)

type KnowledgeParam struct {
	Name    string `json:"name"`
	Meaning string `json:"meaning"`
}

type MIBNodeEntry struct {
	OID      string `json:"oid"`
	Name     string `json:"name"`
	MIB      string `json:"mib"`
	DataType string `json:"data_type"`
	Access   string `json:"access"`
	Meaning  string `json:"meaning"`
	ImplSpec string `json:"impl_spec"`
}

type AlarmVariantEntry struct {
	SubID        string           `json:"sub_id"`
	AlarmID      string           `json:"alarm_id"`
	Severity     string           `json:"severity"`
	AlarmType    string           `json:"alarm_type"`
	TrapTemplate string           `json:"trap_template"`
	Meaning      string           `json:"meaning"`
	Parameters   []KnowledgeParam `json:"parameters"`
	Impact       string           `json:"impact"`
	Causes       []string         `json:"causes"`
	Procedures   []string         `json:"procedures"`
	Reference    string           `json:"reference"`
}

type AlarmKnowledgeEntry struct {
	OID          string              `json:"oid"`
	Module       string              `json:"module"`
	AlarmName    string              `json:"alarm_name"`
	SubID        string              `json:"sub_id"`
	AlarmID      string              `json:"alarm_id"`
	Severity     string              `json:"severity"`
	AlarmType    string              `json:"alarm_type"`
	TrapTemplate string              `json:"trap_template"`
	Meaning      string              `json:"meaning"`
	Parameters   []KnowledgeParam    `json:"parameters"`
	Impact       string              `json:"impact"`
	Causes       []string            `json:"causes"`
	Procedures   []string            `json:"procedures"`
	Reference    string              `json:"reference"`
	Variants     []AlarmVariantEntry `json:"variants,omitempty"`
}

type LogKnowledgeEntry struct {
	Module     string           `json:"module"`
	Severity   int              `json:"severity"`
	Mnemonic   string           `json:"mnemonic"`
	Template   string           `json:"template"`
	Meaning    string           `json:"meaning"`
	Parameters []KnowledgeParam `json:"parameters"`
	Causes     []string         `json:"causes"`
	Procedures []string         `json:"procedures"`
}

type KnowledgeStats struct {
	MIBModules    int `json:"mib_modules"`
	MIBNodes      int `json:"mib_nodes"`
	AlarmCount    int `json:"alarm_count"`
	AlarmVariants int `json:"alarm_variants"`
	LogModules    int `json:"log_modules"`
	LogCount      int `json:"log_count"`
	ModelSeries   int `json:"model_series"`
}

// HuaweiKnowledgeCatalog 提供华为官方 MIB / 告警 / 日志全量知识库的只读检索能力。
type HuaweiKnowledgeCatalog struct {
	mibByOID    map[string]MIBNodeEntry
	alarmByOID  map[string]AlarmKnowledgeEntry
	logByKey    map[string]LogKnowledgeEntry
	logBySevKey map[string]LogKnowledgeEntry
	stats       KnowledgeStats
}

type mibCatalogFile struct {
	SchemaVersion int            `json:"schema_version"`
	ModuleCount   int            `json:"module_count"`
	Nodes         []MIBNodeEntry `json:"nodes"`
}

type alarmsKBFile struct {
	SchemaVersion int                   `json:"schema_version"`
	Alarms        []AlarmKnowledgeEntry `json:"alarms"`
}

type logsKBFile struct {
	SchemaVersion int                 `json:"schema_version"`
	ModuleCount   int                 `json:"module_count"`
	Logs          []LogKnowledgeEntry `json:"logs"`
}

// DefaultHuaweiKnowledgeCatalog 返回嵌入的华为官方全量知识库（首次调用解压并建索引，之后复用）。
func DefaultHuaweiKnowledgeCatalog() (*HuaweiKnowledgeCatalog, error) {
	huaweiKnowledgeOnce.Do(func() {
		defaultHuaweiKnowledgeCatalog, huaweiKnowledgeErr = loadEmbeddedHuaweiKnowledge()
	})
	return defaultHuaweiKnowledgeCatalog, huaweiKnowledgeErr
}

// Stats 返回知识库各类条目统计。
func (c *HuaweiKnowledgeCatalog) Stats() KnowledgeStats {
	if c == nil {
		return KnowledgeStats{}
	}
	return c.stats
}

func loadEmbeddedHuaweiKnowledge() (*HuaweiKnowledgeCatalog, error) {
	var mibDoc mibCatalogFile
	if err := decodeGzipJSON(embeddedHuaweiMIBCatalog, &mibDoc); err != nil || mibDoc.SchemaVersion != 1 {
		return nil, fmt.Errorf("load huawei-mib-catalog.json.gz failed (schema=%d): %w", mibDoc.SchemaVersion, err)
	}
	var alarmDoc alarmsKBFile
	if err := decodeGzipJSON(embeddedHuaweiAlarmsKB, &alarmDoc); err != nil || alarmDoc.SchemaVersion != 1 {
		return nil, fmt.Errorf("load huawei-alarms-kb.json.gz failed (schema=%d): %w", alarmDoc.SchemaVersion, err)
	}
	var logDoc logsKBFile
	if err := decodeGzipJSON(embeddedHuaweiLogsKB, &logDoc); err != nil || logDoc.SchemaVersion != 1 {
		return nil, fmt.Errorf("load huawei-logs-kb.json.gz failed (schema=%d): %w", logDoc.SchemaVersion, err)
	}

	catalog := &HuaweiKnowledgeCatalog{
		mibByOID:    make(map[string]MIBNodeEntry, len(mibDoc.Nodes)),
		alarmByOID:  make(map[string]AlarmKnowledgeEntry, len(alarmDoc.Alarms)),
		logByKey:    make(map[string]LogKnowledgeEntry, len(logDoc.Logs)),
		logBySevKey: make(map[string]LogKnowledgeEntry, len(logDoc.Logs)),
	}
	for _, node := range mibDoc.Nodes {
		if oid := NormalizeOID(node.OID); oid != "" {
			node.OID = oid
			catalog.mibByOID[oid] = node
		}
	}
	variantCount := 0
	for _, alarm := range alarmDoc.Alarms {
		if oid := NormalizeOID(alarm.OID); oid != "" {
			alarm.OID = oid
			variantCount += len(alarm.Variants)
			catalog.alarmByOID[oid] = alarm
		}
	}
	for _, entry := range logDoc.Logs {
		mod, mnem := strings.ToUpper(strings.TrimSpace(entry.Module)), strings.ToUpper(strings.TrimSpace(entry.Mnemonic))
		if mod == "" || mnem == "" {
			continue
		}
		key := logLookupKey(mod, mnem)
		if _, exists := catalog.logByKey[key]; !exists {
			catalog.logByKey[key] = entry
		}
		catalog.logBySevKey[logSeverityLookupKey(mod, entry.Severity, mnem)] = entry
	}

	modelSeries := 0
	if modelCatalog, err := DefaultHuaweiModelCatalog(); err == nil && modelCatalog != nil {
		modelSeries = len(modelCatalog.Models)
	}
	catalog.stats = KnowledgeStats{
		MIBModules: mibDoc.ModuleCount, MIBNodes: len(catalog.mibByOID),
		AlarmCount: len(catalog.alarmByOID), AlarmVariants: variantCount,
		LogModules: logDoc.ModuleCount, LogCount: len(logDoc.Logs),
		ModelSeries: modelSeries,
	}
	return catalog, nil
}

func decodeGzipJSON(raw []byte, dst any) error {
	gz, err := gzip.NewReader(bytes.NewReader(raw))
	if err != nil {
		return err
	}
	defer gz.Close()

	limited, err := io.ReadAll(io.LimitReader(gz, maxKnowledgeJSONBytes+1))
	if err != nil {
		return err
	}
	if int64(len(limited)) > maxKnowledgeJSONBytes {
		return fmt.Errorf("decompressed payload exceeds %d bytes limit", maxKnowledgeJSONBytes)
	}
	return json.Unmarshal(limited, dst)
}

func logLookupKey(module, mnemonic string) string {
	return strings.ToUpper(strings.TrimSpace(module)) + "\x00" + strings.ToUpper(strings.TrimSpace(mnemonic))
}

func logSeverityLookupKey(module string, severity int, mnemonic string) string {
	return fmt.Sprintf("%s\x00%d\x00%s", strings.ToUpper(strings.TrimSpace(module)), severity, strings.ToUpper(strings.TrimSpace(mnemonic)))
}
