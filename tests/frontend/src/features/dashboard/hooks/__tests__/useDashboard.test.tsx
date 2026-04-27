import React, { StrictMode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import type { DashboardData } from '@/features/dashboard/types'
import { useDashboardData } from '@/features/dashboard/hooks/useDashboard'
import { fetchDashboardData, searchDevices } from '@/features/dashboard/api/dashboard.api'

jest.mock('@/features/dashboard/api/dashboard.api', () => ({
  fetchDashboardData: jest.fn(),
  searchDevices: jest.fn(),
}))

const mockedFetchDashboardData = jest.mocked(fetchDashboardData)
const mockedSearchDevices = jest.mocked(searchDevices)

function DashboardHookProbe() {
  const { data, isInitialLoading, error } = useDashboardData()

  if (error) {
    return <div>{error}</div>
  }

  if (isInitialLoading || !data) {
    return <div>loading</div>
  }

  return <div>{data.stats[0]?.value ?? 'done'}</div>
}

describe('useDashboardData', () => {
  it('在严格模式下复用同一轮总览请求，避免开发环境重复拉取', async () => {
    let resolveRequest: ((value: DashboardData) => void) | undefined
    mockedSearchDevices.mockResolvedValue([])
    mockedFetchDashboardData.mockReturnValue(
      new Promise<DashboardData>((resolve) => {
        resolveRequest = resolve
      })
    )

    render(
      <StrictMode>
        <DashboardHookProbe />
      </StrictMode>
    )

    await waitFor(() => {
      expect(mockedFetchDashboardData).toHaveBeenCalledTimes(1)
    })

    resolveRequest?.({
      stats: [
        {
          title: '在线设备',
          value: '18',
          change: '+2',
          iconName: 'Monitor',
          iconColor: 'text-green-500',
          color: 'green',
        },
      ],
      recentAlerts: [],
      networkOverview: [],
      lastUpdated: new Date('2026-04-27T08:10:00.000Z'),
      sections: {
        stats: { ok: true },
        statsDevices: { ok: true },
        statsAlerts: { ok: true },
        statsBandwidth: { ok: true },
        recentAlerts: { ok: true },
        networkOverview: { ok: true },
      },
      permissions: {
        devices: true,
        alerts: true,
        monitoring: true,
      },
    })

    expect(await screen.findByText('18')).toBeInTheDocument()
  })
})
