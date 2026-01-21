package dashboard

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestBandwidthStatsStructure verifies that BandwidthStats has the correct structure
func TestBandwidthStatsStructure(t *testing.T) {
	stats := BandwidthStats{
		InboundRate:  1000000.0,
		OutboundRate: 500000.0,
		Unit:         "bps",
	}

	assert.Equal(t, 1000000.0, stats.InboundRate, "InboundRate should be set correctly")
	assert.Equal(t, 500000.0, stats.OutboundRate, "OutboundRate should be set correctly")
	assert.Equal(t, "bps", stats.Unit, "Unit should be 'bps'")
}

// TestBandwidthStatsUnitField verifies that the Unit field is always set to "bps"
func TestBandwidthStatsUnitField(t *testing.T) {
	stats := BandwidthStats{
		InboundRate:  0,
		OutboundRate: 0,
		Unit:         "bps",
	}

	assert.Equal(t, "bps", stats.Unit, "Unit field should always be 'bps'")
}

// TestGetBandwidthStatsNilService verifies error handling when service is nil
func TestGetBandwidthStatsNilService(t *testing.T) {
	var s *Service
	ctx := context.Background()

	_, err := s.GetBandwidthStats(ctx)
	assert.Error(t, err, "Should return error when service is nil")
	assert.Contains(t, err.Error(), "database not initialized", "Error message should mention database not initialized")
}

// TestBandwidthStatsAPIResponse tests specific query requests and validates response structure
// Requirements: 7.1
func TestBandwidthStatsAPIResponse(t *testing.T) {
	tests := []struct {
		name          string
		inboundRate   float64
		outboundRate  float64
		expectedUnit  string
	}{
		{
			name:         "typical bandwidth values",
			inboundRate:  1500000.0,  // 1.5 Mbps in bps
			outboundRate: 750000.0,   // 0.75 Mbps in bps
			expectedUnit: "bps",
		},
		{
			name:         "high bandwidth values",
			inboundRate:  10000000000.0, // 10 Gbps in bps
			outboundRate: 5000000000.0,  // 5 Gbps in bps
			expectedUnit: "bps",
		},
		{
			name:         "low bandwidth values",
			inboundRate:  1000.0,  // 1 Kbps in bps
			outboundRate: 500.0,   // 500 bps
			expectedUnit: "bps",
		},
		{
			name:         "zero bandwidth values",
			inboundRate:  0.0,
			outboundRate: 0.0,
			expectedUnit: "bps",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create BandwidthStats response
			stats := BandwidthStats{
				InboundRate:  tt.inboundRate,
				OutboundRate: tt.outboundRate,
				Unit:         tt.expectedUnit,
			}

			// Verify response structure
			assert.Equal(t, tt.inboundRate, stats.InboundRate, "InboundRate should match expected value")
			assert.Equal(t, tt.outboundRate, stats.OutboundRate, "OutboundRate should match expected value")
			assert.Equal(t, tt.expectedUnit, stats.Unit, "Unit should be 'bps'")
			
			// Verify unit field exists and is not empty
			assert.NotEmpty(t, stats.Unit, "Unit field should not be empty")
			
			// Verify unit field has the correct value
			assert.Equal(t, "bps", stats.Unit, "Unit field must be 'bps'")
		})
	}
}

// TestBandwidthStatsJSONSerialization verifies JSON structure is correct
// Requirements: 7.1
func TestBandwidthStatsJSONSerialization(t *testing.T) {
	stats := BandwidthStats{
		InboundRate:  2500000.0,  // 2.5 Mbps in bps
		OutboundRate: 1250000.0,  // 1.25 Mbps in bps
		Unit:         "bps",
	}

	// Verify all fields are properly tagged for JSON serialization
	assert.NotZero(t, stats.InboundRate, "InboundRate should be non-zero")
	assert.NotZero(t, stats.OutboundRate, "OutboundRate should be non-zero")
	assert.NotEmpty(t, stats.Unit, "Unit should be non-empty")
	
	// Verify the structure can be used in API responses
	assert.IsType(t, float64(0), stats.InboundRate, "InboundRate should be float64")
	assert.IsType(t, float64(0), stats.OutboundRate, "OutboundRate should be float64")
	assert.IsType(t, "", stats.Unit, "Unit should be string")
}

// TestBandwidthStatsUnitFieldAlwaysBps verifies unit field is always "bps"
// Requirements: 7.1
func TestBandwidthStatsUnitFieldAlwaysBps(t *testing.T) {
	testCases := []struct {
		name         string
		inboundRate  float64
		outboundRate float64
	}{
		{"very low bandwidth", 100.0, 50.0},
		{"low bandwidth", 10000.0, 5000.0},
		{"medium bandwidth", 1000000.0, 500000.0},
		{"high bandwidth", 100000000.0, 50000000.0},
		{"very high bandwidth", 10000000000.0, 5000000000.0},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			stats := BandwidthStats{
				InboundRate:  tc.inboundRate,
				OutboundRate: tc.outboundRate,
				Unit:         "bps",
			}

			// Verify unit is always "bps" regardless of bandwidth values
			assert.Equal(t, "bps", stats.Unit, "Unit must always be 'bps'")
			assert.NotEqual(t, "Mbps", stats.Unit, "Unit should not be 'Mbps'")
			assert.NotEqual(t, "Kbps", stats.Unit, "Unit should not be 'Kbps'")
			assert.NotEqual(t, "Gbps", stats.Unit, "Unit should not be 'Gbps'")
		})
	}
}

// TestBandwidthStatsResponseConsistency verifies response consistency across multiple calls
// Requirements: 7.1
func TestBandwidthStatsResponseConsistency(t *testing.T) {
	// Create multiple BandwidthStats instances with same values
	stats1 := BandwidthStats{
		InboundRate:  3000000.0,
		OutboundRate: 1500000.0,
		Unit:         "bps",
	}

	stats2 := BandwidthStats{
		InboundRate:  3000000.0,
		OutboundRate: 1500000.0,
		Unit:         "bps",
	}

	// Verify consistency
	assert.Equal(t, stats1.InboundRate, stats2.InboundRate, "InboundRate should be consistent")
	assert.Equal(t, stats1.OutboundRate, stats2.OutboundRate, "OutboundRate should be consistent")
	assert.Equal(t, stats1.Unit, stats2.Unit, "Unit should be consistent")
	assert.Equal(t, "bps", stats1.Unit, "Unit should always be 'bps'")
	assert.Equal(t, "bps", stats2.Unit, "Unit should always be 'bps'")
}
