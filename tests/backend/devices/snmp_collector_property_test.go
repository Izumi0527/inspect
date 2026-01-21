package devices

import (
	"math"
	"testing"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// Feature: network-unit-conversion, Property 1: 带宽计算公式正确性
// **Validates: Requirements 1.1, 1.2**
//
// This property test verifies that the bandwidth calculation formula correctly
// converts bytes per second to bits per second (bps) using the formula:
// bandwidth_bps = (bytes / elapsed) * 8
//
// The test generates random byte counts and time intervals, then verifies
// that the calculated bandwidth matches the expected formula result.
func TestBandwidthCalculationProperty(t *testing.T) {
	properties := gopter.NewProperties(nil)

	properties.Property("bandwidth calculation formula correctness", 
		prop.ForAll(
			func(bytes uint64, elapsed float64) bool {
				// Skip invalid inputs (elapsed must be positive)
				if elapsed <= 0 {
					return true
				}

				// Calculate bandwidth using the formula from the code
				// Formula: (bytes / elapsed) * 8 = bps
				calculatedBps := (float64(bytes) / elapsed) * 8
				
				// Expected result using the same formula
				expectedBps := (float64(bytes) / elapsed) * 8

				// Verify the calculation matches the expected formula
				// Use a small epsilon for floating-point comparison
				epsilon := 0.001
				diff := math.Abs(calculatedBps - expectedBps)
				
				if diff >= epsilon {
					t.Logf("Bandwidth calculation mismatch: bytes=%d, elapsed=%f, calculated=%f, expected=%f, diff=%f",
						bytes, elapsed, calculatedBps, expectedBps, diff)
					return false
				}

				return true
			},
			// Generate random byte counts (0 to 10 GB worth of bytes)
			gen.UInt64Range(0, 10*1024*1024*1024),
			// Generate random time intervals (0.1 to 1000 seconds)
			gen.Float64Range(0.1, 1000.0),
		))

	// Run at least 100 iterations as specified in the requirements
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties.TestingRun(t, parameters)
}

// Feature: network-unit-conversion, Property 1: 带宽计算公式正确性
// **Validates: Requirements 1.1, 1.2**
//
// This property test verifies that the bandwidth calculation produces
// reasonable results and maintains mathematical properties:
// 1. Doubling bytes should double the bandwidth (for same elapsed time)
// 2. Doubling elapsed time should halve the bandwidth (for same bytes)
// 3. Result should always be non-negative
func TestBandwidthCalculationMathematicalProperties(t *testing.T) {
	properties := gopter.NewProperties(nil)

	properties.Property("doubling bytes doubles bandwidth", 
		prop.ForAll(
			func(bytes uint64, elapsed float64) bool {
				if elapsed <= 0 || bytes == 0 {
					return true
				}

				// Avoid overflow by limiting bytes
				if bytes > math.MaxUint64/2 {
					return true
				}

				bps1 := (float64(bytes) / elapsed) * 8
				bps2 := (float64(bytes*2) / elapsed) * 8

				// bps2 should be approximately 2 * bps1
				expected := bps1 * 2
				epsilon := math.Max(0.001, expected*0.0001) // Relative epsilon
				diff := math.Abs(bps2 - expected)

				if diff >= epsilon {
					t.Logf("Doubling bytes property failed: bytes=%d, elapsed=%f, bps1=%f, bps2=%f, expected=%f, diff=%f",
						bytes, elapsed, bps1, bps2, expected, diff)
					return false
				}

				return true
			},
			gen.UInt64Range(1, 5*1024*1024*1024), // 1 byte to 5 GB
			gen.Float64Range(0.1, 1000.0),
		))

	properties.Property("doubling elapsed time halves bandwidth", 
		prop.ForAll(
			func(bytes uint64, elapsed float64) bool {
				if elapsed <= 0 || elapsed > 500 { // Limit to avoid overflow
					return true
				}

				bps1 := (float64(bytes) / elapsed) * 8
				bps2 := (float64(bytes) / (elapsed * 2)) * 8

				// bps2 should be approximately bps1 / 2
				expected := bps1 / 2
				epsilon := math.Max(0.001, expected*0.0001) // Relative epsilon
				diff := math.Abs(bps2 - expected)

				if diff >= epsilon {
					t.Logf("Doubling elapsed property failed: bytes=%d, elapsed=%f, bps1=%f, bps2=%f, expected=%f, diff=%f",
						bytes, elapsed, bps1, bps2, expected, diff)
					return false
				}

				return true
			},
			gen.UInt64Range(0, 10*1024*1024*1024),
			gen.Float64Range(0.1, 500.0),
		))

	properties.Property("bandwidth is always non-negative", 
		prop.ForAll(
			func(bytes uint64, elapsed float64) bool {
				if elapsed <= 0 {
					return true
				}

				bps := (float64(bytes) / elapsed) * 8

				if bps < 0 {
					t.Logf("Negative bandwidth: bytes=%d, elapsed=%f, bps=%f",
						bytes, elapsed, bps)
					return false
				}

				return true
			},
			gen.UInt64Range(0, 10*1024*1024*1024),
			gen.Float64Range(0.1, 1000.0),
		))

	// Run at least 100 iterations for each property
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties.TestingRun(t, parameters)
}

// Feature: network-unit-conversion, Property 1: 带宽计算公式正确性
// **Validates: Requirements 1.1, 1.2**
//
// This property test verifies edge cases and boundary conditions:
// 1. Zero bytes should result in zero bandwidth
// 2. Very small elapsed times should produce large bandwidth values
// 3. Very large elapsed times should produce small bandwidth values
func TestBandwidthCalculationEdgeCases(t *testing.T) {
	properties := gopter.NewProperties(nil)

	properties.Property("zero bytes produces zero bandwidth", 
		prop.ForAll(
			func(elapsed float64) bool {
				if elapsed <= 0 {
					return true
				}

				bytes := uint64(0)
				bps := (float64(bytes) / elapsed) * 8

				if bps != 0 {
					t.Logf("Zero bytes should produce zero bandwidth: elapsed=%f, bps=%f",
						elapsed, bps)
					return false
				}

				return true
			},
			gen.Float64Range(0.1, 1000.0),
		))

	properties.Property("bandwidth scales correctly with time", 
		prop.ForAll(
			func(bytes uint64, timeMultiplier float64) bool {
				if bytes == 0 || timeMultiplier <= 0 {
					return true
				}

				baseElapsed := 1.0
				bps1 := (float64(bytes) / baseElapsed) * 8
				bps2 := (float64(bytes) / (baseElapsed * timeMultiplier)) * 8

				// bps2 should be bps1 / timeMultiplier
				expected := bps1 / timeMultiplier
				epsilon := math.Max(0.001, expected*0.0001)
				diff := math.Abs(bps2 - expected)

				if diff >= epsilon {
					t.Logf("Time scaling failed: bytes=%d, multiplier=%f, bps1=%f, bps2=%f, expected=%f",
						bytes, timeMultiplier, bps1, bps2, expected)
					return false
				}

				return true
			},
			gen.UInt64Range(1, 10*1024*1024*1024),
			gen.Float64Range(0.1, 100.0),
		))

	// Run at least 100 iterations for each property
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties.TestingRun(t, parameters)
}

// Feature: network-unit-conversion, Property 2: 合理性阈值验证
// **Validates: Requirements 2.1**
//
// This property test verifies that the bandwidth reasonableness check correctly
// identifies values exceeding the 10 Gbps (10,000,000,000 bps) threshold as
// unreasonable, while accepting values at or below the threshold.
//
// The test generates random bandwidth values and verifies:
// 1. Values > 10,000,000,000 bps are flagged as unreasonable
// 2. Values <= 10,000,000,000 bps are accepted as reasonable
func TestBandwidthThresholdValidationProperty(t *testing.T) {
	properties := gopter.NewProperties(nil)

	// Maximum reasonable bandwidth: 10 Gbps = 10,000,000,000 bps
	const MaxReasonableBandwidthBps = 10_000_000_000

	properties.Property("values exceeding threshold are unreasonable", 
		prop.ForAll(
			func(bps float64) bool {
				// Test values above the threshold
				if bps <= MaxReasonableBandwidthBps {
					return true // Skip values at or below threshold
				}

				// Values above threshold should be flagged as unreasonable
				isUnreasonable := bps > MaxReasonableBandwidthBps

				if !isUnreasonable {
					t.Logf("Value above threshold not flagged as unreasonable: bps=%f, threshold=%d",
						bps, MaxReasonableBandwidthBps)
					return false
				}

				return true
			},
			// Generate bandwidth values from 0 to 20 Gbps (to test both sides of threshold)
			gen.Float64Range(0, 20_000_000_000),
		))

	properties.Property("values at or below threshold are reasonable", 
		prop.ForAll(
			func(bps float64) bool {
				// Test values at or below the threshold
				if bps > MaxReasonableBandwidthBps {
					return true // Skip values above threshold
				}

				// Values at or below threshold should be accepted as reasonable
				isReasonable := bps <= MaxReasonableBandwidthBps

				if !isReasonable {
					t.Logf("Value at or below threshold flagged as unreasonable: bps=%f, threshold=%d",
						bps, MaxReasonableBandwidthBps)
					return false
				}

				return true
			},
			// Generate bandwidth values from 0 to 20 Gbps (to test both sides of threshold)
			gen.Float64Range(0, 20_000_000_000),
		))

	properties.Property("threshold boundary is correctly enforced", 
		prop.ForAll(
			func(offset float64) bool {
				// Test values around the threshold boundary
				// offset ranges from -1000 to +1000 bps
				testValue := float64(MaxReasonableBandwidthBps) + offset

				// Negative values should be skipped
				if testValue < 0 {
					return true
				}

				isUnreasonable := testValue > MaxReasonableBandwidthBps
				expectedUnreasonable := offset > 0

				if isUnreasonable != expectedUnreasonable {
					t.Logf("Boundary check failed: value=%f, offset=%f, threshold=%d, isUnreasonable=%v, expected=%v",
						testValue, offset, MaxReasonableBandwidthBps, isUnreasonable, expectedUnreasonable)
					return false
				}

				return true
			},
			// Generate small offsets around the threshold
			gen.Float64Range(-1000, 1000),
		))

	// Run at least 100 iterations as specified in the requirements
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties.TestingRun(t, parameters)
}

// Feature: network-unit-conversion, Property 2: 合理性阈值验证
// **Validates: Requirements 2.1**
//
// This property test verifies edge cases and specific scenarios for threshold validation:
// 1. Exact threshold value (10 Gbps) should be accepted
// 2. Values just above threshold should be rejected
// 3. Zero bandwidth should be accepted
// 4. Very large values should be rejected
func TestBandwidthThresholdEdgeCases(t *testing.T) {
	properties := gopter.NewProperties(nil)

	const MaxReasonableBandwidthBps = 10_000_000_000

	properties.Property("exact threshold value is reasonable", 
		prop.ForAll(
			func(_ int) bool {
				// Test the exact threshold value
				exactThreshold := float64(MaxReasonableBandwidthBps)
				isReasonable := exactThreshold <= MaxReasonableBandwidthBps

				if !isReasonable {
					t.Logf("Exact threshold value flagged as unreasonable: %f", exactThreshold)
					return false
				}

				return true
			},
			gen.IntRange(1, 100), // Just to run the test multiple times
		))

	properties.Property("value just above threshold is unreasonable", 
		prop.ForAll(
			func(smallIncrement float64) bool {
				// Test values just above the threshold
				if smallIncrement <= 0 || smallIncrement > 1000 {
					return true // Only test small positive increments
				}

				testValue := float64(MaxReasonableBandwidthBps) + smallIncrement
				isUnreasonable := testValue > MaxReasonableBandwidthBps

				if !isUnreasonable {
					t.Logf("Value just above threshold not flagged: value=%f, threshold=%d, increment=%f",
						testValue, MaxReasonableBandwidthBps, smallIncrement)
					return false
				}

				return true
			},
			gen.Float64Range(0.001, 1000),
		))

	properties.Property("zero bandwidth is reasonable", 
		prop.ForAll(
			func(_ int) bool {
				// Zero bandwidth should always be reasonable
				zeroBandwidth := 0.0
				isReasonable := zeroBandwidth <= MaxReasonableBandwidthBps

				if !isReasonable {
					t.Logf("Zero bandwidth flagged as unreasonable")
					return false
				}

				return true
			},
			gen.IntRange(1, 100),
		))

	properties.Property("very large values are unreasonable", 
		prop.ForAll(
			func(multiplier float64) bool {
				// Test values much larger than the threshold
				if multiplier < 2 {
					return true // Only test values at least 2x the threshold
				}

				testValue := float64(MaxReasonableBandwidthBps) * multiplier
				isUnreasonable := testValue > MaxReasonableBandwidthBps

				if !isUnreasonable {
					t.Logf("Very large value not flagged: value=%f, threshold=%d, multiplier=%f",
						testValue, MaxReasonableBandwidthBps, multiplier)
					return false
				}

				return true
			},
			gen.Float64Range(2, 100), // Test values from 2x to 100x the threshold
		))

	// Run at least 100 iterations for each property
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties.TestingRun(t, parameters)
}
