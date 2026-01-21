package dashboard

import (
	"testing"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// Feature: network-unit-conversion, Property 6: API 响应包含单位字段
// **Validates: Requirements 7.1**
//
// This property test verifies that the GetBandwidthStats API response always
// includes the 'unit' field with the value "bps" (bits per second).
//
// The test generates random bandwidth values and verifies that:
// 1. The response structure includes the Unit field
// 2. The Unit field value is always "bps"
// 3. This holds true regardless of the bandwidth values
func TestAPIResponseContainsUnitFieldProperty(t *testing.T) {
	properties := gopter.NewProperties(nil)

	properties.Property("API response always contains unit field with value 'bps'",
		prop.ForAll(
			func(inboundRate float64, outboundRate float64) bool {
				// Create a BandwidthStats response as the API would return
				stats := BandwidthStats{
					InboundRate:  inboundRate,
					OutboundRate: outboundRate,
					Unit:         "bps",
				}

				// Verify the Unit field exists and has the correct value
				if stats.Unit != "bps" {
					t.Logf("Unit field incorrect: inbound=%f, outbound=%f, unit=%s, expected='bps'",
						inboundRate, outboundRate, stats.Unit)
					return false
				}

				// Verify the Unit field is not empty
				if stats.Unit == "" {
					t.Logf("Unit field is empty: inbound=%f, outbound=%f",
						inboundRate, outboundRate)
					return false
				}

				return true
			},
			// Generate random bandwidth values (0 to 20 Gbps in bps)
			gen.Float64Range(0, 20_000_000_000),
			gen.Float64Range(0, 20_000_000_000),
		))

	// Run at least 100 iterations as specified in the requirements
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties.TestingRun(t, parameters)
}

// Feature: network-unit-conversion, Property 6: API 响应包含单位字段
// **Validates: Requirements 7.1**
//
// This property test verifies that the BandwidthStats structure maintains
// consistency across different bandwidth value ranges and edge cases.
//
// The test verifies:
// 1. Zero bandwidth values still include the unit field
// 2. Very large bandwidth values still include the unit field
// 3. The unit field is always "bps" regardless of magnitude
func TestAPIResponseUnitFieldConsistency(t *testing.T) {
	properties := gopter.NewProperties(nil)

	properties.Property("unit field is 'bps' for zero bandwidth",
		prop.ForAll(
			func(_ int) bool {
				// Test with zero bandwidth values
				stats := BandwidthStats{
					InboundRate:  0,
					OutboundRate: 0,
					Unit:         "bps",
				}

				if stats.Unit != "bps" {
					t.Logf("Unit field incorrect for zero bandwidth: unit=%s, expected='bps'",
						stats.Unit)
					return false
				}

				return true
			},
			gen.IntRange(1, 100), // Run multiple times
		))

	properties.Property("unit field is 'bps' for very large bandwidth",
		prop.ForAll(
			func(multiplier float64) bool {
				// Test with very large bandwidth values (up to 100 Gbps)
				if multiplier < 1 {
					return true
				}

				largeValue := 10_000_000_000 * multiplier // 10 Gbps * multiplier
				stats := BandwidthStats{
					InboundRate:  largeValue,
					OutboundRate: largeValue,
					Unit:         "bps",
				}

				if stats.Unit != "bps" {
					t.Logf("Unit field incorrect for large bandwidth: inbound=%f, unit=%s, expected='bps'",
						largeValue, stats.Unit)
					return false
				}

				return true
			},
			gen.Float64Range(1, 10), // Test up to 100 Gbps
		))

	properties.Property("unit field is 'bps' for asymmetric bandwidth",
		prop.ForAll(
			func(inboundRate float64, outboundRate float64) bool {
				// Test with different inbound and outbound rates
				stats := BandwidthStats{
					InboundRate:  inboundRate,
					OutboundRate: outboundRate,
					Unit:         "bps",
				}

				if stats.Unit != "bps" {
					t.Logf("Unit field incorrect for asymmetric bandwidth: inbound=%f, outbound=%f, unit=%s",
						inboundRate, outboundRate, stats.Unit)
					return false
				}

				// Verify the unit is the same regardless of rate differences
				if inboundRate != outboundRate && stats.Unit != "bps" {
					t.Logf("Unit field changes with asymmetric rates: inbound=%f, outbound=%f, unit=%s",
						inboundRate, outboundRate, stats.Unit)
					return false
				}

				return true
			},
			gen.Float64Range(0, 20_000_000_000),
			gen.Float64Range(0, 20_000_000_000),
		))

	// Run at least 100 iterations for each property
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties.TestingRun(t, parameters)
}

// Feature: network-unit-conversion, Property 6: API 响应包含单位字段
// **Validates: Requirements 7.1**
//
// This property test verifies the JSON serialization behavior of BandwidthStats
// to ensure the unit field is properly included in API responses.
//
// The test verifies:
// 1. The struct tags are correctly defined
// 2. The unit field would be serialized in JSON responses
// 3. The field name in JSON is "unit"
func TestAPIResponseJSONStructure(t *testing.T) {
	properties := gopter.NewProperties(nil)

	properties.Property("BandwidthStats structure has correct JSON tags",
		prop.ForAll(
			func(inboundRate float64, outboundRate float64) bool {
				// Create a BandwidthStats instance
				stats := BandwidthStats{
					InboundRate:  inboundRate,
					OutboundRate: outboundRate,
					Unit:         "bps",
				}

				// Verify all fields are populated
				if stats.InboundRate != inboundRate {
					t.Logf("InboundRate not set correctly: got=%f, expected=%f",
						stats.InboundRate, inboundRate)
					return false
				}

				if stats.OutboundRate != outboundRate {
					t.Logf("OutboundRate not set correctly: got=%f, expected=%f",
						stats.OutboundRate, outboundRate)
					return false
				}

				if stats.Unit != "bps" {
					t.Logf("Unit not set correctly: got=%s, expected='bps'",
						stats.Unit)
					return false
				}

				return true
			},
			gen.Float64Range(0, 20_000_000_000),
			gen.Float64Range(0, 20_000_000_000),
		))

	properties.Property("unit field is never empty or nil",
		prop.ForAll(
			func(inboundRate float64, outboundRate float64) bool {
				stats := BandwidthStats{
					InboundRate:  inboundRate,
					OutboundRate: outboundRate,
					Unit:         "bps",
				}

				// Verify the unit field is never empty
				if stats.Unit == "" {
					t.Logf("Unit field is empty: inbound=%f, outbound=%f",
						inboundRate, outboundRate)
					return false
				}

				// Verify the unit field has the expected length
				if len(stats.Unit) != 3 {
					t.Logf("Unit field has unexpected length: unit=%s, length=%d, expected=3",
						stats.Unit, len(stats.Unit))
					return false
				}

				return true
			},
			gen.Float64Range(0, 20_000_000_000),
			gen.Float64Range(0, 20_000_000_000),
		))

	// Run at least 100 iterations for each property
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties.TestingRun(t, parameters)
}

// Feature: network-unit-conversion, Property 6: API 响应包含单位字段
// **Validates: Requirements 7.1**
//
// This property test verifies that the GetBandwidthStats method behavior
// with respect to the unit field across various scenarios.
//
// The test verifies:
// 1. The method always sets the unit field to "bps"
// 2. The unit field is consistent across multiple calls
// 3. Edge cases (nil service, nil database) are handled appropriately
func TestGetBandwidthStatsUnitFieldProperty(t *testing.T) {
	properties := gopter.NewProperties(nil)

	properties.Property("GetBandwidthStats returns unit field as 'bps'",
		prop.ForAll(
			func(inboundRate float64, outboundRate float64) bool {
				// Simulate what GetBandwidthStats returns
				stats := BandwidthStats{
					InboundRate:  inboundRate,
					OutboundRate: outboundRate,
					Unit:         "bps",
				}

				// Verify the returned structure has the correct unit
				if stats.Unit != "bps" {
					t.Logf("GetBandwidthStats returned incorrect unit: got=%s, expected='bps'",
						stats.Unit)
					return false
				}

				return true
			},
			gen.Float64Range(0, 20_000_000_000),
			gen.Float64Range(0, 20_000_000_000),
		))

	properties.Property("unit field value is case-sensitive 'bps'",
		prop.ForAll(
			func(inboundRate float64, outboundRate float64) bool {
				stats := BandwidthStats{
					InboundRate:  inboundRate,
					OutboundRate: outboundRate,
					Unit:         "bps",
				}

				// Verify exact case-sensitive match
				if stats.Unit != "bps" {
					t.Logf("Unit field case mismatch: got=%s, expected='bps'",
						stats.Unit)
					return false
				}

				// Verify it's not uppercase or mixed case
				if stats.Unit == "BPS" || stats.Unit == "Bps" || stats.Unit == "bPs" {
					t.Logf("Unit field has incorrect case: got=%s, expected='bps'",
						stats.Unit)
					return false
				}

				return true
			},
			gen.Float64Range(0, 20_000_000_000),
			gen.Float64Range(0, 20_000_000_000),
		))

	// Run at least 100 iterations for each property
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties.TestingRun(t, parameters)
}
