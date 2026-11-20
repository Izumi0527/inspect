import React, { createRef } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  SyncedCrosshairProvider,
  HealthDistributionBar,
  GroupHealthStrip,
  TopNRankingCard,
  ActiveProblemsCard,
} from '@/features/monitoring/components/overview'
import { PerformanceSection } from '@/features/monitoring/components/sections/PerformanceSection'
import { TemperatureChart } from '@/features/monitoring/components/charts/TemperatureChart'
import { getMonitoringTopN } from '@/features/monitoring/api/monitoring-hosts.api'
import {
  acknowledgeAlert,
  snoozeAlert,
  unsnoozeAlert,
} from '@/features/monitoring/api/monitoring-config.api'
import type { SystemPerformanceDataPoint, TemperatureDataPoint } from '@/features/monitoring/types'
import type {
  ActiveProblemItem,
  AggregateTrendPoint,
  DashboardAnnotation,
  ThresholdSummary,
} from '@/features/monitoring/types/zabbix-monitoring.types'

jest.mock('@/features/monitoring/api/monitoring-hosts.api', () => ({
  getMonitoringTopN: jest.fn(),
}))

jest.mock('@/features/monitoring/api/monitoring-config.api', () => ({
  acknowledgeAlert: jest.fn(),
  snoozeAlert: jest.fn(),
  unsnoozeAlert: jest.fn(),
}))

beforeAll(() => {
  Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
    configurable: true,
    value: () => 40,
  })
})

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('总览大屏大规模降维升级 (Task 9)', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-11-20T12:15:00Z').getTime())
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('HealthDistributionBar 渲染 5 档分布并点击色段跳转设备监控过滤状态', async () => {
    const user = userEvent.setup()
    const onSelectBucket = jest.fn()
    render(
      <HealthDistributionBar
        distribution={{ normal: 10, elevated: 3, overloaded: 2, offline: 1, maintenance: 1 }}
        onSelectBucket={onSelectBucket}
      />
    )

    expect(screen.getByText('全网健康与负载分布')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '过载 2 台' }))
    expect(onSelectBucket).toHaveBeenCalledWith('critical')

    await user.click(screen.getByRole('button', { name: '离线 1 台' }))
    expect(onSelectBucket).toHaveBeenCalledWith('offline')
  })

  it('GroupHealthStrip 点击分组卡片回调聚焦该分组', async () => {
    const user = userEvent.setup()
    const onSelectGroup = jest.fn()
    render(
      <GroupHealthStrip
        activeGroupId={null}
        onSelectGroup={onSelectGroup}
        groups={[
          {
            group_id: 7,
            group_name: '核心骨干网',
            total_devices: 8,
            online_devices: 7,
            offline_devices: 1,
            warning_devices: 0,
            max_cpu: 72.5,
            max_memory: 64.0,
          },
        ]}
      />
    )

    await user.click(screen.getByText('核心骨干网'))
    expect(onSelectGroup).toHaveBeenCalledWith(7)
  })

  it('设备 >5 台默认展示全网聚合态势(Mean/P95/Max)，支持对比昨日同期与切换精选设备对比', async () => {
    const user = userEvent.setup()
    const onToggleCompareYesterday = jest.fn()

    const devices: SystemPerformanceDataPoint['devices'] = {}
    for (let i = 1; i <= 6; i++) {
      devices[`SW-0${i}`] = { cpu: 20 + i * 5, memory: 40 + i * 3 }
    }
    const perf: SystemPerformanceDataPoint[] = [
      { timestamp: '2026-11-20T12:00:00Z', devices },
      { timestamp: '2026-11-20T12:05:00Z', devices },
    ]
    const agg: AggregateTrendPoint[] = [
      {
        timestamp: '2026-11-20T12:00:00Z',
        mean_cpu: 37.5,
        p95_cpu: 50,
        max_cpu: 50,
        mean_memory: 50.5,
        p95_memory: 58,
        max_memory: 58,
        peak_device_id: 6,
        peak_device_name: 'SW-06',
      },
      {
        timestamp: '2026-11-20T12:05:00Z',
        mean_cpu: 40,
        p95_cpu: 52,
        max_cpu: 52,
        mean_memory: 52,
        p95_memory: 60,
        max_memory: 60,
        peak_device_id: 6,
        peak_device_name: 'SW-06',
      },
    ]
    const yesterday: SystemPerformanceDataPoint[] = [
      { timestamp: '2026-11-20T12:00:00Z', devices: { 'SW-01': { cpu: 25, memory: 35 } } },
      { timestamp: '2026-11-20T12:05:00Z', devices: { 'SW-01': { cpu: 28, memory: 38 } } },
    ]
    const annotations: DashboardAnnotation[] = [
      { timestamp: '2026-11-20T12:05:00Z', type: 'reboot', title: 'SW-06 重启' },
      { timestamp: '2026-11-20T12:05:00Z', type: 'alert', title: 'CPU 超限告警' },
    ]

    const { container } = render(
      <SyncedCrosshairProvider>
        <PerformanceSection
          sectionRef={createRef<HTMLDivElement>()}
          chartsInView
          sectionSystemPerformance={{ ok: true }}
          sectionTemperature={{ ok: true }}
          systemPerformance={perf}
          temperatureHistory={[]}
          timeRange="1h"
          onRetry={jest.fn()}
          aggregateTrends={agg}
          yesterdayBaseline={yesterday}
          annotations={annotations}
          compareYesterday
          canReadAlerts
          onToggleCompareYesterday={onToggleCompareYesterday}
        />
      </SyncedCrosshairProvider>
    )

    expect(await screen.findByLabelText('全网聚合态势图')).toBeInTheDocument()
    expect(container.querySelector('[data-series="aggregate:cpu-mean"]')).toBeInTheDocument()
    expect(container.querySelector('[data-series="aggregate:cpu-p95"]')).toBeInTheDocument()
    expect(container.querySelector('[data-series="aggregate:cpu-envelope"]')).toBeInTheDocument()
    expect(container.querySelector('[data-series="aggregate:yesterday-cpu"]')).toBeInTheDocument()
    expect(container.querySelector('[data-annotation-type="reboot"]')).toBeInTheDocument()
    expect(container.querySelector('[data-annotation-type="alert"]')).toBeInTheDocument()

    await user.click(screen.getByRole('switch', { name: '对比昨日同期' }))
    expect(onToggleCompareYesterday).toHaveBeenCalledWith(false)

    await user.click(screen.getByRole('button', { name: '精选设备对比' }))
    expect(await screen.findByLabelText('系统性能趋势图')).toBeInTheDocument()
  })

  it('TemperatureChart 消费动态 Warn/Crit 双虚线与标注，移除硬编码 75，且多图十字游标联动', () => {
    const tempData: TemperatureDataPoint[] = [
      { timestamp: '2026-11-20T12:00:00Z', devices: { 'SW-01': 68 } },
      { timestamp: '2026-11-20T12:05:00Z', devices: { 'SW-01': 72 } },
    ]
    const thresholds: ThresholdSummary = {
      cpu: { warn: 80, crit: 90 },
      memory: { warn: 80, crit: 90 },
      temperature: { warn: 65, crit: 82 },
    }
    const annotations: DashboardAnnotation[] = [
      { timestamp: '2026-11-20T12:05:00Z', type: 'maintenance', title: '割接窗口' },
      { timestamp: '2026-11-20T12:05:00Z', type: 'alert', title: '高温告警' },
    ]

    const { container } = render(
      <SyncedCrosshairProvider>
        <TemperatureChart
          data={tempData}
          timeRange="1h"
          warnThreshold={thresholds.temperature.warn}
          critThreshold={thresholds.temperature.crit}
          annotations={annotations}
          canReadAlerts={false}
        />
        <TemperatureChart
          data={tempData}
          timeRange="1h"
          warnThreshold={thresholds.temperature.warn}
          critThreshold={thresholds.temperature.crit}
        />
      </SyncedCrosshairProvider>
    )

    expect(screen.queryByText('75°C')).not.toBeInTheDocument()
    expect(screen.getAllByText('65°C').length).toBeGreaterThan(0)
    expect(screen.getAllByText('82°C').length).toBeGreaterThan(0)
    expect(container.querySelector('[data-reference-line="temp-warn"]')).toBeInTheDocument()
    expect(container.querySelector('[data-reference-line="temp-crit"]')).toBeInTheDocument()
    // 缺 alerts:read 时仅展示维护标注，不渲染 alert 标注
    expect(container.querySelector('[data-annotation-type="maintenance"]')).toBeInTheDocument()
    expect(container.querySelector('[data-annotation-type="alert"]')).not.toBeInTheDocument()

    // 悬停第一张图时，第二张图同步渲染十字虚线
    const overlays = container.querySelectorAll('svg rect[fill="transparent"]')
    fireEvent.mouseMove(overlays[0], { clientX: 659, clientY: 100 })
    expect(container.querySelectorAll('[data-testid="synced-crosshair-line"]').length).toBe(2)
  })

  it('TopNRankingCard 支持指标切换与点击行下钻主机抽屉', async () => {
    const user = userEvent.setup()
    const onSelectHost = jest.fn()
    ;(getMonitoringTopN as jest.Mock).mockResolvedValue({
      metric: 'cpu',
      unit: '%',
      items: [
        {
          device_id: 18,
          device_name: 'Core-SW-18',
          ip_address: '10.0.0.18',
          status: 'online',
          value: 88.5,
          unit: '%',
        },
      ],
    })

    renderWithQuery(<TopNRankingCard groupId={null} onSelectHost={onSelectHost} />)

    expect(await screen.findByText('Core-SW-18')).toBeInTheDocument()
    await user.click(screen.getByText('Core-SW-18'))
    expect(onSelectHost).toHaveBeenCalledWith(18)

    await user.click(screen.getByRole('button', { name: '温度' }))
    await waitFor(() => {
      expect(getMonitoringTopN).toHaveBeenCalledWith('temperature', 5, null)
    })
  })

  it('ActiveProblemsCard 支持接手确认、单条临时静默 (2h/8h/24h) 与取消静默', async () => {
    const user = userEvent.setup()
    ;(acknowledgeAlert as jest.Mock).mockResolvedValue({ success: true })
    ;(snoozeAlert as jest.Mock).mockResolvedValue({
      success: true,
      alert_id: '501',
      snoozed_until: '2026-11-20T20:00:00Z',
      snoozed_by: 'admin',
      snooze_reason: '等待备件',
    })
    ;(unsnoozeAlert as jest.Mock).mockResolvedValue({ success: true, alert_id: '501' })

    const problems: ActiveProblemItem[] = [
      {
        alert_id: 501,
        device_id: 18,
        device_name: 'Core-SW-18',
        title: '温度过高告警',
        severity: 'critical',
        status: 'active',
        current_value: 86,
        threshold_value: 80,
      },
    ]

    render(
      <ActiveProblemsCard
        problems={problems}
        canReadAlerts
        canUpdateAlerts
      />
    )

    expect(screen.getByRole('link', { name: '详情' })).toHaveAttribute(
      'href',
      '/alerts?id=501'
    )

    // 接手确认
    await user.click(screen.getByRole('button', { name: '接手确认' }))
    await user.click(screen.getByRole('button', { name: '确认接手' }))
    await waitFor(() => {
      expect(acknowledgeAlert).toHaveBeenCalledWith(501, {})
    })
    expect(screen.getByText('已接手')).toBeInTheDocument()

    // 单条临时静默 (8h)
    await user.click(screen.getByRole('button', { name: '临时静默' }))
    expect(screen.getByText(/仅静默当前这一条告警，不影响本机其他告警/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '8h' }))
    await user.type(screen.getByPlaceholderText(/光模块备件/), '等待备件')
    await user.click(screen.getByRole('button', { name: '静默 8h' }))

    await waitFor(() => {
      expect(snoozeAlert).toHaveBeenCalledWith(501, {
        duration_hours: 8,
        reason: '等待备件',
      })
    })
    expect(screen.getByText('已静默')).toBeInTheDocument()

    // 取消静默
    await user.click(screen.getByRole('button', { name: '取消静默' }))
    await waitFor(() => {
      expect(unsnoozeAlert).toHaveBeenCalledWith(501)
    })
  })
})
