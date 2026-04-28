package devices_test

import (
	"testing"
	_ "unsafe"

	"github.com/gosnmp/gosnmp"
	"go.uber.org/zap"

	_ "github.com/your-org/inspect-system/backend-go/internal/devices"
	devices "github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/snmpmib"
)

type collectorSNMPClient interface {
	Get(oids []string) (*gosnmp.SnmpPacket, error)
	BulkWalkAll(oid string) ([]gosnmp.SnmpPDU, error)
}

//go:linkname resolveMetricCandidates github.com/your-org/inspect-system/backend-go/internal/devices.(*SNMPCollector).resolveMetricCandidates
func resolveMetricCandidates(collector *devices.SNMPCollector, metricName string, vendor string) []snmpmib.MetricCandidate

//go:linkname collectCPUFromCandidates github.com/your-org/inspect-system/backend-go/internal/devices.collectCPUFromCandidates
func collectCPUFromCandidates(client collectorSNMPClient, candidates []snmpmib.MetricCandidate, logger *zap.Logger) *float64

//go:linkname collectMemoryFromCandidates github.com/your-org/inspect-system/backend-go/internal/devices.collectMemoryFromCandidates
func collectMemoryFromCandidates(client collectorSNMPClient, candidates []snmpmib.MetricCandidate, logger *zap.Logger) (*float64, *int64, *int64)

//go:linkname collectTemperatureFromCandidates github.com/your-org/inspect-system/backend-go/internal/devices.collectTemperatureFromCandidates
func collectTemperatureFromCandidates(client collectorSNMPClient, candidates []snmpmib.MetricCandidate) *float64

//go:linkname collectBGPPeersFromCatalog github.com/your-org/inspect-system/backend-go/internal/devices.collectBGPPeersFromCatalog
func collectBGPPeersFromCatalog(client collectorSNMPClient, entries []snmpmib.CatalogOID) []devices.BGPNeighborMetrics

//go:linkname collectOpticalTransceiversFromCatalog github.com/your-org/inspect-system/backend-go/internal/devices.collectOpticalTransceiversFromCatalog
func collectOpticalTransceiversFromCatalog(client collectorSNMPClient, entries []snmpmib.CatalogOID) []devices.OpticalTransceiverMetrics

type fakeCollectorSNMPClient struct {
	getPackets      map[string]*gosnmp.SnmpPacket
	bulkWalkPackets map[string][]gosnmp.SnmpPDU
	getCalls        [][]string
	bulkWalkCalls   []string
}

func (f *fakeCollectorSNMPClient) Get(oids []string) (*gosnmp.SnmpPacket, error) {
	cloned := append([]string(nil), oids...)
	f.getCalls = append(f.getCalls, cloned)
	if len(oids) == 1 {
		if packet, ok := f.getPackets[oids[0]]; ok {
			return packet, nil
		}
	}
	if len(oids) > 1 {
		key := oids[0]
		for i := 1; i < len(oids); i++ {
			key += "," + oids[i]
		}
		if packet, ok := f.getPackets[key]; ok {
			return packet, nil
		}
	}
	return &gosnmp.SnmpPacket{}, nil
}

func (f *fakeCollectorSNMPClient) BulkWalkAll(oid string) ([]gosnmp.SnmpPDU, error) {
	f.bulkWalkCalls = append(f.bulkWalkCalls, oid)
	if result, ok := f.bulkWalkPackets[oid]; ok {
		return result, nil
	}
	return nil, nil
}

func TestCollectCPUFromCandidates_ShouldUseCandidateOID(t *testing.T) {
	customOID := "1.3.6.1.4.1.99999.1.1"
	client := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			customOID: {
				{Name: customOID + ".1", Type: gosnmp.Integer, Value: 20},
				{Name: customOID + ".2", Type: gosnmp.Integer, Value: 40},
			},
		},
	}

	value := collectCPUFromCandidates(client, []snmpmib.MetricCandidate{
		{
			ID:        "custom_cpu",
			Method:    "bulkwalk",
			OIDs:      []string{customOID},
			Strategy:  "walk_percent",
			Aggregate: "avg_all",
		},
	}, nil)

	if value == nil {
		t.Fatal("cpu usage = nil, want non-nil")
	}

	if *value != 30 {
		t.Fatalf("cpu usage = %v, want 30", *value)
	}

	if len(client.bulkWalkCalls) != 1 || client.bulkWalkCalls[0] != customOID {
		t.Fatalf("bulkWalkCalls = %v, want [%s]", client.bulkWalkCalls, customOID)
	}
}

func TestResolveMetricCandidates_ShouldPreferVendorSpecificThenFallback(t *testing.T) {
	registry := &snmpmib.Registry{
		SchemaVersion: 1,
		Vendors: map[string]snmpmib.Vendor{
			"huawei": {
				DisplayName: "Huawei",
				Aliases:     []string{"huawei"},
			},
		},
		Common: snmpmib.CommonSection{
			Probe: snmpmib.ProbeSection{
				SysDescr: snmpmib.OIDDefinition{OID: "1.3.6.1.2.1.1.1.0", Method: "get"},
			},
			System: snmpmib.SystemSection{
				SysUptime: snmpmib.OIDDefinition{OID: "1.3.6.1.2.1.1.3.0", Method: "get"},
			},
			Interfaces: snmpmib.InterfacesSection{
				IfDescr:       snmpmib.OIDDefinition{OID: "1.3.6.1.2.1.2.2.1.2", Method: "bulkwalk"},
				IfHCInOctets:  snmpmib.OIDDefinition{OID: "1.3.6.1.2.1.31.1.1.1.6", Method: "bulkwalk"},
				IfHCOutOctets: snmpmib.OIDDefinition{OID: "1.3.6.1.2.1.31.1.1.1.10", Method: "bulkwalk"},
			},
		},
		Metrics: snmpmib.MetricsSection{
			CPUUsage: []snmpmib.MetricCandidate{
				{
					ID:       "host_resources_processor_load",
					Vendors:  []string{"*"},
					Method:   "bulkwalk",
					OIDs:     []string{"1.3.6.1.2.1.25.3.3.1.2"},
					Strategy: "walk_percent",
				},
				{
					ID:       "huawei_entity_cpu",
					Vendors:  []string{"huawei"},
					Method:   "bulkwalk",
					OIDs:     []string{"1.3.6.1.4.1.2011.5.25.31.1.1.1.1.5"},
					Strategy: "walk_percent_auto",
				},
			},
			MemoryUsage: []snmpmib.MetricCandidate{
				{ID: "mem", Vendors: []string{"*"}, Method: "get", OIDs: []string{"1"}, Strategy: "get_percent"},
			},
			Temperature: []snmpmib.MetricCandidate{
				{ID: "temp", Vendors: []string{"*"}, Method: "get", OIDs: []string{"1"}, Strategy: "get_percent"},
			},
		},
		Trap: snmpmib.TrapSection{
			Core: snmpmib.TrapCoreSection{
				TrapOID:      "1",
				SysUptime:    "2",
				Community:    "3",
				Enterprise:   "4",
				AgentAddress: "5",
			},
		},
	}

	collector := devices.NewSNMPCollectorWithRegistry(zap.NewNop(), registry)
	candidates := resolveMetricCandidates(collector, "cpu_usage", "huawei")

	if len(candidates) < 2 {
		t.Fatalf("len(candidates)=%d, want >= 2", len(candidates))
	}
	if candidates[0].ID != "huawei_entity_cpu" {
		t.Fatalf("first candidate=%q, want huawei_entity_cpu", candidates[0].ID)
	}
	if candidates[1].ID != "host_resources_processor_load" {
		t.Fatalf("second candidate=%q, want host_resources_processor_load", candidates[1].ID)
	}
}

func TestCollectMemoryFromCandidates_ShouldUseCandidateOIDs(t *testing.T) {
	usageOID := "1.3.6.1.4.1.99999.2.1"
	sizeOID := "1.3.6.1.4.1.99999.2.2"
	client := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			usageOID: {
				{Name: usageOID + ".1", Type: gosnmp.Integer, Value: 40},
			},
			sizeOID: {
				{Name: sizeOID + ".1", Type: gosnmp.Integer, Value: 1024},
			},
		},
	}

	usage, total, used := collectMemoryFromCandidates(client, []snmpmib.MetricCandidate{
		{
			ID:        "custom_memory",
			Method:    "bulkwalk",
			OIDs:      []string{usageOID, sizeOID},
			Strategy:  "walk_percent_with_size_kb",
			Aggregate: "avg_non_zero_total_sum",
		},
	}, nil)

	if usage == nil || total == nil || used == nil {
		t.Fatalf("memory result = (%v, %v, %v), want all non-nil", usage, total, used)
	}

	if *usage != 40 {
		t.Fatalf("memory usage = %v, want 40", *usage)
	}

	if *total != 1024*1024 {
		t.Fatalf("memory total = %d, want %d", *total, 1024*1024)
	}

	const expectedUsed = int64(419430)
	if *used != expectedUsed {
		t.Fatalf("memory used = %d, want %d", *used, expectedUsed)
	}

	if len(client.bulkWalkCalls) != 2 || client.bulkWalkCalls[0] != usageOID || client.bulkWalkCalls[1] != sizeOID {
		t.Fatalf("bulkWalkCalls = %v, want [%s %s]", client.bulkWalkCalls, usageOID, sizeOID)
	}
}

func TestCollectTemperatureFromCandidates_ShouldUseCandidateOID(t *testing.T) {
	customOID := "1.3.6.1.4.1.99999.3.1"
	client := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			customOID: {
				{Name: customOID + ".1", Type: gosnmp.Integer, Value: 36},
				{Name: customOID + ".2", Type: gosnmp.Integer, Value: 48},
			},
		},
	}

	value := collectTemperatureFromCandidates(client, []snmpmib.MetricCandidate{
		{
			ID:       "custom_temp",
			Method:   "bulkwalk",
			OIDs:     []string{customOID},
			Strategy: "walk_max_celsius",
		},
	})

	if value == nil {
		t.Fatal("temperature = nil, want non-nil")
	}

	if *value != 48 {
		t.Fatalf("temperature = %v, want 48", *value)
	}

	if len(client.bulkWalkCalls) != 1 || client.bulkWalkCalls[0] != customOID {
		t.Fatalf("bulkWalkCalls = %v, want [%s]", client.bulkWalkCalls, customOID)
	}
}

func TestCollectBGPPeersFromCatalog_ShouldUseHuaweiCatalogEntries(t *testing.T) {
	stateOID := "1.3.6.1.4.1.2011.5.25.177.1.1.2.1.5"
	uptimeOID := "1.3.6.1.4.1.2011.5.25.177.1.1.2.1.7"

	client := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			stateOID: {
				{Name: stateOID + ".10", Type: gosnmp.Integer, Value: 6},
			},
			uptimeOID: {
				{Name: uptimeOID + ".10", Type: gosnmp.Gauge32, Value: 3600},
			},
		},
	}

	peers := collectBGPPeersFromCatalog(client, []snmpmib.CatalogOID{
		{
			ID:          "hw_bgp_peer_state",
			Name:        "hwBgpPeerState",
			OID:         stateOID,
			Method:      "bulkwalk",
			ValueType:   "integer",
			Description: "BGP 对等体状态",
		},
		{
			ID:          "hw_bgp_peer_fsm_established_time",
			Name:        "hwBgpPeerFsmEstablishedTime",
			OID:         uptimeOID,
			Method:      "bulkwalk",
			ValueType:   "gauge32",
			Description: "BGP 会话已建立时长",
		},
	})

	if len(peers) != 1 {
		t.Fatalf("len(peers)=%d, want 1", len(peers))
	}
	if peers[0].Index != "10" {
		t.Fatalf("peer index=%q, want 10", peers[0].Index)
	}
	if peers[0].State == nil || *peers[0].State != 6 {
		t.Fatalf("peer state=%v, want 6", peers[0].State)
	}
	if peers[0].StateLabel != "established" {
		t.Fatalf("peer state_label=%q, want established", peers[0].StateLabel)
	}
	if peers[0].EstablishedTime == nil || *peers[0].EstablishedTime != 3600 {
		t.Fatalf("peer established_time=%v, want 3600", peers[0].EstablishedTime)
	}
}

func TestCollectBGPPeersFromCatalog_ShouldUseH3CCatalogEntries(t *testing.T) {
	stateOID := "1.3.6.1.4.1.25506.2.183.1.1.1.3"
	errorOID := "1.3.6.1.4.1.25506.2.183.1.1.1.2"
	indexSuffix := "1.10.20.30.40"

	client := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			stateOID: {
				{Name: stateOID + "." + indexSuffix, Type: gosnmp.Integer, Value: 3},
			},
			errorOID: {
				{Name: errorOID + "." + indexSuffix, Type: gosnmp.OctetString, Value: []byte("Cease")},
			},
		},
	}

	peers := collectBGPPeersFromCatalog(client, []snmpmib.CatalogOID{
		{
			ID:          "hh3c_bgp4v2_peer_last_error",
			Name:        "hh3cBgp4V2PeerLastErrorCodeReceived",
			OID:         errorOID,
			Method:      "bulkwalk",
			ValueType:   "octet_string",
			Description: "BGP 对等体最近一次收到的错误码",
		},
		{
			ID:          "hh3c_bgp4v2_peer_state",
			Name:        "hh3cBgp4V2PeerState",
			OID:         stateOID,
			Method:      "bulkwalk",
			ValueType:   "integer",
			Description: "BGP 对等体状态",
		},
	})

	if len(peers) != 1 {
		t.Fatalf("len(peers)=%d, want 1", len(peers))
	}
	if peers[0].Index != indexSuffix {
		t.Fatalf("peer index=%q, want %q", peers[0].Index, indexSuffix)
	}
	if peers[0].State == nil || *peers[0].State != 3 {
		t.Fatalf("peer state=%v, want 3", peers[0].State)
	}
	if peers[0].StateLabel != "active" {
		t.Fatalf("peer state_label=%q, want active", peers[0].StateLabel)
	}
	if peers[0].LastError == nil || *peers[0].LastError != "Cease" {
		t.Fatalf("peer last_error=%v, want Cease", peers[0].LastError)
	}
}

func TestCollectOpticalTransceiversFromCatalog_ShouldUseH3COpticalEntries(t *testing.T) {
	voltageOID := "1.3.6.1.4.1.25506.18.2.1.1.4"
	biasOID := "1.3.6.1.4.1.25506.18.2.1.1.2"
	txOID := "1.3.6.1.4.1.25506.18.2.1.1.5"
	rxOID := "1.3.6.1.4.1.25506.18.2.1.1.6"

	client := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			voltageOID: {
				{Name: voltageOID + ".101", Type: gosnmp.Gauge32, Value: 33000},
			},
			biasOID: {
				{Name: biasOID + ".101", Type: gosnmp.Gauge32, Value: 120},
			},
			txOID: {
				{Name: txOID + ".101", Type: gosnmp.Gauge32, Value: 85},
			},
			rxOID: {
				{Name: rxOID + ".101", Type: gosnmp.Gauge32, Value: 90},
			},
		},
	}

	items := collectOpticalTransceiversFromCatalog(client, []snmpmib.CatalogOID{
		{
			ID:          "hh3c_transceiver_voltage",
			Name:        "hh3cTransceiverVoltage",
			OID:         voltageOID,
			Method:      "bulkwalk",
			ValueType:   "gauge32",
			Unit:        "0.1mV",
			Description: "光模块工作电压",
		},
		{
			ID:          "hh3c_transceiver_bias_current",
			Name:        "hh3cTransceiverBiasCurrent",
			OID:         biasOID,
			Method:      "bulkwalk",
			ValueType:   "gauge32",
			Unit:        "0.1uA",
			Description: "光模块偏置电流",
		},
		{
			ID:          "hh3c_transceiver_cur_tx_power",
			Name:        "hh3cTransceiverCurTXPower",
			OID:         txOID,
			Method:      "bulkwalk",
			ValueType:   "gauge32",
			Unit:        "0.1uW",
			Description: "光模块当前发光功率",
		},
		{
			ID:          "hh3c_transceiver_cur_rx_power",
			Name:        "hh3cTransceiverCurRXPower",
			OID:         rxOID,
			Method:      "bulkwalk",
			ValueType:   "gauge32",
			Unit:        "0.1uW",
			Description: "光模块当前收光功率",
		},
	})

	if len(items) != 1 {
		t.Fatalf("len(items)=%d, want 1", len(items))
	}
	if items[0].Index != "101" {
		t.Fatalf("optical index=%q, want 101", items[0].Index)
	}
	if items[0].Voltage == nil || *items[0].Voltage != 3300 {
		t.Fatalf("optical voltage=%v, want 3300", items[0].Voltage)
	}
	if items[0].VoltageUnit != "mV" {
		t.Fatalf("optical voltage_unit=%q, want mV", items[0].VoltageUnit)
	}
	if items[0].BiasCurrent == nil || *items[0].BiasCurrent != 12 {
		t.Fatalf("optical bias_current=%v, want 12", items[0].BiasCurrent)
	}
	if items[0].BiasCurrentUnit != "uA" {
		t.Fatalf("optical bias_current_unit=%q, want uA", items[0].BiasCurrentUnit)
	}
	if items[0].TxPower == nil || *items[0].TxPower != 8.5 {
		t.Fatalf("optical tx_power=%v, want 8.5", items[0].TxPower)
	}
	if items[0].RxPower == nil || *items[0].RxPower != 9 {
		t.Fatalf("optical rx_power=%v, want 9", items[0].RxPower)
	}
}

func TestCollectOpticalTransceiversFromCatalog_ShouldMapHuaweiOpticalCurrentToBiasCurrent(t *testing.T) {
	currentOID := "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.18"

	client := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			currentOID: {
				{Name: currentOID + ".7", Type: gosnmp.Integer, Value: 42},
			},
		},
	}

	items := collectOpticalTransceiversFromCatalog(client, []snmpmib.CatalogOID{
		{
			ID:          "hw_entity_optical_current",
			Name:        "hwEntityOpticalCurrent",
			OID:         currentOID,
			Method:      "bulkwalk",
			ValueType:   "integer",
			Description: "光模块偏置电流",
		},
	})

	if len(items) != 1 {
		t.Fatalf("len(items)=%d, want 1", len(items))
	}
	if items[0].BiasCurrent == nil || *items[0].BiasCurrent != 42 {
		t.Fatalf("optical bias_current=%v, want 42", items[0].BiasCurrent)
	}
}
