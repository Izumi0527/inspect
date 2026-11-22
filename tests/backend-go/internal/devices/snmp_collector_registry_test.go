package devices_test

import (
	"context"
	"errors"
	"math"
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

//go:linkname shouldFallbackToWalkAll github.com/your-org/inspect-system/backend-go/internal/devices.shouldFallbackToWalkAll
func shouldFallbackToWalkAll(err error) bool

//go:linkname collectComponentsWithDeviceContext github.com/your-org/inspect-system/backend-go/internal/devices.(*SNMPCollector).collectComponentsWithDeviceContext
func collectComponentsWithDeviceContext(
	collector *devices.SNMPCollector,
	target collectorSNMPClient,
	metrics *devices.SNMPMetrics,
	registry *snmpmib.Registry,
	vendor string,
	sysObjectID string,
	sysDescr string,
	catalog *entityCatalogOpaque,
	diag *devices.SNMPCollectionDiagnostics,
)

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
	currentOID := "1.3.6.1.4.1.2011.5.25.31.1.1.3.1.7"
	rxPowerOID := "1.3.6.1.4.1.2011.5.25.31.1.1.3.1.8"
	voltageOID := "1.3.6.1.4.1.2011.5.25.31.1.1.3.1.6"

	client := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			currentOID: {
				{Name: currentOID + ".7", Type: gosnmp.Integer, Value: 42},
				{Name: currentOID + ".8", Type: gosnmp.Integer, Value: -1}, // 电口或不支持 DDM 的 -1 哨兵值
			},
			rxPowerOID: {
				{Name: rxPowerOID + ".7", Type: gosnmp.Integer, Value: 500},
				{Name: rxPowerOID + ".8", Type: gosnmp.Integer, Value: -1},
			},
			voltageOID: {
				{Name: voltageOID + ".7", Type: gosnmp.Integer, Value: 3300},
				{Name: voltageOID + ".8", Type: gosnmp.Integer, Value: -1},
			},
		},
	}

	items := collectOpticalTransceiversFromCatalog(client, []snmpmib.CatalogOID{
		{
			ID:          "hw_entity_optical_current",
			Name:        "hwEntityOpticalBiasCurrent",
			OID:         currentOID,
			Method:      "bulkwalk",
			ValueType:   "integer",
			Unit:        "uA",
			Description: "光模块偏置电流",
		},
		{
			ID:          "hw_entity_optical_rx_power",
			Name:        "hwEntityOpticalRxPower",
			OID:         rxPowerOID,
			Method:      "bulkwalk",
			ValueType:   "integer",
			Unit:        "uW",
			Description: "光模块接收光功率",
		},
		{
			ID:          "hw_entity_optical_voltage",
			Name:        "hwEntityOpticalVoltage",
			OID:         voltageOID,
			Method:      "bulkwalk",
			ValueType:   "integer",
			Unit:        "mV",
			Description: "光模块供电电压",
		},
	})

	if len(items) != 1 {
		t.Fatalf("len(items)=%d, want 1（全为 -1 哨兵值的电口索引 8 必须被过滤）", len(items))
	}
	if items[0].Index != "7" {
		t.Fatalf("optical index=%q, want \"7\"", items[0].Index)
	}
	if items[0].BiasCurrent == nil || *items[0].BiasCurrent != 42 {
		t.Fatalf("optical bias_current=%v, want 42", items[0].BiasCurrent)
	}
	if items[0].BiasCurrentUnit != "uA" {
		t.Fatalf("optical bias_current_unit=%q, want \"uA\"", items[0].BiasCurrentUnit)
	}
	if items[0].RxPower == nil || *items[0].RxPower != 500 {
		t.Fatalf("optical rx_power=%v, want 500", items[0].RxPower)
	}
	if items[0].RxPowerUnit != "uW" {
		t.Fatalf("optical rx_power_unit=%q, want \"uW\"", items[0].RxPowerUnit)
	}
	if items[0].Voltage == nil || *items[0].Voltage != 3300 {
		t.Fatalf("optical voltage=%v, want 3300", items[0].Voltage)
	}
	if items[0].VoltageUnit != "mV" {
		t.Fatalf("optical voltage_unit=%q, want \"mV\"", items[0].VoltageUnit)
	}
}

func TestCollectCPUFromCandidates_AllZeroFirstCandidateFallsBackToSecond(t *testing.T) {
	firstOID := "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.5"
	secondOID := "1.3.6.1.4.1.2011.6.3.4.1.2"

	client := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			firstOID: {
				{Name: firstOID + ".1", Type: gosnmp.Integer, Value: 0},
				{Name: firstOID + ".2", Type: gosnmp.Integer, Value: 0},
				{Name: firstOID + ".3", Type: gosnmp.Integer, Value: 0},
			},
			secondOID: {
				{Name: secondOID + ".1", Type: gosnmp.Integer, Value: 0},
				{Name: secondOID + ".2", Type: gosnmp.Integer, Value: 255},
				{Name: secondOID + ".3", Type: gosnmp.Integer, Value: -1},
				{Name: secondOID + ".4", Type: gosnmp.Integer, Value: 18},
			},
		},
	}

	candidates := []snmpmib.MetricCandidate{
		{
			ID:        "huawei_entity_cpu",
			Method:    "bulkwalk",
			OIDs:      []string{firstOID},
			Strategy:  "walk_percent_auto",
			Aggregate: "avg_non_zero",
		},
		{
			ID:        "huawei_cpu_dev",
			Method:    "bulkwalk",
			OIDs:      []string{secondOID},
			Strategy:  "walk_percent",
			Aggregate: "avg_non_zero",
		},
	}

	value := collectCPUFromCandidates(client, candidates, nil)
	if value == nil {
		t.Fatal("cpu usage = nil, want 18.0")
	}
	if *value != 18.0 {
		t.Fatalf("cpu usage = %v, want 18.0", *value)
	}

	// 所有候选仅返回有效 0（真实 0% 空载设备）时必须返回 0.0 而非 nil
	idleClient := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			firstOID: {
				{Name: firstOID + ".1", Type: gosnmp.Integer, Value: 0},
			},
			secondOID: {
				{Name: secondOID + ".1", Type: gosnmp.Integer, Value: 0},
			},
		},
	}
	idleValue := collectCPUFromCandidates(idleClient, candidates, nil)
	if idleValue == nil {
		t.Fatal("idle cpu usage = nil, want 0.0")
	}
	if *idleValue != 0.0 {
		t.Fatalf("idle cpu usage = %v, want 0.0", *idleValue)
	}
}

func TestCollectMemoryFromCandidates_S5736_EntityMemoryMegaAndIndexAligned(t *testing.T) {
	usageOID := "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.7"
	megaOID := "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.19"

	client := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			usageOID: {
				{Name: usageOID + ".1", Type: gosnmp.Integer, Value: 0},
				{Name: usageOID + ".67108873", Type: gosnmp.Integer, Value: 42},
				{Name: usageOID + ".67108874", Type: gosnmp.Integer, Value: 255},
			},
			megaOID: {
				{Name: megaOID + ".1", Type: gosnmp.Integer, Value: 0},
				{Name: megaOID + ".67108873", Type: gosnmp.Integer, Value: 2048},
			},
		},
	}

	usage, total, used := collectMemoryFromCandidates(client, []snmpmib.MetricCandidate{
		{
			ID:        "huawei_entity_memory_mega",
			Method:    "bulkwalk",
			OIDs:      []string{usageOID, megaOID},
			Strategy:  "walk_percent_with_optional_size_mb",
			Aggregate: "avg_non_zero_total_sum",
		},
	}, nil)

	wantTotal := int64(2048) * 1024 * 1024
	wantUsed := int64(float64(wantTotal) * 0.42)
	if usage == nil || total == nil || used == nil {
		t.Fatalf("memory result = (%v, %v, %v), want all non-nil", usage, total, used)
	}
	if *usage != 42.0 {
		t.Fatalf("usage = %v, want 42.0", *usage)
	}
	if *total != wantTotal {
		t.Fatalf("total = %d, want %d", *total, wantTotal)
	}
	if *used != wantUsed {
		t.Fatalf("used = %d, want %d", *used, wantUsed)
	}
}

func TestCollectMemoryFromCandidates_S5736_UsageOnlyWhenSizeMissingOrOverflow(t *testing.T) {
	usageOID := "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.7"
	megaOID := "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.19"
	bytesOID := "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.9"

	client := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			usageOID: {
				{Name: usageOID + ".67108873", Type: gosnmp.Integer, Value: 37},
			},
			bytesOID: {
				{Name: bytesOID + ".67108873", Type: gosnmp.Integer, Value: -1},
			},
		},
	}

	usage, total, used := collectMemoryFromCandidates(client, []snmpmib.MetricCandidate{
		{
			ID:        "huawei_entity_memory_mega",
			Method:    "bulkwalk",
			OIDs:      []string{usageOID, megaOID},
			Strategy:  "walk_percent_with_optional_size_mb",
			Aggregate: "avg_non_zero_total_sum",
		},
		{
			ID:        "huawei_entity_memory_bytes",
			Method:    "bulkwalk",
			OIDs:      []string{usageOID, bytesOID},
			Strategy:  "walk_percent_with_optional_size_bytes",
			Aggregate: "avg_non_zero_total_sum",
		},
		{
			ID:        "huawei_mem_dev",
			Method:    "bulkwalk",
			OIDs:      []string{"1.3.6.1.4.1.2011.6.3.5.1.1.2", "1.3.6.1.4.1.2011.6.3.5.1.1.3"},
			Strategy:  "walk_mem_size_free_bytes",
			Aggregate: "",
		},
		{
			ID:        "huawei_entity_memory_usage_only",
			Method:    "bulkwalk",
			OIDs:      []string{usageOID},
			Strategy:  "walk_percent_auto",
			Aggregate: "avg_non_zero",
		},
	}, nil)

	if usage == nil {
		t.Fatal("usage = nil, want 37.0")
	}
	if *usage != 37.0 {
		t.Fatalf("usage = %v, want 37.0", *usage)
	}
	if total != nil || used != nil {
		t.Fatalf("total/used = (%v, %v), want (nil, nil)", total, used)
	}
}

func TestCollectMemoryFromCandidates_S5736_FallbackFromMegaToBytesForSize(t *testing.T) {
	usageOID := "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.7"
	megaOID := "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.19"
	bytesOID := "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.9"

	client := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			usageOID: {
				{Name: usageOID + ".9", Type: gosnmp.Integer, Value: 50},
			},
			bytesOID: {
				{Name: bytesOID + ".9", Type: gosnmp.Integer, Value: 1073741824},
			},
		},
	}

	usage, total, used := collectMemoryFromCandidates(client, []snmpmib.MetricCandidate{
		{
			ID:        "huawei_entity_memory_mega",
			Method:    "bulkwalk",
			OIDs:      []string{usageOID, megaOID},
			Strategy:  "walk_percent_with_optional_size_mb",
			Aggregate: "avg_non_zero_total_sum",
		},
		{
			ID:        "huawei_entity_memory_bytes",
			Method:    "bulkwalk",
			OIDs:      []string{usageOID, bytesOID},
			Strategy:  "walk_percent_with_optional_size_bytes",
			Aggregate: "avg_non_zero_total_sum",
		},
	}, nil)

	if usage == nil || total == nil || used == nil {
		t.Fatalf("memory result = (%v, %v, %v), want all non-nil", usage, total, used)
	}
	if *usage != 50.0 {
		t.Fatalf("usage = %v, want 50.0", *usage)
	}
	if *total != 1073741824 {
		t.Fatalf("total = %d, want 1073741824", *total)
	}
	if *used != 536870912 {
		t.Fatalf("used = %d, want 536870912", *used)
	}
}

func TestCollectCPUFromCandidates_WalkPercentAutoFiltersHuaweiSentinel255(t *testing.T) {
	oid := "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.5"
	client := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			oid: {
				{Name: oid + ".1", Type: gosnmp.Integer, Value: 0},
				{Name: oid + ".2", Type: gosnmp.Integer, Value: 255},
				{Name: oid + ".3", Type: gosnmp.Integer, Value: -1},
				{Name: oid + ".4", Type: gosnmp.Integer, Value: 18},
			},
		},
	}

	value := collectCPUFromCandidates(client, []snmpmib.MetricCandidate{
		{
			ID:        "huawei_entity_cpu",
			Method:    "bulkwalk",
			OIDs:      []string{oid},
			Strategy:  "walk_percent_auto",
			Aggregate: "avg_non_zero",
		},
	}, nil)

	if value == nil || *value != 18.0 {
		t.Fatalf("cpu usage = %v, want 18.0 (255 sentinel must be filtered)", value)
	}
}

func TestCollectMemoryFromCandidates_S5736_OverflowSizeAndUnalignedFallback(t *testing.T) {
	usageOID := "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.7"
	megaOID := "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.19"

	// 1. 超过 math.MaxInt64/(1024*1024) 的非法溢出容量必须被跳过，仅保留使用率
	overflowClient := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			usageOID: {
				{Name: usageOID + ".67108873", Type: gosnmp.Integer, Value: 35},
			},
			megaOID: {
				{Name: megaOID + ".67108873", Type: gosnmp.Counter64, Value: uint64(math.MaxInt64/(1024*1024) + 1)},
			},
		},
	}
	usage, total, used := collectMemoryFromCandidates(overflowClient, []snmpmib.MetricCandidate{
		{
			ID:        "huawei_entity_memory_mega",
			Method:    "bulkwalk",
			OIDs:      []string{usageOID, megaOID},
			Strategy:  "walk_percent_with_optional_size_mb",
			Aggregate: "avg_non_zero_total_sum",
		},
	}, nil)
	if usage == nil || *usage != 35.0 || total != nil || used != nil {
		t.Fatalf("overflow result = (%v, %v, %v), want (35.0, nil, nil)", usage, total, used)
	}

	// 2. 容量表索引无法对齐但存在正容量时，安全回退正容量之和
	unalignedClient := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			usageOID: {
				{Name: usageOID + ".67108873", Type: gosnmp.Integer, Value: 25},
			},
			megaOID: {
				{Name: megaOID + ".1", Type: gosnmp.Integer, Value: 1024},
			},
		},
	}
	usage2, total2, used2 := collectMemoryFromCandidates(unalignedClient, []snmpmib.MetricCandidate{
		{
			ID:        "huawei_entity_memory_mega",
			Method:    "bulkwalk",
			OIDs:      []string{usageOID, megaOID},
			Strategy:  "walk_percent_with_optional_size_mb",
			Aggregate: "avg_non_zero_total_sum",
		},
	}, nil)
	wantTotal := int64(1024) * 1024 * 1024
	if usage2 == nil || *usage2 != 25.0 || total2 == nil || *total2 != wantTotal || used2 == nil {
		t.Fatalf("unaligned result = (%v, %v, %v), want (25.0, %d, non-nil)", usage2, total2, used2, wantTotal)
	}
}

func TestNewSNMPClient_SetsMaxRepetitions(t *testing.T) {
	community := "public"
	version := "2c"
	client, err := devices.NewSNMPClient("192.168.1.1", &community, &version, nil, nil)
	if err != nil {
		t.Fatalf("NewSNMPClient error: %v", err)
	}
	if client.MaxRepetitions != 10 {
		t.Fatalf("MaxRepetitions = %d, want 10", client.MaxRepetitions)
	}
}

func TestCollectMemoryFromCandidates_AllZeroFirstCandidateFallsBackToHuaweiMemDev(t *testing.T) {
	usageOID := "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.7"
	megaOID := "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.19"
	memSizeOID := "1.3.6.1.4.1.2011.6.3.5.1.1.2"
	memFreeOID := "1.3.6.1.4.1.2011.6.3.5.1.1.3"

	const totalBytes = int64(1024 * 1024 * 1024) // 1 GiB
	const freeBytes = int64(400 * 1024 * 1024)   // 400 MiB
	const wantUsed = totalBytes - freeBytes
	wantUsage := float64(wantUsed) / float64(totalBytes) * 100.0

	candidates := []snmpmib.MetricCandidate{
		{
			ID:        "huawei_entity_memory_mega",
			Method:    "bulkwalk",
			OIDs:      []string{usageOID, megaOID},
			Strategy:  "walk_percent_with_optional_size_mb",
			Aggregate: "avg_non_zero_total_sum",
		},
		{
			ID:       "huawei_mem_dev",
			Method:   "bulkwalk",
			OIDs:     []string{memSizeOID, memFreeOID},
			Strategy: "walk_mem_size_free_bytes",
		},
	}

	for _, withMegaSize := range []bool{false, true} {
		name := "without_size_19"
		packets := map[string][]gosnmp.SnmpPDU{
			usageOID: {
				{Name: usageOID + ".1", Type: gosnmp.Integer, Value: 0},
				{Name: usageOID + ".2", Type: gosnmp.Integer, Value: 0},
			},
			memSizeOID: {
				{Name: memSizeOID + ".1", Type: gosnmp.Gauge32, Value: uint64(totalBytes)},
			},
			memFreeOID: {
				{Name: memFreeOID + ".1", Type: gosnmp.Gauge32, Value: uint64(freeBytes)},
			},
		}
		if withMegaSize {
			name = "with_size_19"
			packets[megaOID] = []gosnmp.SnmpPDU{
				{Name: megaOID + ".1", Type: gosnmp.Integer, Value: 1024},
			}
		}

		t.Run(name, func(t *testing.T) {
			client := &fakeCollectorSNMPClient{bulkWalkPackets: packets}
			usage, total, used := collectMemoryFromCandidates(client, candidates, nil)
			if usage == nil || total == nil || used == nil {
				t.Fatalf("memory result = (%v, %v, %v), want all non-nil", usage, total, used)
			}
			if math.Abs(*usage-wantUsage) > 1e-6 {
				t.Fatalf("usage = %v, want %v", *usage, wantUsage)
			}
			if *total != totalBytes {
				t.Fatalf("total = %d, want %d", *total, totalBytes)
			}
			if *used != wantUsed {
				t.Fatalf("used = %d, want %d", *used, wantUsed)
			}
		})
	}
}

func TestCollectMemoryFromCandidates_MaxInt64TotalAt100PercentDoesNotOverflow(t *testing.T) {
	usageOID := "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.7"
	bytesOID := "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.9"

	client := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			usageOID: {
				{Name: usageOID + ".1", Type: gosnmp.Integer, Value: 100},
			},
			bytesOID: {
				{Name: bytesOID + ".1", Type: gosnmp.Counter64, Value: uint64(math.MaxInt64)},
			},
		},
	}

	usage, total, used := collectMemoryFromCandidates(client, []snmpmib.MetricCandidate{
		{
			ID:        "huawei_entity_memory_bytes",
			Method:    "bulkwalk",
			OIDs:      []string{usageOID, bytesOID},
			Strategy:  "walk_percent_with_optional_size_bytes",
			Aggregate: "avg_non_zero_total_sum",
		},
	}, nil)

	if usage == nil || total == nil || used == nil {
		t.Fatalf("memory result = (%v, %v, %v), want all non-nil", usage, total, used)
	}
	if *usage != 100.0 {
		t.Fatalf("usage = %v, want 100.0", *usage)
	}
	if *total != math.MaxInt64 {
		t.Fatalf("total = %d, want %d", *total, int64(math.MaxInt64))
	}
	if *used != math.MaxInt64 {
		t.Fatalf("used = %d, want %d (must not overflow)", *used, int64(math.MaxInt64))
	}
}

func TestShouldFallbackToWalkAll_DistinguishesTimeoutAuthAndProtocolErrors(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "context_deadline_exceeded",
			err:  context.DeadlineExceeded,
			want: false,
		},
		{
			name: "io_timeout",
			err:  errors.New("read udp 192.168.1.1:161: i/o timeout"),
			want: false,
		},
		{
			name: "usm_authentication_failed",
			err:  errors.New("usm authentication failed"),
			want: false,
		},
		{
			name: "snmp_tooBig",
			err:  errors.New("tooBig"),
			want: true,
		},
		{
			name: "snmp_genErr",
			err:  errors.New("genErr"),
			want: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := shouldFallbackToWalkAll(tc.err); got != tc.want {
				t.Fatalf("shouldFallbackToWalkAll(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}

func TestCollectTemperatureFromCandidates_FiltersHuaweiSentinels(t *testing.T) {
	tempOID := "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.11"
	client := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			tempOID: {
				{Name: tempOID + ".1", Type: gosnmp.Integer, Value: 0},
				{Name: tempOID + ".2", Type: gosnmp.Integer, Value: 255},
				{Name: tempOID + ".3", Type: gosnmp.Integer, Value: 65535},
				{Name: tempOID + ".4", Type: gosnmp.Integer, Value: 46},
			},
		},
	}

	got := collectTemperatureFromCandidates(client, []snmpmib.MetricCandidate{
		{ID: "huawei_entity_temperature", Method: "bulkwalk", OIDs: []string{tempOID}, Strategy: "walk_max_celsius"},
	})
	if got == nil || *got != 46 {
		t.Fatalf("temperature = %v, want 46 (sentinels 0/255/65535 must be filtered)", got)
	}
}

func TestCollectMemoryFromCandidates_S5736_NoMegaOnlyBytesWithZeroPlaceholder(t *testing.T) {
	usageOID := "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.7"
	megaOID := "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.19"
	bytesOID := "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.9"

	client := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			usageOID: {
				{Name: usageOID + ".1", Type: gosnmp.Integer, Value: 0},
				{Name: usageOID + ".2", Type: gosnmp.Integer, Value: 50},
			},
			bytesOID: {
				{Name: bytesOID + ".1", Type: gosnmp.Counter64, Value: uint64(0)},
				{Name: bytesOID + ".2", Type: gosnmp.Counter64, Value: uint64(4 << 30)},
			},
		},
	}

	usage, total, used := collectMemoryFromCandidates(client, []snmpmib.MetricCandidate{
		{ID: "huawei_entity_memory_mega", Method: "bulkwalk", OIDs: []string{usageOID, megaOID}, Strategy: "walk_percent_with_optional_size_mb", Aggregate: "avg_non_zero_total_sum"},
		{ID: "huawei_entity_memory_bytes", Method: "bulkwalk", OIDs: []string{usageOID, bytesOID}, Strategy: "walk_percent_with_optional_size_bytes", Aggregate: "avg_non_zero_total_sum"},
	}, nil)
	if usage == nil || total == nil || used == nil {
		t.Fatalf("memory = (%v, %v, %v), want all non-nil", usage, total, used)
	}
	if *usage != 50.0 || *total != int64(4<<30) || *used != int64(2<<30) {
		t.Fatalf("memory = (usage=%v, total=%d, used=%d), want (50, %d, %d)", *usage, *total, *used, int64(4<<30), int64(2<<30))
	}
}

func TestCollectOpticalTransceiversFromCatalog_ExtractsAndSanitizesVendorSN(t *testing.T) {
	rxPowerOID := "1.3.6.1.4.1.2011.5.25.31.1.1.3.1.8"
	vendorSNOID := "1.3.6.1.4.1.2011.5.25.31.1.1.3.1.4"

	client := &fakeCollectorSNMPClient{
		bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
			rxPowerOID: {
				{Name: rxPowerOID + ".10", Type: gosnmp.Integer, Value: 450},
				{Name: rxPowerOID + ".11", Type: gosnmp.Integer, Value: 460},
			},
			vendorSNOID: {
				{Name: vendorSNOID + ".10", Type: gosnmp.OctetString, Value: []byte("2102312ABC\x00")},
				{Name: vendorSNOID + ".11", Type: gosnmp.OctetString, Value: []byte("BAD\x07SN")},
			},
		},
	}

	items := collectOpticalTransceiversFromCatalog(client, []snmpmib.CatalogOID{
		{ID: "hw_entity_optical_rx_power", Name: "hwEntityOpticalRxPower", OID: rxPowerOID, Method: "bulkwalk", ValueType: "integer", Unit: "uW", Description: "rx"},
		{ID: "huawei_optical_vendor_sn", Name: "hwEntityOpticalVendorSn", OID: vendorSNOID, Method: "bulkwalk", ValueType: "string", Description: "sn"},
	})
	if len(items) != 2 {
		t.Fatalf("len(items) = %d, want 2: %+v", len(items), items)
	}
	if items[0].VendorSN != "2102312ABC" {
		t.Fatalf("items[0].VendorSN = %q, want 2102312ABC", items[0].VendorSN)
	}
	if items[1].VendorSN != "" {
		t.Fatalf("items[1].VendorSN = %q, want empty when dirty control chars present", items[1].VendorSN)
	}
}

func TestCollectComponentsWithDeviceContext_S5736RealFixture(t *testing.T) {
	registry, err := snmpmib.DefaultRegistry()
	if err != nil {
		t.Fatalf("DefaultRegistry() error = %v", err)
	}
	collector := devices.NewSNMPCollectorWithRegistry(zap.NewNop(), registry)

	operOID := "1.3.6.1.4.1.56813.5.25.31.1.1.1.1.2"
	fanOID := "1.3.6.1.4.1.56813.5.25.31.1.1.10.1.7"
	powerOID := "1.3.6.1.4.1.56813.5.25.31.1.1.18.1.6"
	nameOID := registry.Common.System.EntPhysicalName.OID
	classOID := registry.Common.System.EntPhysicalClass.OID
	sysObjID := ".1.3.6.1.4.1.56813.2.23.811"
	sysDescr := "FutureMatrix S5736-S24T4XC\r\nVersatile Routing Platform Software\r\nVRP (R) software, Version 5.170 (FutureMatrix S5736-S24T4XC V200R025C00)"

	basePackets := func() map[string][]gosnmp.SnmpPDU {
		return map[string][]gosnmp.SnmpPDU{
			operOID: {
				walkPDU(operOID, 67108867, 3, gosnmp.Integer),
				walkPDU(operOID, 67108873, 3, gosnmp.Integer),
				walkPDU(operOID, 67190797, 3, gosnmp.Integer),
				walkPDU(operOID, 67207181, 3, gosnmp.Integer),
				walkPDU(operOID, 67223565, 3, gosnmp.Integer),
				walkPDU(operOID, 67239949, 3, gosnmp.Integer),
			},
			classOID: {
				walkPDU(classOID, 67108867, 3, gosnmp.Integer),
				walkPDU(classOID, 67108873, 9, gosnmp.Integer),
				walkPDU(classOID, 67190797, 9, gosnmp.Integer),
				walkPDU(classOID, 67207181, 9, gosnmp.Integer),
				walkPDU(classOID, 67223565, 9, gosnmp.Integer),
				walkPDU(classOID, 67239949, 9, gosnmp.Integer),
			},
			nameOID: {
				walkPDU(nameOID, 67108867, []byte("FutureMatrix S5736 Routing Switch"), gosnmp.OctetString),
				walkPDU(nameOID, 67108873, []byte("MPU Board 0"), gosnmp.OctetString),
				walkPDU(nameOID, 67190797, []byte("POWER Card 0/PWR1"), gosnmp.OctetString),
				walkPDU(nameOID, 67207181, []byte("POWER Card 0/PWR2"), gosnmp.OctetString),
				walkPDU(nameOID, 67223565, []byte("FAN Card 0/FAN1"), gosnmp.OctetString),
				walkPDU(nameOID, 67239949, []byte("FAN Card 0/FAN2"), gosnmp.OctetString),
			},
		}
	}

	t.Run("专表为空时自动归位 2 fan + 2 power + 2 board", func(t *testing.T) {
		client := &fakeCollectorSNMPClient{bulkWalkPackets: basePackets()}
		metrics := &devices.SNMPMetrics{}
		collectComponentsWithDeviceContext(
			collector,
			client,
			metrics,
			registry,
			"futurematrix",
			sysObjID,
			sysDescr,
			newEntityCatalog(client, registry),
			nil,
		)
		counts := map[string]int{}
		for _, c := range metrics.Components {
			counts[c.Kind]++
			if c.Kind == "board" && (c.Name != "FutureMatrix S5736 Routing Switch" && c.Name != "MPU Board 0") {
				t.Fatalf("unexpected board component: %+v", c)
			}
		}
		if counts["fan"] != 2 || counts["power"] != 2 || counts["board"] != 2 {
			t.Fatalf("counts = %+v, want fan=2 power=2 board=2; components=%+v", counts, metrics.Components)
		}
	})

	t.Run("专表非空时不重复残留 POWER Card 或 FAN Card 到 board", func(t *testing.T) {
		packets := basePackets()
		packets[fanOID] = []gosnmp.SnmpPDU{
			walkPDU(fanOID, 1, 1, gosnmp.Integer),
			walkPDU(fanOID, 2, 1, gosnmp.Integer),
		}
		packets[powerOID] = []gosnmp.SnmpPDU{
			walkPDU(powerOID, 1, 1, gosnmp.Integer),
			walkPDU(powerOID, 2, 1, gosnmp.Integer),
		}
		client := &fakeCollectorSNMPClient{bulkWalkPackets: packets}
		metrics := &devices.SNMPMetrics{}
		collectComponentsWithDeviceContext(
			collector,
			client,
			metrics,
			registry,
			"futurematrix",
			sysObjID,
			sysDescr,
			newEntityCatalog(client, registry),
			nil,
		)
		counts := map[string]int{}
		for _, c := range metrics.Components {
			counts[c.Kind]++
			if c.Kind == "board" && (c.Name != "FutureMatrix S5736 Routing Switch" && c.Name != "MPU Board 0") {
				t.Fatalf("unexpected board subcomponent leaked: %+v", c)
			}
		}
		if counts["fan"] != 2 || counts["power"] != 2 || counts["board"] != 2 {
			t.Fatalf("counts = %+v, want fan=2 power=2 board=2; components=%+v", counts, metrics.Components)
		}
	})
}
