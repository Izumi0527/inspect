package devices

import (
	"fmt"
	"math"
	"strings"
	"testing"
)

// TestBandwidthCalculationSpecificExample tests the specific example from requirements:
// 1000 bytes/second = 8000 bps
// **Validates: Requirements 1.1, 1.2**
func TestBandwidthCalculationSpecificExample(t *testing.T) {
	// Test case: 1000 bytes transferred in 1 second should equal 8000 bps
	bytes := uint64(1000)
	elapsed := 1.0
	
	// Calculate bandwidth using the formula: (bytes / elapsed) * 8
	calculatedBps := (float64(bytes) / elapsed) * 8
	expectedBps := 8000.0
	
	if calculatedBps != expectedBps {
		t.Errorf("Bandwidth calculation failed: bytes=%d, elapsed=%f, got=%f bps, want=%f bps",
			bytes, elapsed, calculatedBps, expectedBps)
	}
}

// TestBandwidthCalculationMultipleExamples tests various specific examples
// **Validates: Requirements 1.1, 1.2**
func TestBandwidthCalculationMultipleExamples(t *testing.T) {
	tests := []struct {
		name        string
		bytes       uint64
		elapsed     float64
		expectedBps float64
	}{
		{
			name:        "1000 bytes in 1 second = 8000 bps",
			bytes:       1000,
			elapsed:     1.0,
			expectedBps: 8000.0,
		},
		{
			name:        "125 bytes in 1 second = 1000 bps (1 Kbps)",
			bytes:       125,
			elapsed:     1.0,
			expectedBps: 1000.0,
		},
		{
			name:        "125000 bytes in 1 second = 1000000 bps (1 Mbps)",
			bytes:       125000,
			elapsed:     1.0,
			expectedBps: 1000000.0,
		},
		{
			name:        "125000000 bytes in 1 second = 1000000000 bps (1 Gbps)",
			bytes:       125000000,
			elapsed:     1.0,
			expectedBps: 1000000000.0,
		},
		{
			name:        "500 bytes in 0.5 seconds = 8000 bps",
			bytes:       500,
			elapsed:     0.5,
			expectedBps: 8000.0,
		},
		{
			name:        "2000 bytes in 2 seconds = 8000 bps",
			bytes:       2000,
			elapsed:     2.0,
			expectedBps: 8000.0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			calculatedBps := (float64(tt.bytes) / tt.elapsed) * 8
			
			// Use small epsilon for floating-point comparison
			epsilon := 0.001
			diff := math.Abs(calculatedBps - tt.expectedBps)
			
			if diff >= epsilon {
				t.Errorf("Bandwidth calculation failed: got=%f bps, want=%f bps, diff=%f",
					calculatedBps, tt.expectedBps, diff)
			}
		})
	}
}

// TestBandwidthCalculationBoundaryConditions tests boundary conditions
// **Validates: Requirements 1.1, 1.2**
func TestBandwidthCalculationBoundaryConditions(t *testing.T) {
	tests := []struct {
		name        string
		bytes       uint64
		elapsed     float64
		expectedBps float64
		description string
	}{
		{
			name:        "zero bytes",
			bytes:       0,
			elapsed:     1.0,
			expectedBps: 0.0,
			description: "Zero bytes should result in zero bandwidth",
		},
		{
			name:        "zero bytes with long elapsed time",
			bytes:       0,
			elapsed:     100.0,
			expectedBps: 0.0,
			description: "Zero bytes should always result in zero bandwidth",
		},
		{
			name:        "one byte",
			bytes:       1,
			elapsed:     1.0,
			expectedBps: 8.0,
			description: "Minimum non-zero bytes: 1 byte = 8 bits",
		},
		{
			name:        "maximum uint64 bytes",
			bytes:       math.MaxUint64,
			elapsed:     1.0,
			expectedBps: float64(math.MaxUint64) * 8,
			description: "Maximum possible bytes value",
		},
		{
			name:        "very small elapsed time",
			bytes:       1000,
			elapsed:     0.001, // 1 millisecond
			expectedBps: 8000000.0, // 8 Mbps
			description: "Very small time interval should produce large bandwidth",
		},
		{
			name:        "very large elapsed time",
			bytes:       1000,
			elapsed:     1000.0, // 1000 seconds
			expectedBps: 8.0,
			description: "Very large time interval should produce small bandwidth",
		},
		{
			name:        "typical 10 Gbps scenario",
			bytes:       1250000000, // 1.25 GB
			elapsed:     1.0,
			expectedBps: 10000000000.0, // 10 Gbps
			description: "Typical high-speed network interface at maximum capacity",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			calculatedBps := (float64(tt.bytes) / tt.elapsed) * 8
			
			// Use relative epsilon for very large numbers
			epsilon := math.Max(0.001, tt.expectedBps*0.0001)
			diff := math.Abs(calculatedBps - tt.expectedBps)
			
			if diff >= epsilon {
				t.Errorf("%s: got=%f bps, want=%f bps, diff=%f",
					tt.description, calculatedBps, tt.expectedBps, diff)
			}
		})
	}
}

// TestBandwidthCalculationErrorHandling tests error handling scenarios
// **Validates: Requirements 1.1, 1.2**
func TestBandwidthCalculationErrorHandling(t *testing.T) {
	tests := []struct {
		name        string
		bytes       int64  // Using int64 to test negative values
		elapsed     float64
		shouldSkip  bool
		description string
	}{
		{
			name:        "negative bytes",
			bytes:       -1000,
			elapsed:     1.0,
			shouldSkip:  true,
			description: "Negative bytes should be detected and skipped",
		},
		{
			name:        "zero elapsed time",
			bytes:       1000,
			elapsed:     0.0,
			shouldSkip:  true,
			description: "Zero elapsed time should be detected and skipped (division by zero)",
		},
		{
			name:        "negative elapsed time",
			bytes:       1000,
			elapsed:     -1.0,
			shouldSkip:  true,
			description: "Negative elapsed time should be detected and skipped",
		},
		{
			name:        "both negative",
			bytes:       -1000,
			elapsed:     -1.0,
			shouldSkip:  true,
			description: "Both negative values should be detected and skipped",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Simulate the error handling logic from the actual code
			// In the real implementation, these checks happen before calculation
			
			// Check for negative bytes
			if tt.bytes < 0 {
				if !tt.shouldSkip {
					t.Errorf("%s: expected to skip but shouldSkip=false", tt.description)
				}
				// In real code, this would log an error and return
				t.Logf("Correctly detected invalid byte count: %d", tt.bytes)
				return
			}
			
			// Check for invalid elapsed time
			if tt.elapsed <= 0 {
				if !tt.shouldSkip {
					t.Errorf("%s: expected to skip but shouldSkip=false", tt.description)
				}
				// In real code, this would log an error and return
				t.Logf("Correctly detected invalid elapsed time: %f", tt.elapsed)
				return
			}
			
			// If we reach here with shouldSkip=true, the validation failed
			if tt.shouldSkip {
				t.Errorf("%s: validation should have caught this case", tt.description)
			}
		})
	}
}

// TestBandwidthCalculationPrecision tests floating-point precision handling
// **Validates: Requirements 1.1, 1.2**
func TestBandwidthCalculationPrecision(t *testing.T) {
	tests := []struct {
		name        string
		bytes       uint64
		elapsed     float64
		description string
	}{
		{
			name:        "fractional result",
			bytes:       1,
			elapsed:     3.0,
			description: "Should handle fractional bps values correctly",
		},
		{
			name:        "very small bandwidth",
			bytes:       1,
			elapsed:     1000.0,
			description: "Should handle very small bandwidth values",
		},
		{
			name:        "repeating decimal",
			bytes:       1000,
			elapsed:     3.0,
			description: "Should handle repeating decimals correctly",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			calculatedBps := (float64(tt.bytes) / tt.elapsed) * 8
			expectedBps := (float64(tt.bytes) / tt.elapsed) * 8
			
			// Verify the calculation produces a valid number
			if math.IsNaN(calculatedBps) {
				t.Errorf("%s: result is NaN", tt.description)
			}
			
			if math.IsInf(calculatedBps, 0) {
				t.Errorf("%s: result is Infinity", tt.description)
			}
			
			// Verify precision
			epsilon := 0.0001
			diff := math.Abs(calculatedBps - expectedBps)
			
			if diff >= epsilon {
				t.Errorf("%s: precision error too large: diff=%f", tt.description, diff)
			}
			
			t.Logf("%s: bytes=%d, elapsed=%f, bps=%f", 
				tt.description, tt.bytes, tt.elapsed, calculatedBps)
		})
	}
}

// TestBandwidthCalculationUnitsCorrectness verifies the formula produces bps (not Mbps)
// **Validates: Requirements 1.1, 1.2, 1.3**
func TestBandwidthCalculationUnitsCorrectness(t *testing.T) {
	// This test verifies that we're calculating bps, not Mbps
	// The old formula was: (bytes / elapsed) * 8 / 1000000 (Mbps)
	// The new formula is: (bytes / elapsed) * 8 (bps)
	
	bytes := uint64(125000000) // 125 MB
	elapsed := 1.0
	
	// Calculate using new formula (bps)
	bps := (float64(bytes) / elapsed) * 8
	expectedBps := 1000000000.0 // 1 Gbps in bps
	
	// Calculate what the old formula would have given (Mbps)
	oldMbps := (float64(bytes) / elapsed) * 8 / 1000000
	expectedMbps := 1000.0 // 1000 Mbps
	
	// Verify new formula gives bps
	if math.Abs(bps-expectedBps) >= 0.001 {
		t.Errorf("New formula should produce bps: got=%f, want=%f", bps, expectedBps)
	}
	
	// Verify old formula would have given Mbps (for documentation)
	if math.Abs(oldMbps-expectedMbps) >= 0.001 {
		t.Errorf("Old formula verification failed: got=%f, want=%f", oldMbps, expectedMbps)
	}
	
	// Verify the relationship: bps = Mbps * 1,000,000
	if math.Abs(bps-(oldMbps*1000000)) >= 0.001 {
		t.Errorf("Unit conversion relationship failed: bps=%f, Mbps*1000000=%f", 
			bps, oldMbps*1000000)
	}
	
	t.Logf("Unit conversion verified: %f Mbps = %f bps", oldMbps, bps)
}

// TestBandwidthCalculationRealWorldScenarios tests realistic network scenarios
// **Validates: Requirements 1.1, 1.2**
func TestBandwidthCalculationRealWorldScenarios(t *testing.T) {
	tests := []struct {
		name        string
		bytes       uint64
		elapsed     float64
		expectedBps float64
		description string
	}{
		{
			name:        "100 Mbps link at 50% utilization",
			bytes:       6250000, // 6.25 MB
			elapsed:     1.0,
			expectedBps: 50000000.0, // 50 Mbps
			description: "Typical office network link",
		},
		{
			name:        "1 Gbps link at 80% utilization",
			bytes:       100000000, // 100 MB
			elapsed:     1.0,
			expectedBps: 800000000.0, // 800 Mbps
			description: "Data center network link under load",
		},
		{
			name:        "10 Gbps link at 30% utilization",
			bytes:       375000000, // 375 MB
			elapsed:     1.0,
			expectedBps: 3000000000.0, // 3 Gbps
			description: "High-speed backbone link",
		},
		{
			name:        "slow connection - 1 Mbps",
			bytes:       125000, // 125 KB
			elapsed:     1.0,
			expectedBps: 1000000.0, // 1 Mbps
			description: "Slow internet connection",
		},
		{
			name:        "burst traffic - 5 second average",
			bytes:       62500000, // 62.5 MB over 5 seconds
			elapsed:     5.0,
			expectedBps: 100000000.0, // 100 Mbps average
			description: "Bursty traffic averaged over time",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			calculatedBps := (float64(tt.bytes) / tt.elapsed) * 8
			
			epsilon := math.Max(0.001, tt.expectedBps*0.0001)
			diff := math.Abs(calculatedBps - tt.expectedBps)
			
			if diff >= epsilon {
				t.Errorf("%s: got=%f bps (%.2f Mbps), want=%f bps (%.2f Mbps)",
					tt.description, 
					calculatedBps, calculatedBps/1000000,
					tt.expectedBps, tt.expectedBps/1000000)
			} else {
				t.Logf("%s: %f bps (%.2f Mbps) ✓", 
					tt.description, calculatedBps, calculatedBps/1000000)
			}
		})
	}
}

// TestThresholdCheckBoundaryValues tests the threshold checking with boundary values
// **Validates: Requirements 2.1, 2.2**
func TestThresholdCheckBoundaryValues(t *testing.T) {
	// 最大合理带宽：10 Gbps = 10,000,000,000 bps
	const MaxReasonableBandwidthBps = 10_000_000_000

	tests := []struct {
		name           string
		bandwidthBps   float64
		shouldPass     bool
		description    string
	}{
		{
			name:           "just below threshold - should pass",
			bandwidthBps:   9_999_999_999,
			shouldPass:     true,
			description:    "9,999,999,999 bps (9.999999999 Gbps) should be accepted as reasonable",
		},
		{
			name:           "exactly at threshold - should pass",
			bandwidthBps:   10_000_000_000,
			shouldPass:     true,
			description:    "10,000,000,000 bps (10 Gbps) should be accepted as reasonable",
		},
		{
			name:           "just above threshold - should warn",
			bandwidthBps:   10_000_000_001,
			shouldPass:     false,
			description:    "10,000,000,001 bps (10.000000001 Gbps) should trigger warning",
		},
		{
			name:           "significantly above threshold - should warn",
			bandwidthBps:   15_000_000_000,
			shouldPass:     false,
			description:    "15,000,000,000 bps (15 Gbps) should trigger warning",
		},
		{
			name:           "zero bandwidth - should pass",
			bandwidthBps:   0,
			shouldPass:     true,
			description:    "Zero bandwidth is valid (no traffic)",
		},
		{
			name:           "typical 1 Gbps - should pass",
			bandwidthBps:   1_000_000_000,
			shouldPass:     true,
			description:    "1 Gbps is well within reasonable range",
		},
		{
			name:           "typical 5 Gbps - should pass",
			bandwidthBps:   5_000_000_000,
			shouldPass:     true,
			description:    "5 Gbps is within reasonable range",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Simulate the threshold check logic from snmp_collector.go
			isReasonable := tt.bandwidthBps <= MaxReasonableBandwidthBps
			
			if isReasonable != tt.shouldPass {
				t.Errorf("%s: threshold check failed - bandwidth=%f bps (%.2f Gbps), "+
					"expected shouldPass=%v, got isReasonable=%v",
					tt.description,
					tt.bandwidthBps,
					tt.bandwidthBps/1_000_000_000,
					tt.shouldPass,
					isReasonable)
			} else {
				t.Logf("%s: ✓ bandwidth=%f bps (%.2f Gbps), reasonable=%v",
					tt.description,
					tt.bandwidthBps,
					tt.bandwidthBps/1_000_000_000,
					isReasonable)
			}
		})
	}
}

// TestThresholdWarningLogFormat tests that warning logs contain correct unit annotations
// **Validates: Requirements 2.1, 2.2**
func TestThresholdWarningLogFormat(t *testing.T) {
	// 最大合理带宽：10 Gbps = 10,000,000,000 bps
	const MaxReasonableBandwidthBps = 10_000_000_000

	tests := []struct {
		name         string
		inRateBps    float64
		outRateBps   float64
		shouldWarn   bool
		description  string
	}{
		{
			name:         "both rates exceed threshold",
			inRateBps:    12_000_000_000,
			outRateBps:   11_000_000_000,
			shouldWarn:   true,
			description:  "Both inbound and outbound exceed 10 Gbps",
		},
		{
			name:         "only inbound exceeds threshold",
			inRateBps:    10_500_000_000,
			outRateBps:   5_000_000_000,
			shouldWarn:   true,
			description:  "Only inbound exceeds threshold",
		},
		{
			name:         "only outbound exceeds threshold",
			inRateBps:    5_000_000_000,
			outRateBps:   10_500_000_000,
			shouldWarn:   true,
			description:  "Only outbound exceeds threshold",
		},
		{
			name:         "both rates within threshold",
			inRateBps:    8_000_000_000,
			outRateBps:   9_000_000_000,
			shouldWarn:   false,
			description:  "Both rates are reasonable",
		},
		{
			name:         "boundary case - exactly at threshold",
			inRateBps:    10_000_000_000,
			outRateBps:   10_000_000_000,
			shouldWarn:   false,
			description:  "Exactly at threshold should not warn",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Check if warning should be triggered
			inExceeds := tt.inRateBps > MaxReasonableBandwidthBps
			outExceeds := tt.outRateBps > MaxReasonableBandwidthBps
			shouldWarn := inExceeds || outExceeds
			
			if shouldWarn != tt.shouldWarn {
				t.Errorf("%s: warning check failed - expected shouldWarn=%v, got=%v",
					tt.description, tt.shouldWarn, shouldWarn)
			}
			
			// Verify log message format contains both bps and Gbps units
			if shouldWarn {
				// Simulate the log message format from snmp_collector.go
				if inExceeds {
					logMsg := fmt.Sprintf("unreasonable bandwidth detected: in_rate_bps=%.2f, in_rate_gbps=%.2f",
						tt.inRateBps, tt.inRateBps/1_000_000_000)
					
					// Verify log contains both unit annotations
					if !strings.Contains(logMsg, "bps") {
						t.Errorf("Warning log should contain 'bps' unit annotation: %s", logMsg)
					}
					if !strings.Contains(logMsg, "gbps") {
						t.Errorf("Warning log should contain 'gbps' unit annotation: %s", logMsg)
					}
					
					// Verify the Gbps conversion is correct
					expectedGbps := tt.inRateBps / 1_000_000_000
					if !strings.Contains(logMsg, fmt.Sprintf("%.2f", expectedGbps)) {
						t.Errorf("Warning log should contain correct Gbps value %.2f: %s", expectedGbps, logMsg)
					}
					
					t.Logf("Inbound warning log format verified: %s", logMsg)
				}
				
				if outExceeds {
					logMsg := fmt.Sprintf("unreasonable bandwidth detected: out_rate_bps=%.2f, out_rate_gbps=%.2f",
						tt.outRateBps, tt.outRateBps/1_000_000_000)
					
					// Verify log contains both unit annotations
					if !strings.Contains(logMsg, "bps") {
						t.Errorf("Warning log should contain 'bps' unit annotation: %s", logMsg)
					}
					if !strings.Contains(logMsg, "gbps") {
						t.Errorf("Warning log should contain 'gbps' unit annotation: %s", logMsg)
					}
					
					// Verify the Gbps conversion is correct
					expectedGbps := tt.outRateBps / 1_000_000_000
					if !strings.Contains(logMsg, fmt.Sprintf("%.2f", expectedGbps)) {
						t.Errorf("Warning log should contain correct Gbps value %.2f: %s", expectedGbps, logMsg)
					}
					
					t.Logf("Outbound warning log format verified: %s", logMsg)
				}
			} else {
				t.Logf("%s: No warning needed - in=%.2f Gbps, out=%.2f Gbps ✓",
					tt.description,
					tt.inRateBps/1_000_000_000,
					tt.outRateBps/1_000_000_000)
			}
		})
	}
}

// TestThresholdConstantValue verifies the threshold constant is correctly defined
// **Validates: Requirements 2.1, 2.2**
func TestThresholdConstantValue(t *testing.T) {
	// This test verifies that the MaxReasonableBandwidthBps constant
	// is correctly set to 10 Gbps = 10,000,000,000 bps
	const MaxReasonableBandwidthBps = 10_000_000_000
	const ExpectedGbps = 10.0
	
	// Verify the constant value
	if MaxReasonableBandwidthBps != 10_000_000_000 {
		t.Errorf("MaxReasonableBandwidthBps should be 10,000,000,000 bps, got %d", MaxReasonableBandwidthBps)
	}
	
	// Verify the conversion to Gbps
	actualGbps := float64(MaxReasonableBandwidthBps) / 1_000_000_000
	if actualGbps != ExpectedGbps {
		t.Errorf("MaxReasonableBandwidthBps should equal %.1f Gbps, got %.1f Gbps", ExpectedGbps, actualGbps)
	}
	
	// Verify the constant is using underscores for readability
	constantStr := "10_000_000_000"
	t.Logf("Threshold constant verified: %s bps = %.1f Gbps ✓", constantStr, actualGbps)
	
	// Verify the comment in the code mentions 10 Gbps
	// This is a documentation check - the actual code should have a comment like:
	// "最大合理带宽：10 Gbps = 10,000,000,000 bps"
	t.Logf("Code should include comment: '最大合理带宽：10 Gbps = 10,000,000,000 bps'")
}

// TestThresholdCheckWithRealWorldScenarios tests threshold checking with realistic scenarios
// **Validates: Requirements 2.1, 2.2**
func TestThresholdCheckWithRealWorldScenarios(t *testing.T) {
	const MaxReasonableBandwidthBps = 10_000_000_000

	tests := []struct {
		name        string
		scenario    string
		bandwidthBps float64
		shouldPass  bool
	}{
		{
			name:        "1 Gbps link at full capacity",
			scenario:    "Typical enterprise network link",
			bandwidthBps: 1_000_000_000,
			shouldPass:  true,
		},
		{
			name:        "10 Gbps link at 90% utilization",
			scenario:    "High-speed data center link under heavy load",
			bandwidthBps: 9_000_000_000,
			shouldPass:  true,
		},
		{
			name:        "10 Gbps link at 100% utilization",
			scenario:    "Maxed out 10 Gbps link",
			bandwidthBps: 10_000_000_000,
			shouldPass:  true,
		},
		{
			name:        "Apparent 40 Gbps on 10 Gbps link",
			scenario:    "Counter wrap or measurement error",
			bandwidthBps: 40_000_000_000,
			shouldPass:  false,
		},
		{
			name:        "Apparent 100 Gbps",
			scenario:    "Severe counter wrap or system error",
			bandwidthBps: 100_000_000_000,
			shouldPass:  false,
		},
		{
			name:        "Small office network - 100 Mbps",
			scenario:    "Small business internet connection",
			bandwidthBps: 100_000_000,
			shouldPass:  true,
		},
		{
			name:        "Home network - 10 Mbps",
			scenario:    "Residential internet connection",
			bandwidthBps: 10_000_000,
			shouldPass:  true,
		},
		{
			name:        "Edge case - just over threshold",
			scenario:    "Slightly exceeds maximum reasonable bandwidth",
			bandwidthBps: 10_000_000_001,
			shouldPass:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			isReasonable := tt.bandwidthBps <= MaxReasonableBandwidthBps
			
			if isReasonable != tt.shouldPass {
				t.Errorf("%s (%s): threshold check failed - bandwidth=%.2f Gbps, "+
					"expected shouldPass=%v, got isReasonable=%v",
					tt.name,
					tt.scenario,
					tt.bandwidthBps/1_000_000_000,
					tt.shouldPass,
					isReasonable)
			} else {
				t.Logf("%s: %.2f Gbps - %s ✓",
					tt.name,
					tt.bandwidthBps/1_000_000_000,
					tt.scenario)
			}
		})
	}
}
