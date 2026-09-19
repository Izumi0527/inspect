import React from 'react'
import { render, screen } from '@testing-library/react'
import { AlertStatsGrid } from '@/features/alerts/components/AlertStatsGrid'
import type { AlertStats } from '@/features/alerts/types'

const statsWithTrends: AlertStats = {
  total: 88,
  critical: 0,
  warning: 0,
  info: 0,
  active: 0,
  acknowledged: 0,
  resolved: 88,
  byCategory: {},
  byDevice: {},
  trends: { today: 0, yesterday: 7, change: -100 },
}

describe('AlertStatsGrid', () => {
  it('即使后端返回了 trends，也不再渲染「今日新增 / 昨日」趋势行', () => {
    render(<AlertStatsGrid stats={statsWithTrends} />)

    expect(screen.getByText('总告警')).toBeInTheDocument()
    expect(screen.queryByText(/今日新增/)).not.toBeInTheDocument()
    expect(screen.queryByText(/昨日/)).not.toBeInTheDocument()
  })
})
