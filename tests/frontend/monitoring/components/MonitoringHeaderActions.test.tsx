import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MonitoringHeaderActions } from '@/features/monitoring/components/shared/MonitoringHeaderActions'
import type { UseMonitoringPageResult } from '@/features/monitoring/hooks/useMonitoringPage'

jest.mock('@/features/monitoring/components/ReportExportButton', () => ({
  ReportExportButton: () => <div>导出按钮</div>,
}))

jest.mock('@/features/monitoring/components/shared/DeviceFilterSelect', () => ({
  DeviceFilterSelect: () => <div>设备筛选</div>,
}))

jest.mock('@/components/atoms', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode
    onClick?: React.MouseEventHandler<HTMLButtonElement>
    disabled?: boolean
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}))

const buildPage = (overrides: Partial<UseMonitoringPageResult> = {}): UseMonitoringPageResult => ({
  timeRange: '1h',
  setTimeRange: jest.fn(),
  timeRangeLabel: '近1小时',
  deviceIds: [],
  setDeviceIds: jest.fn(),
  wsHealth: 'connected',
  pageVisible: true,
  canExportReport: false,
  canReadAlerts: true,
  envelope: undefined,
  data: undefined,
  isLoading: false,
  error: null,
  refetch: jest.fn(),
  isRefetching: false,
  lastUpdateLabel: '2026-03-31 10:00:00',
  isDataStale: false,
  dataAgeLabel: '1 分钟',
  apiOkButDataStale: false,
  hasEffectivePartialFailure: false,
  effectiveFailedSectionLabels: [],
  ...overrides,
})

describe('MonitoringHeaderActions（时间范围控件已迁至页内筛选栏）', () => {
  it('头部不再渲染「监控时间范围」下拉，避免与筛选栏出现两个入口', () => {
    render(<MonitoringHeaderActions page={buildPage()} />)

    expect(screen.queryByRole('combobox', { name: '监控时间范围' })).not.toBeInTheDocument()
  })

  it('保留设备筛选与刷新按钮，刷新触发 refetch', async () => {
    const refetch = jest.fn()
    const user = userEvent.setup()
    render(<MonitoringHeaderActions page={buildPage({ refetch })} />)

    expect(screen.getByText('设备筛选')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /刷新/ }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('导出入口按权限显隐', () => {
    const { unmount } = render(<MonitoringHeaderActions page={buildPage({ canExportReport: false })} />)
    expect(screen.queryByText('导出按钮')).not.toBeInTheDocument()
    unmount()

    render(<MonitoringHeaderActions page={buildPage({ canExportReport: true })} />)
    expect(screen.getByText('导出按钮')).toBeInTheDocument()
  })
})
