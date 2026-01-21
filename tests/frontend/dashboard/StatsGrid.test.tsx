/**
 * Unit tests for StatsGrid component
 * Tests bandwidth formatting with unit field validation
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { StatsGrid } from '../StatsGrid'
import { DashboardStat } from '../../types'

// Don't mock formatBandwidth - use the real implementation
describe('StatsGrid', () => {
  describe('Bandwidth formatting with unit field', () => {
    it('should format bandwidth value when unit is "bps"', () => {
      const stats: DashboardStat[] = [
        {
          title: '网络流量',
          value: '1500000', // 1.5 Mbps in bps
          change: '+5%',
          iconName: 'Activity',
          iconColor: 'text-blue-500',
          color: 'blue',
          unit: 'bps'
        }
      ]

      render(<StatsGrid stats={stats} />)
      
      // Should display formatted bandwidth
      expect(screen.getByText('1.5 Mbps')).toBeInTheDocument()
    })

    it('should not format value when unit field is missing', () => {
      const stats: DashboardStat[] = [
        {
          title: '在线设备',
          value: '42',
          change: '+2',
          iconName: 'Monitor',
          iconColor: 'text-green-500',
          color: 'green'
          // No unit field
        }
      ]

      render(<StatsGrid stats={stats} />)
      
      // Should display raw value
      expect(screen.getByText('42')).toBeInTheDocument()
    })

    it('should handle N/A bandwidth values', () => {
      const stats: DashboardStat[] = [
        {
          title: '网络流量',
          value: 'N/A',
          change: '',
          iconName: 'Activity',
          iconColor: 'text-blue-500',
          color: 'blue',
          unit: 'bps'
        }
      ]

      render(<StatsGrid stats={stats} />)
      
      // Should display N/A as-is
      expect(screen.getByText('N/A')).toBeInTheDocument()
    })

    it('should warn about unexpected unit values', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
      
      const stats: DashboardStat[] = [
        {
          title: '测试',
          value: '100',
          change: '',
          iconName: 'Activity',
          iconColor: 'text-blue-500',
          color: 'blue',
          unit: 'invalid-unit'
        }
      ]

      render(<StatsGrid stats={stats} />)
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Unexpected unit field: invalid-unit, expected "bps" or undefined'
      )
      
      consoleWarnSpy.mockRestore()
    })

    it('should handle multiple stats with mixed units', () => {
      const stats: DashboardStat[] = [
        {
          title: '在线设备',
          value: '42',
          change: '+2',
          iconName: 'Monitor',
          iconColor: 'text-green-500',
          color: 'green'
        },
        {
          title: '网络流量',
          value: '1000000000', // 1 Gbps
          change: '+10%',
          iconName: 'Activity',
          iconColor: 'text-blue-500',
          color: 'blue',
          unit: 'bps'
        },
        {
          title: '系统负载',
          value: '85.5%',
          change: '-2%',
          iconName: 'Server',
          iconColor: 'text-purple-500',
          color: 'purple'
        }
      ]

      render(<StatsGrid stats={stats} />)
      
      // Check all values are displayed correctly
      expect(screen.getByText('42')).toBeInTheDocument()
      expect(screen.getByText('1.0 Gbps')).toBeInTheDocument()
      expect(screen.getByText('85.5%')).toBeInTheDocument()
    })
  })

  describe('Loading state', () => {
    it('should render loading skeleton when loading is true', () => {
      const { container } = render(<StatsGrid stats={[]} loading={true} />)
      
      // Should render 4 skeleton cards
      const skeletons = container.querySelectorAll('.animate-pulse')
      expect(skeletons).toHaveLength(4)
    })
  })

  describe('Edge cases', () => {
    it('should handle invalid bps values gracefully', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
      
      const stats: DashboardStat[] = [
        {
          title: '网络流量',
          value: 'invalid-number',
          change: '',
          iconName: 'Activity',
          iconColor: 'text-blue-500',
          color: 'blue',
          unit: 'bps'
        }
      ]

      render(<StatsGrid stats={stats} />)
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Invalid bps value received:',
        'invalid-number'
      )
      
      // Should display the original value when parsing fails
      expect(screen.getByText('invalid-number')).toBeInTheDocument()
      
      consoleWarnSpy.mockRestore()
    })

    it('should handle very large bandwidth values', () => {
      const stats: DashboardStat[] = [
        {
          title: '网络流量',
          value: '100000000000', // 100 Gbps
          change: '',
          iconName: 'Activity',
          iconColor: 'text-blue-500',
          color: 'blue',
          unit: 'bps'
        }
      ]

      render(<StatsGrid stats={stats} />)
      
      expect(screen.getByText('100.0 Gbps')).toBeInTheDocument()
    })

    it('should handle very small bandwidth values', () => {
      const stats: DashboardStat[] = [
        {
          title: '网络流量',
          value: '500', // 500 bps
          change: '',
          iconName: 'Activity',
          iconColor: 'text-blue-500',
          color: 'blue',
          unit: 'bps'
        }
      ]

      render(<StatsGrid stats={stats} />)
      
      expect(screen.getByText('500.0 bps')).toBeInTheDocument()
    })
  })
})
