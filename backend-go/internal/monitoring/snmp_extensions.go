package monitoring

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
)

// SNMPExtensionsResponse 表示设备最近一次 SNMP 扩展摘要。
type SNMPExtensionsResponse struct {
	DeviceID            int                                 `json:"device_id"`
	Timestamp           *time.Time                          `json:"timestamp,omitempty"`
	BGPPeers            []devices.BGPNeighborMetrics        `json:"bgp_peers"`
	OpticalTransceivers []devices.OpticalTransceiverMetrics `json:"optical_transceivers"`
	Components          []devices.ComponentStatusMetrics    `json:"components"`
	PoE                 *devices.PoEMetrics                 `json:"poe,omitempty"`
	STP                 *devices.STPMetrics                 `json:"stp,omitempty"`
	Disks               []devices.DiskMetrics               `json:"disks"`
	Diagnostics         *devices.SNMPCollectionDiagnostics  `json:"diagnostics,omitempty"`
}

// SNMPExtensionsSnapshot 为 SNMPExtensionsResponse 的语义别名，供扩展监控消费方统一引用。
type SNMPExtensionsSnapshot = SNMPExtensionsResponse

type snmpExtensionsTagEnvelope struct {
	SNMPExtensions snmpExtensionsPayload `json:"snmp_extensions"`
}

type snmpExtensionsPayload struct {
	BGPPeers            []devices.BGPNeighborMetrics        `json:"bgp_peers"`
	OpticalTransceivers []devices.OpticalTransceiverMetrics `json:"optical_transceivers"`
	Components          []devices.ComponentStatusMetrics    `json:"components"`
	PoE                 *devices.PoEMetrics                 `json:"poe,omitempty"`
	STP                 *devices.STPMetrics                 `json:"stp,omitempty"`
	Disks               []devices.DiskMetrics               `json:"disks"`
	Diagnostics         *devices.SNMPCollectionDiagnostics  `json:"diagnostics,omitempty"`
}

type latestSNMPExtensionsRow struct {
	CollectedAt time.Time       `gorm:"column:collected_at"`
	Tags        json.RawMessage `gorm:"column:tags"`
}

func newSNMPExtensionsResponse(deviceID int) SNMPExtensionsResponse {
	return SNMPExtensionsResponse{
		DeviceID:            deviceID,
		BGPPeers:            []devices.BGPNeighborMetrics{},
		OpticalTransceivers: []devices.OpticalTransceiverMetrics{},
		Components:          []devices.ComponentStatusMetrics{},
		Disks:               []devices.DiskMetrics{},
	}
}

// GetLatestSNMPExtensions 返回设备最近一条带 SNMP 扩展摘要的监控记录。
func (w *MetricsWriter) GetLatestSNMPExtensions(ctx context.Context, deviceID int) (SNMPExtensionsResponse, error) {
	resp := newSNMPExtensionsResponse(deviceID)

	if w.db == nil {
		return resp, fmt.Errorf("database not initialized")
	}
	if deviceID <= 0 {
		return resp, fmt.Errorf("invalid device_id")
	}

	var row latestSNMPExtensionsRow
	result := w.db.WithContext(ctx).Raw(`
		SELECT collected_at, tags
		FROM device_metrics
		WHERE device_id = ?
		  AND tags IS NOT NULL
		  AND tags->'snmp_extensions' IS NOT NULL
		ORDER BY collected_at DESC
		LIMIT 1
	`, deviceID).Scan(&row)
	if result.Error != nil {
		return resp, result.Error
	}
	if result.RowsAffected == 0 || len(row.Tags) == 0 {
		return resp, nil
	}

	var envelope snmpExtensionsTagEnvelope
	if err := json.Unmarshal(row.Tags, &envelope); err != nil {
		return resp, fmt.Errorf("failed to parse snmp extensions tags: %w", err)
	}

	collectedAt := row.CollectedAt.UTC()
	resp.Timestamp = &collectedAt
	if envelope.SNMPExtensions.BGPPeers != nil {
		resp.BGPPeers = envelope.SNMPExtensions.BGPPeers
	}
	if envelope.SNMPExtensions.OpticalTransceivers != nil {
		resp.OpticalTransceivers = envelope.SNMPExtensions.OpticalTransceivers
	}
	if envelope.SNMPExtensions.Components != nil {
		resp.Components = envelope.SNMPExtensions.Components
	}
	if envelope.SNMPExtensions.PoE != nil {
		resp.PoE = envelope.SNMPExtensions.PoE
	}
	if envelope.SNMPExtensions.STP != nil {
		resp.STP = envelope.SNMPExtensions.STP
	}
	if envelope.SNMPExtensions.Disks != nil {
		resp.Disks = envelope.SNMPExtensions.Disks
	}
	if envelope.SNMPExtensions.Diagnostics != nil {
		resp.Diagnostics = envelope.SNMPExtensions.Diagnostics
	}

	return resp, nil
}
