import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActiveProblemsCard } from '@/features/monitoring/components/overview'
import {
  formatProblemMetricLabel,
  formatProblemMetricValue,
  getProblemSeverityMeta,
  isAlertActivelySnoozed,
} from '@/features/monitoring/components/overview/activeProblemHelpers'
import { extractDashboardV2Enrichment } from '@/features/monitoring/api/monitoring-v2-normalizer'
import { unsnoozeAlert } from '@/features/monitoring/api/monitoring-config.api'
import type { ActiveProblemItem } from '@/features/monitoring/types/zabbix-monitoring.types'

jest.mock('@/features/monitoring/api/monitoring-config.api', () => ({
  acknowledgeAlert: jest.fn(),
  snoozeAlert: jest.fn(),
  unsnoozeAlert: jest.fn(),
}))

describe('ActiveProblemsCard 与 activeProblemHelpers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('展示 open 告警、数量徽标、high/medium 严重级别标签与指标单位格式化', () => {
    const problems: ActiveProblemItem[] = [
      {
        alert_id: 101,
        device_id: 1,
        device_name: 'Core-SW-01',
        title: '核心交换机温度偏高',
        severity: 'high',
        status: 'open',
        metric_name: 'temperature',
        current_value: 78.4,
        threshold_value: 75,
        last_occurred: '2026-11-24T06:30:00Z',
      },
      {
        alert_id: 102,
        device_id: 2,
        device_name: 'Access-SW-02',
        title: '链路响应延迟升高',
        severity: 'medium',
        status: 'open',
        metric_name: 'ping_rtt_ms',
        current_value: 128.5,
        threshold_value: 100,
        last_occurred: 'not-a-valid-date',
      },
    ]

    render(
      <ActiveProblemsCard
        problems={problems}
        canReadAlerts
        canUpdateAlerts
      />
    )

    expect(screen.getByText('2 条')).toBeInTheDocument()
    expect(screen.getByText('高危')).toBeInTheDocument()
    expect(screen.getByText('警告')).toBeInTheDocument()
    expect(screen.getByText('Core-SW-01')).toBeInTheDocument()
    expect(screen.getByText('Access-SW-02')).toBeInTheDocument()
    expect(screen.getByText('指标 温度')).toBeInTheDocument()
    expect(screen.getByText('当前值 78.4°C')).toBeInTheDocument()
    expect(screen.getByText('阈值 75°C')).toBeInTheDocument()
    expect(screen.getByText('指标 响应延迟')).toBeInTheDocument()
    expect(screen.getByText('当前值 128.5 ms')).toBeInTheDocument()
    expect(screen.getByText('阈值 100 ms')).toBeInTheDocument()
    expect(screen.queryByText(/无效日期/)).not.toBeInTheDocument()
  })

  it('过期 snoozed_until 不再显示「已静默」，而是显示「临时静默」按钮', () => {
    const expiredAt = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const problems: ActiveProblemItem[] = [
      {
        alert_id: 201,
        device_id: 3,
        device_name: 'Dist-SW-03',
        title: 'CPU 使用率过高',
        severity: 'critical',
        status: 'open',
        metric_name: 'cpu_usage',
        current_value: 92.3,
        threshold_value: 90,
        snoozed_until: expiredAt,
        snooze_reason: '夜间批处理',
      },
    ]

    render(
      <ActiveProblemsCard
        problems={problems}
        canReadAlerts
        canUpdateAlerts
      />
    )

    expect(screen.queryByText('已静默')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '临时静默' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '取消静默' })).not.toBeInTheDocument()
  })

  it('有效期内 snoozed_until 显示「已静默」与「取消静默」，点击后防连点禁用并即时切换', async () => {
    const user = userEvent.setup()
    let resolveUnsnooze!: (value: { success: boolean; alert_id: string }) => void
    ;(unsnoozeAlert as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUnsnooze = resolve
        })
    )

    const futureAt = new Date(Date.now() + 4 * 3600 * 1000).toISOString()
    const problems: ActiveProblemItem[] = [
      {
        alert_id: 301,
        device_id: 4,
        device_name: 'Edge-RTR-04',
        title: '接口错包增长',
        severity: 'warning',
        status: 'open',
        metric_name: 'if_in_errors',
        current_value: 15,
        threshold_value: 10,
        snoozed_until: futureAt,
        snooze_reason: '等待运营商排查光衰',
      },
    ]

    render(
      <ActiveProblemsCard
        problems={problems}
        canReadAlerts
        canUpdateAlerts
      />
    )

    const snoozeBadge = screen.getByText('已静默')
    expect(snoozeBadge).toBeInTheDocument()
    expect(snoozeBadge).toHaveAttribute('title', expect.stringContaining('等待运营商排查光衰'))

    const unsnoozeBtn = screen.getByRole('button', { name: '取消静默' })
    await user.click(unsnoozeBtn)

    expect(unsnoozeAlert).toHaveBeenCalledTimes(1)
    expect(unsnoozeAlert).toHaveBeenCalledWith(301)
    expect(unsnoozeBtn).toBeDisabled()

    await user.click(unsnoozeBtn)
    expect(unsnoozeAlert).toHaveBeenCalledTimes(1)

    resolveUnsnooze({ success: true, alert_id: '301' })

    await waitFor(() => {
      expect(screen.queryByText('已静默')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: '临时静默' })).toBeInTheDocument()
  })

  it('suppressed_by 非空时渲染「维护静默」徽标并展示策略名称提示', () => {
    const problems: ActiveProblemItem[] = [
      {
        alert_id: 401,
        device_id: 5,
        device_name: 'Core-RTR-05',
        title: 'SNMP 连通性异常',
        severity: 'fatal',
        status: 'open',
        metric_name: 'snmp_reachable',
        current_value: 0,
        suppressed_by: '核心机房夜间割接',
      },
    ]

    render(
      <ActiveProblemsCard
        problems={problems}
        canReadAlerts
        canUpdateAlerts={false}
      />
    )

    const badge = screen.getByText('维护静默')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveAttribute('title', expect.stringContaining('核心机房夜间割接'))
  })

  it('extractDashboardV2Enrichment 保留 suppressed_by 与 snooze_reason 且默认 status 为 open', () => {
    const enrichment = extractDashboardV2Enrichment(
      {
        activeProblems: [
          {
            alert_id: 501,
            device_id: 9,
            device_name: 'SW-09',
            title: '硬件故障',
            severity: 'high',
            metric_name: 'hardware_fault_count',
            current_value: 2,
            suppressed_by: '  例行巡检窗口  ',
            snooze_reason: '  备件在途  ',
          },
          {
            alert_id: 502,
            device_id: 10,
            device_name: 'SW-10',
            title: '内存偏高',
            severity: 'medium',
            status: 'acknowledged',
            suppressed_by: '   ',
            snooze_reason: '',
          },
        ],
      },
      () => []
    )

    expect(enrichment.activeProblems).toHaveLength(2)
    expect(enrichment.activeProblems?.[0]).toMatchObject({
      alert_id: 501,
      status: 'open',
      suppressed_by: '例行巡检窗口',
      snooze_reason: '备件在途',
    })
    expect(enrichment.activeProblems?.[1]).toMatchObject({
      alert_id: 502,
      status: 'acknowledged',
      suppressed_by: undefined,
      snooze_reason: undefined,
    })
  })

  it('activeProblemHelpers 纯函数边界行为正确', () => {
    const now = new Date('2026-11-24T10:00:00Z').getTime()
    expect(isAlertActivelySnoozed(undefined, now)).toBe(false)
    expect(isAlertActivelySnoozed('invalid', now)).toBe(false)
    expect(isAlertActivelySnoozed('2026-11-24T10:00:00Z', now)).toBe(false)
    expect(isAlertActivelySnoozed('2026-11-24T10:00:01Z', now)).toBe(true)

    expect(getProblemSeverityMeta('critical').label).toBe('严重')
    expect(getProblemSeverityMeta('fatal').label).toBe('严重')
    expect(getProblemSeverityMeta('high').label).toBe('高危')
    expect(getProblemSeverityMeta('warning').label).toBe('警告')
    expect(getProblemSeverityMeta('medium').label).toBe('警告')
    expect(getProblemSeverityMeta('low').label).toBe('提示')
    expect(getProblemSeverityMeta('info').label).toBe('提示')

    expect(formatProblemMetricLabel('cpu_usage')).toBe('CPU 使用率')
    expect(formatProblemMetricLabel('memory_usage')).toBe('内存使用率')
    expect(formatProblemMetricLabel('utilization_in')).toBe('接口利用率')
    expect(formatProblemMetricLabel('ping_loss_pct')).toBe('丢包率')
    expect(formatProblemMetricLabel('hardware_fault_count')).toBe('硬件故障数')
    expect(formatProblemMetricLabel(' custom_metric ')).toBe('custom_metric')
    expect(formatProblemMetricLabel('  ')).toBe('')

    expect(formatProblemMetricValue(85.25, 'cpu_usage')).toBe('85.25%')
    expect(formatProblemMetricValue(72.5, 'temperature')).toBe('72.5°C')
    expect(formatProblemMetricValue(42.3, 'icmp.rtt')).toBe('42.3 ms')
    expect(formatProblemMetricValue(3, 'hardware_fault_count')).toBe('3 个')
    expect(formatProblemMetricValue(Number.NaN, 'cpu_usage')).toBe('--')
    expect(formatProblemMetricValue(Number.POSITIVE_INFINITY, 'temperature')).toBe('--')
  })
})
