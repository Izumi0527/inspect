/**
 * Unit tests for formatBandwidth function
 * Tests specific examples, boundary conditions, and edge cases
 */

import { formatBandwidth } from '../formatters'

describe('formatBandwidth', () => {
  describe('Basic functionality', () => {
    test('formats values less than 1000 as bps', () => {
      expect(formatBandwidth(0)).toBe('0.0 bps')
      expect(formatBandwidth(500)).toBe('500.0 bps')
      expect(formatBandwidth(999)).toBe('999.0 bps')
    })

    test('formats values in Kbps range', () => {
      expect(formatBandwidth(1000)).toBe('1.0 Kbps')
      expect(formatBandwidth(1500)).toBe('1.5 Kbps')
      expect(formatBandwidth(999999)).toBe('1000.0 Kbps') // 999.999 rounds to 1000.0
      expect(formatBandwidth(999000)).toBe('999.0 Kbps')
    })

    test('formats values in Mbps range', () => {
      expect(formatBandwidth(1_000_000)).toBe('1.0 Mbps')
      expect(formatBandwidth(1_500_000)).toBe('1.5 Mbps')
      expect(formatBandwidth(999_999_999)).toBe('1000.0 Mbps') // 999.999999 rounds to 1000.0
      expect(formatBandwidth(999_000_000)).toBe('999.0 Mbps')
    })

    test('formats values in Gbps range', () => {
      expect(formatBandwidth(1_000_000_000)).toBe('1.0 Gbps')
      expect(formatBandwidth(1_500_000_000)).toBe('1.5 Gbps')
      expect(formatBandwidth(10_000_000_000)).toBe('10.0 Gbps')
    })
  })

  describe('Boundary conditions', () => {
    test('handles boundary at 999 bps', () => {
      expect(formatBandwidth(999)).toBe('999.0 bps')
    })

    test('handles boundary at 1000 bps (1 Kbps)', () => {
      expect(formatBandwidth(1000)).toBe('1.0 Kbps')
    })

    test('handles boundary at 999,999 bps', () => {
      expect(formatBandwidth(999999)).toBe('1000.0 Kbps') // 999.999 rounds to 1000.0
      expect(formatBandwidth(999000)).toBe('999.0 Kbps')
    })

    test('handles boundary at 1,000,000 bps (1 Mbps)', () => {
      expect(formatBandwidth(1_000_000)).toBe('1.0 Mbps')
    })

    test('handles boundary at 999,999,999 bps', () => {
      expect(formatBandwidth(999_999_999)).toBe('1000.0 Mbps') // 999.999999 rounds to 1000.0
      expect(formatBandwidth(999_000_000)).toBe('999.0 Mbps')
    })

    test('handles boundary at 1,000,000,000 bps (1 Gbps)', () => {
      expect(formatBandwidth(1_000_000_000)).toBe('1.0 Gbps')
    })
  })

  describe('Decimal precision', () => {
    test('always shows one decimal place', () => {
      expect(formatBandwidth(100)).toBe('100.0 bps')
      expect(formatBandwidth(1234)).toBe('1.2 Kbps')
      expect(formatBandwidth(1_234_567)).toBe('1.2 Mbps')
      expect(formatBandwidth(1_234_567_890)).toBe('1.2 Gbps')
    })

    test('rounds to one decimal place correctly', () => {
      expect(formatBandwidth(1549)).toBe('1.5 Kbps') // 1.549 rounds to 1.5
      expect(formatBandwidth(1551)).toBe('1.6 Kbps') // 1.551 rounds to 1.6
    })
  })

  describe('Edge cases', () => {
    test('handles NaN input', () => {
      expect(formatBandwidth(NaN)).toBe('N/A')
    })

    test('handles Infinity input', () => {
      expect(formatBandwidth(Infinity)).toBe('N/A')
    })

    test('handles negative Infinity input', () => {
      expect(formatBandwidth(-Infinity)).toBe('N/A')
    })

    test('handles negative numbers', () => {
      // Mock console.warn to verify it's called
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
      
      expect(formatBandwidth(-100)).toBe('0.0 bps')
      expect(consoleWarnSpy).toHaveBeenCalledWith('Negative bandwidth value received:', -100)
      
      consoleWarnSpy.mockRestore()
    })

    test('handles very large numbers', () => {
      expect(formatBandwidth(100_000_000_000)).toBe('100.0 Gbps')
      expect(formatBandwidth(1_000_000_000_000)).toBe('1000.0 Gbps')
    })

    test('handles very small positive numbers', () => {
      expect(formatBandwidth(0.1)).toBe('0.1 bps')
      expect(formatBandwidth(0.01)).toBe('0.0 bps')
    })
  })

  describe('Real-world examples', () => {
    test('formats typical network speeds', () => {
      // Typical home internet speeds
      expect(formatBandwidth(100_000_000)).toBe('100.0 Mbps') // 100 Mbps
      expect(formatBandwidth(1_000_000_000)).toBe('1.0 Gbps') // 1 Gbps
      
      // Typical enterprise speeds
      expect(formatBandwidth(10_000_000_000)).toBe('10.0 Gbps') // 10 Gbps
      
      // Low bandwidth scenarios
      expect(formatBandwidth(56_000)).toBe('56.0 Kbps') // 56K modem
      expect(formatBandwidth(128_000)).toBe('128.0 Kbps') // ISDN
    })
  })
})
