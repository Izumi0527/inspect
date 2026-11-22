package snmpmib_test

import (
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/snmpmib"
)

func TestDefaultHuaweiKnowledgeCatalog_StatsAndCounts(t *testing.T) {
	catalog, err := snmpmib.DefaultHuaweiKnowledgeCatalog()
	if err != nil {
		t.Fatalf("DefaultHuaweiKnowledgeCatalog() error = %v", err)
	}
	stats := catalog.Stats()
	if stats.MIBModules < 185 || stats.MIBNodes < 11600 {
		t.Fatalf("MIB stats = %+v, want modules>=185 nodes>=11600", stats)
	}
	if stats.AlarmCount < 1300 || stats.AlarmVariants < 60 {
		t.Fatalf("Alarm stats = %+v, want alarm_count>=1300 variants>=60", stats)
	}
	if stats.LogModules < 180 || stats.LogCount < 2100 {
		t.Fatalf("Log stats = %+v, want log_modules>=180 log_count>=2100", stats)
	}
	if stats.ModelSeries < 40 {
		t.Fatalf("ModelSeries = %d, want >= 40", stats.ModelSeries)
	}
}

func TestHuaweiKnowledgeCatalog_LookupAlarmAndVariants(t *testing.T) {
	catalog, err := snmpmib.DefaultHuaweiKnowledgeCatalog()
	if err != nil {
		t.Fatalf("DefaultHuaweiKnowledgeCatalog() error = %v", err)
	}

	// 非 2011 标准 LLDP 告警
	lldp, ok := catalog.LookupAlarm("1.0.8802.1.1.2.0.0.1")
	if !ok || lldp.AlarmName != "lldpRemTablesChange" || lldp.Meaning == "" {
		t.Fatalf("LookupAlarm(LLDP) = (%+v, %v)", lldp, ok)
	}

	// 同 OID 多变体 hwOpticalInvalid 按 eventID 区分
	v1, ok := catalog.LookupAlarm(".1.3.6.1.4.1.2011.5.25.219.2.4.5", "136193")
	if !ok || v1.AlarmName != "hwOpticalInvalid" || v1.SubID != "136193" || len(v1.Variants) < 2 {
		t.Fatalf("hwOpticalInvalid variant 136193 = (%+v, %v)", v1, ok)
	}
	v2, ok := catalog.LookupAlarm("1.3.6.1.4.1.2011.5.25.219.2.4.5", "136203")
	if !ok || v2.SubID != "136203" || v2.Meaning == v1.Meaning {
		t.Fatalf("hwOpticalInvalid variant 136203 = (%+v, %v), want distinct meaning from %q", v2, ok, v1.Meaning)
	}
}

func TestHuaweiKnowledgeCatalog_LookupLogAndMessage(t *testing.T) {
	catalog, err := snmpmib.DefaultHuaweiKnowledgeCatalog()
	if err != nil {
		t.Fatalf("DefaultHuaweiKnowledgeCatalog() error = %v", err)
	}

	cpuLog, ok := catalog.LookupLog("voscpu", "cpu_usage_high")
	if !ok || cpuLog.Module != "VOSCPU" || cpuLog.Mnemonic != "CPU_USAGE_HIGH" || cpuLog.Meaning == "" {
		t.Fatalf("LookupLog(VOSCPU/CPU_USAGE_HIGH) = (%+v, %v)", cpuLog, ok)
	}
	if _, ok := catalog.LookupLog("RUMNG", "RU_INTF_ERR"); !ok {
		t.Fatal("LookupLog(RUMNG/RU_INTF_ERR) not found")
	}
	if _, ok := catalog.LookupLog("RUUP", "RUFWMISMATCH"); !ok {
		t.Fatal("LookupLog(RUUP/RUFWMISMATCH) not found")
	}

	msgLog, ok := catalog.LookupLogFromMessage("2026-11-22 10:00:00+08:00 HUAWEI %%01VOSCPU/4/CPU_USAGE_HIGH(l)[1]:CPU usage exceeded threshold.")
	if !ok || msgLog.Mnemonic != "CPU_USAGE_HIGH" {
		t.Fatalf("LookupLogFromMessage = (%+v, %v)", msgLog, ok)
	}
}

func TestHuaweiKnowledgeCatalog_LookupMIBAndContext(t *testing.T) {
	catalog, err := snmpmib.DefaultHuaweiKnowledgeCatalog()
	if err != nil {
		t.Fatalf("DefaultHuaweiKnowledgeCatalog() error = %v", err)
	}

	node, suffix, ok := catalog.LookupMIB(".1.3.6.1.4.1.2011.5.25.31.1.1.3.1.4.101")
	if !ok || node.Name != "hwEntityOpticalVendorSn" || suffix != "101" {
		t.Fatalf("LookupMIB(vendorSn.101) = (%+v, %q, %v)", node, suffix, ok)
	}

	res, ok := catalog.LookupByContext("", "", "", "OID: 1.3.6.1.4.1.2011.5.25.219.2.4.5 EventID=136203", "")
	if !ok || !res.Matched || res.Kind != "alarm" || res.Alarm == nil || res.Alarm.SubID != "136203" {
		t.Fatalf("LookupByContext(alarm message) = (%+v, %v)", res, ok)
	}

	resLog, ok := catalog.LookupByContext("", "", "", "%%01RUMNG/4/RU_INTF_ERR(l):Port error", "")
	if !ok || !resLog.Matched || resLog.Kind != "log" || resLog.Log == nil || resLog.Log.Module != "RUMNG" {
		t.Fatalf("LookupByContext(log message) = (%+v, %v)", resLog, ok)
	}

	resMIB, ok := catalog.LookupByContext("1.3.6.1.4.1.2011.5.25.31.1.1.2.1.13.1", "", "", "", "")
	if !ok || !resMIB.Matched || resMIB.Kind != "mib" || resMIB.MIB == nil || resMIB.MIB.Name != "hwEntityModel" || resMIB.InstanceSuffix != "1" {
		t.Fatalf("LookupByContext(mib) = (%+v, %v)", resMIB, ok)
	}
}

func TestHuaweiKnowledgeCatalog_VariantsDeepClone(t *testing.T) {
	catalog, err := snmpmib.DefaultHuaweiKnowledgeCatalog()
	if err != nil {
		t.Fatalf("DefaultHuaweiKnowledgeCatalog() error = %v", err)
	}

	entry, ok := catalog.LookupAlarm("1.3.6.1.4.1.2011.5.25.219.2.4.5", "136193")
	if !ok || len(entry.Variants) == 0 || len(entry.Variants[0].Causes) == 0 {
		t.Fatalf("expected hwOpticalInvalid variants with causes, got %+v (ok=%v)", entry, ok)
	}
	origCause := entry.Variants[0].Causes[0]
	entry.Variants[0].Causes[0] = "MUTATED_CAUSE"
	if len(entry.Variants[0].Procedures) > 0 {
		entry.Variants[0].Procedures[0] = "MUTATED_PROCEDURE"
	}
	if len(entry.Variants[0].Parameters) > 0 {
		entry.Variants[0].Parameters[0].Meaning = "MUTATED_PARAM"
	}

	fresh, ok := catalog.LookupAlarm("1.3.6.1.4.1.2011.5.25.219.2.4.5", "136193")
	if !ok || fresh.Variants[0].Causes[0] != origCause {
		t.Fatalf("cached variant slice was mutated: got %q, want %q", fresh.Variants[0].Causes[0], origCause)
	}
}
