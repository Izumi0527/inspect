package devices_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	_ "unsafe"

	"github.com/gosnmp/gosnmp"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/snmpmib"
)

//go:linkname collectDeviceIdentityWithDeviceContext github.com/your-org/inspect-system/backend-go/internal/devices.(*SNMPCollector).collectDeviceIdentityWithDeviceContext
func collectDeviceIdentityWithDeviceContext(
	collector *devices.SNMPCollector,
	target collectorSNMPClient,
	metrics *devices.SNMPMetrics,
	registry *snmpmib.Registry,
	vendor string,
	cachedSysDescr string,
	sysDescrCached bool,
	cachedSysObjectID string,
	sysObjectIDCached bool,
	catalog *entityCatalogOpaque,
)

func TestCollectMemoryFromCandidates_WalkCacheAvoidsDuplicateWalks(t *testing.T) {
	registry, err := snmpmib.DefaultRegistry()
	if err != nil {
		t.Fatalf("DefaultRegistry() error = %v", err)
	}
	candidates := registry.MetricCandidatesForDevice("memory_usage", "", ".1.3.6.1.4.1.56813.2.23.811", "")

	usageOID := "1.3.6.1.4.1.56813.5.25.31.1.1.1.1.7"
	bytesOID := "1.3.6.1.4.1.56813.5.25.31.1.1.1.1.9"

	client := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			usageOID: {
				{Name: "." + usageOID + ".1", Type: gosnmp.Integer, Value: 35},
			},
			// .19 (FMEntityMemSizeMega) 在 FutureMatrix 不支持，返回空；回退到 .9 (FMEntityMemSize)
			bytesOID: {
				{Name: "." + bytesOID + ".1", Type: gosnmp.Integer, Value: 2 * 1024 * 1024 * 1024},
			},
		},
	}

	usage, total, used := collectMemoryFromCandidates(client, candidates, zap.NewNop())
	if usage == nil || *usage != 35 {
		t.Fatalf("usage = %v, want 35", usage)
	}
	if total == nil || *total != 2*1024*1024*1024 {
		t.Fatalf("total = %v, want 2GiB", total)
	}
	if used == nil || *used <= 0 {
		t.Fatalf("used = %v, want > 0", used)
	}

	usageWalkCount := 0
	for _, called := range client.bulkWalkCalls {
		if called == usageOID {
			usageWalkCount++
		}
	}
	if usageWalkCount != 1 {
		t.Fatalf(".7 BulkWalkAll count = %d, want 1 (calls=%v)", usageWalkCount, client.bulkWalkCalls)
	}
}

func TestFutureMatrix56813_IdentityAndESNFallback(t *testing.T) {
	registry, err := snmpmib.DefaultRegistry()
	if err != nil {
		t.Fatalf("DefaultRegistry() error = %v", err)
	}
	collector := devices.NewSNMPCollectorWithRegistry(zap.NewNop(), registry)

	t.Run("FutureMatrix sysDescr 品牌前缀与括号解析", func(t *testing.T) {
		model, version := parseDeviceIdentityFromSysDescr("FutureMatrix S5736-S24T4XC\r\nVersatile Routing Platform Software\r\nVRP (R) software, Version 5.170 (FutureMatrix S5736-S24T4XC V200R025C00SPC100)")
		if model != "S5736-S24T4XC" || version != "V200R025C00SPC100" {
			t.Fatalf("got (%q, %q)", model, version)
		}
	})

	t.Run("56813 设备跳过 FMDeviceEsn 选型并用作序列号兜底", func(t *testing.T) {
		esnOID := "1.3.6.1.4.1.56813.5.25.188.1.1"
		boardTypeOID := "1.3.6.1.4.1.56813.5.25.31.1.1.2.1.11"
		metrics := &devices.SNMPMetrics{}
		client := &fakeCollectorSNMPClient{
			getPackets: map[string]*gosnmp.SnmpPacket{
				esnOID: {
					Variables: []gosnmp.SnmpPDU{
						{Name: "." + esnOID + ".0", Type: gosnmp.OctetString, Value: []byte("210235FM568130001")},
					},
				},
			},
			bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
				boardTypeOID: {
					{Name: "." + boardTypeOID + ".1", Type: gosnmp.OctetString, Value: []byte("S5736-S24T4XC")},
				},
			},
		}
		catalog := newEntityCatalog(client, registry)
		collectDeviceIdentityWithDeviceContext(
			collector,
			client,
			metrics,
			registry,
			"futurematrix",
			"FutureMatrix Versatile Routing Platform Software V200R025C00",
			true,
			".1.3.6.1.4.1.56813.2.23.811",
			true,
			catalog,
		)
		if metrics.Model == nil || *metrics.Model != "S5736-S24T4XC" {
			t.Fatalf("Model = %v, want S5736-S24T4XC", metrics.Model)
		}
		if metrics.SerialNumber == nil || *metrics.SerialNumber != "210235FM568130001" {
			t.Fatalf("SerialNumber = %v, want 210235FM568130001", metrics.SerialNumber)
		}
	})
}

func TestSNMPDiagnostics_ClassifyCompactAndFormat(t *testing.T) {
	if got := devices.ClassifySNMPError(context.DeadlineExceeded); got != "timeout" {
		t.Fatalf("ClassifySNMPError(DeadlineExceeded) = %q", got)
	}
	if got := devices.ClassifySNMPError(context.Canceled); got != "canceled" {
		t.Fatalf("ClassifySNMPError(Canceled) = %q", got)
	}
	if got := devices.ClassifySNMPError(errors.New("USM authentication failure with secret=myCommunity")); got != "auth_error" {
		t.Fatalf("ClassifySNMPError(auth) = %q", got)
	}
	if got := devices.ClassifySNMPError(errors.New("connection refused")); got != "unreachable" {
		t.Fatalf("ClassifySNMPError(refused) = %q", got)
	}
	if got := devices.ClassifySNMPError(errors.New("community=Secret123 bad oid")); got != "snmp_error" {
		t.Fatalf("ClassifySNMPError(generic) = %q", got)
	}

	candidates := make([]devices.SNMPCandidateDiagnostic, 0, 16)
	for i := 0; i < 16; i++ {
		status := "empty"
		if i == 15 {
			status = "error"
		}
		candidates = append(candidates, devices.SNMPCandidateDiagnostic{
			Category:    "optical",
			CandidateID: "cand",
			OID:         "1.3.6.1.4.1.56813.1",
			Status:      status,
			ElapsedMs:   10,
		})
	}
	compacted := devices.CompactSNMPDiagnostics(&devices.SNMPCollectionDiagnostics{
		EffectiveVendor:  "huawei",
		SysObjectID:      "1.3.6.1.4.1.56813.2.23.811",
		CanonicalPrefix:  "1.3.6.1.4.1.2011",
		ActivePrefix:     "1.3.6.1.4.1.56813",
		EnterpriseMapped: true,
		TotalElapsedMs:   120,
		Candidates:       candidates,
	})
	if len(compacted.Candidates) != 12 {
		t.Fatalf("len(compacted.Candidates) = %d, want 12", len(compacted.Candidates))
	}
	hasError := false
	for _, c := range compacted.Candidates {
		if c.Status == "error" {
			hasError = true
		}
	}
	if !hasError {
		t.Fatal("compacted diagnostics dropped error candidate")
	}

	logLine := devices.FormatCandidateDiagnosticsLog(compacted)
	if !strings.Contains(logLine, "1.3.6.1.4.1.2011->1.3.6.1.4.1.56813") {
		t.Fatalf("unexpected log line: %q", logLine)
	}
}
