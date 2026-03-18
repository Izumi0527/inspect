import React from 'react'
import { render, screen } from '@testing-library/react'

import { MonitoringDashboard } from '@/features/settings/components/monitoring/MonitoringDashboard'

const mockUseSystemMonitoring = jest.fn()

jest.mock('@/features/settings/hooks/useSystemMonitoring', () => ({
  useSystemMonitoring: (...args: unknown[]) => mockUseSystemMonitoring(...args),
}))

describe('MonitoringDashboard 错误态', () => {
  beforeEach(() => {
    mockUseSystemMonitoring.mockReturnValue({
      metrics: undefined,
      services: [],
      system: undefined,
      history: undefined,
      timestamp: undefined,
      isLoading: false,
      error: new Error('boom'),
    })
  })

  it('加载失败时应展示明确错误提示', () => {
    render(<MonitoringDashboard />)

    expect(screen.getByText('加载监控数据失败')).toBeInTheDocument()
  })
})

