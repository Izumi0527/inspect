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

jest.mock('@/features/monitoring/components/shared/MonitoringTimeRangeControl', () => ({
  MonitoringTimeRangeControl: ({
    timeRange,
    onTimeRangeChange,
  }: {
    timeRange: string
    onTimeRangeChange: (value: string) => void
  }) => (
    <button type="button" aria-label="监控时间范围" onClick={() => onTimeRangeChange('7d')}>
      时间范围:{timeRange}
    </button>
  ),
}))

jest.mock('@/components/atoms', () => ({
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

describe('MonitoringHeaderActions（头部精简与时间范围控件）', () => {
  it('头部渲染 MonitoringTimeRangeControl，排在设备筛选之前，点击可调用 page.setTimeRange', async () => {
    const setTimeRange = jest.fn()
    const user = userEvent.setup()
    render(<MonitoringHeaderActions page={buildPage({ timeRange: '6h', setTimeRange })} />)

    const timeRangeTrigger = screen.getByRole('button', { name: '监控时间范围' })
    const deviceFilter = screen.getByText('设备筛选')
    expect(timeRangeTrigger).toHaveTextContent('时间范围:6h')
    expect(timeRangeTrigger.compareDocumentPosition(deviceFilter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await user.click(timeRangeTrigger)
    expect(setTimeRange).toHaveBeenCalledWith('7d')
  })

  it('不渲染 WS 状态与数据新鲜度徽章字样（即使 wsHealth=disconnected 且数据陈旧）', () => {
    render(
      <MonitoringHeaderActions
        page={buildPage({
          wsHealth: 'disconnected',
          isDataStale: true,
          apiOkButDataStale: true,
          dataAgeLabel: '15 分钟',
        })}
      />
    )

    for (const forbidden of ['已连接', '连接不稳', '已断开', '数据已更新', '无新数据', '未更新']) {
      expect(screen.queryByText(new RegExp(forbidden))).not.toBeInTheDocument()
    }
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
