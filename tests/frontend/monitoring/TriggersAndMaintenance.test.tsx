import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TriggersTab } from '@/features/monitoring/components/triggers'
import {
  formatTriggerNaturalSummary,
  normalizeTriggerMetricName,
  resolveMetricMeta,
  triggerFormSchema,
} from '@/features/monitoring/components/triggers/triggerHelpers'
import { MaintenanceTab } from '@/features/monitoring/components/maintenance'
import {
  datetimeLocalToIsoInTimezone,
  formatIsoInTimezone,
  formatMaintenanceWindowSchedule,
  getMaintenanceLifecycleStatus,
  toDatetimeLocalValue,
} from '@/features/monitoring/components/maintenance/maintenanceHelpers'
import { useMonitoringHosts } from '@/features/monitoring/hooks/useMonitoringHosts'
import * as configApi from '@/features/monitoring/api/monitoring-config.api'
import { getMonitoringHosts } from '@/features/monitoring/api/monitoring-hosts.api'
import { usePermission } from '@/lib/contexts/auth-context'
import { Permission } from '@/lib/types/auth.types'
import { useMonitoringV2 } from '@/features/monitoring/hooks/useMonitoringV2'
import { useMonitoringDevices } from '@/features/monitoring/hooks/useMonitoringDevices'
import { getDeviceGroups } from '@/features/devices/api/devices.api'
import type {
  MaintenanceView,
  TriggerRule,
} from '@/features/monitoring/types/zabbix-monitoring.types'

jest.mock('@/components/ui/select', () =>
  require('./components/helpers/selectMock').createSelectMock()
)

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: jest.fn(),
}))

jest.mock('@/features/monitoring/hooks/useMonitoringV2', () => ({
  useMonitoringV2: jest.fn(),
}))

jest.mock('@/features/monitoring/hooks/useMonitoringDevices', () => ({
  useMonitoringDevices: jest.fn(),
}))

jest.mock('@/features/devices/api/devices.api', () => ({
  DEVICE_GROUPS_QUERY_KEY: ['device-groups'],
  getDeviceGroups: jest.fn(),
  bulkDeviceAction: jest.fn(),
}))

jest.mock('@/features/monitoring/api/monitoring-hosts.api', () => ({
  getMonitoringHosts: jest.fn(),
  pinMonitoringDevice: jest.fn(),
  unpinMonitoringDevice: jest.fn(),
  batchPinMonitoringDevices: jest.fn(),
}))

jest.mock('@/features/monitoring/api/monitoring-config.api', () => ({
  listMonitoringTriggers: jest.fn(),
  createMonitoringTrigger: jest.fn(),
  updateMonitoringTrigger: jest.fn(),
  deleteMonitoringTrigger: jest.fn(),
  toggleMonitoringTrigger: jest.fn(),
  listMonitoringMaintenances: jest.fn(),
  getActiveMonitoringMaintenances: jest.fn(),
  createMonitoringMaintenance: jest.fn(),
  updateMonitoringMaintenance: jest.fn(),
  deleteMonitoringMaintenance: jest.fn(),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return {
    queryClient,
    Wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
    renderWithClient: (ui: React.ReactElement) =>
      render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
  }
}

function buildTriggerRule(overrides: Partial<TriggerRule> = {}): TriggerRule {
  return {
    id: '401',
    name: '核心链路延迟过高',
    enabled: true,
    is_active: true,
    severity: 'warning',
    category: 'performance',
    metric_name: 'response_time',
    operator: '>',
    condition: 'gt',
    threshold: 120,
    threshold_value: 120,
    duration: 300,
    device_types: [],
    device_groups: [10],
    specific_devices: [101, 102],
    notify_email: true,
    notify_websocket: true,
    email_enabled: true,
    webhook_enabled: true,
    email_recipients: [],
    cooldown_minutes: 20,
    expression_mode: 'threshold',
    recovery_operator: '<',
    recovery_threshold: null,
    nodata_seconds: 0,
    dependency_mode: 'none',
    depends_on_device_id: null,
    entity_filter_regex: '',
    tags_json: {},
    ...overrides,
  }
}

function buildMaintenanceWindow(overrides: Partial<MaintenanceView> = {}): MaintenanceView {
  return {
    id: 501,
    name: '核心路由板卡升级',
    description: '凌晨业务低峰期升级主控板卡',
    mode: 'collect_silence',
    schedule_type: 'once',
    start_time: '2026-11-20T14:00:00Z',
    end_time: '2026-11-20T18:00:00Z',
    timezone: 'Asia/Shanghai',
    enabled: true,
    created_by: 'admin',
    created_at: '2026-11-20T08:00:00Z',
    updated_at: '2026-11-20T08:00:00Z',
    recurrence: {},
    targets: [{ id: 1, maintenance_id: 501, target_type: 'device_group', target_id: 10 }],
    is_active: false,
    ...overrides,
  }
}

describe('Triggers 与 Maintenance 深度修复回归测试', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(usePermission as jest.Mock).mockReturnValue(true)
    ;(useMonitoringDevices as jest.Mock).mockReturnValue({
      data: [
        { id: 101, name: 'Core-SW-01', ipAddress: '10.0.0.1', status: 'online', isMonitored: true },
        { id: 102, name: 'Access-SW-02', ipAddress: '10.0.0.2', status: 'online', isMonitored: true },
      ],
      isLoading: false,
    })
    ;(getDeviceGroups as jest.Mock).mockResolvedValue([
      { id: 10, name: '核心骨干网', device_count: 5, online_count: 5, alert_count: 0 },
      { id: 11, name: '汇聚接入层', device_count: 12, online_count: 12, alert_count: 0 },
    ])
    ;(useMonitoringV2 as jest.Mock).mockReturnValue({
      data: {
        data: {
          notificationChannelSummary: [
            { channel: 'email', enabled: true, configured: true },
          ],
        },
      },
    })
    ;(getMonitoringHosts as jest.Mock).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
      total_pages: 1,
      limitedByPermission: false,
      permissions: {
        alerts: { allowed: true },
        inspections: { allowed: true },
        logs: { allowed: true },
      },
    })
  })

  describe('triggerHelpers 指标映射、0值处理与跨字段校验', () => {
    it('完整映射 response_time / uptime / flap_count_1h 等全部别名并输出通俗中文', () => {
      expect(normalizeTriggerMetricName('response_time')).toBe('response_time')
      expect(normalizeTriggerMetricName('ping_rtt_ms')).toBe('response_time')
      expect(normalizeTriggerMetricName('icmp.rtt')).toBe('response_time')
      expect(normalizeTriggerMetricName('ping_loss_pct')).toBe('packet_loss')
      expect(normalizeTriggerMetricName('utilization_in')).toBe('utilization_in')
      expect(normalizeTriggerMetricName('utilization_out')).toBe('utilization_out')
      expect(normalizeTriggerMetricName('sys_uptime')).toBe('uptime')
      expect(normalizeTriggerMetricName('if_flap_count_1h')).toBe('flap_count_1h')

      expect(resolveMetricMeta('response_time')).toEqual({ label: 'Ping 响应延迟', unit: 'ms' })
      expect(resolveMetricMeta('uptime')).toEqual({ label: '设备连续运行时长', unit: '秒' })
      expect(resolveMetricMeta('flap_count_1h')).toEqual({ label: '端口 1 小时闪断次数', unit: '次' })
      expect(resolveMetricMeta('utilization_in')).toEqual({ label: '端口入向带宽利用率', unit: '%' })
      expect(resolveMetricMeta('utilization_out')).toEqual({ label: '端口出向带宽利用率', unit: '%' })

      expect(
        formatTriggerNaturalSummary({
          expression_mode: 'threshold',
          metric_name: 'response_time',
          operator: '>',
          threshold_value: 150,
          duration: 60,
          severity: 'warning',
        })
      ).toContain('Ping 响应延迟')

      expect(
        formatTriggerNaturalSummary({
          expression_mode: 'threshold',
          metric_name: 'uptime',
          operator: '<',
          threshold_value: 60,
          duration: 0,
          severity: 'critical',
        })
      ).toContain('设备连续运行时长')

      // 0 值不被 || 兜底覆盖
      expect(
        formatTriggerNaturalSummary({
          expression_mode: 'nodata',
          metric_name: 'cpu_usage',
          operator: '>',
          threshold_value: 0,
          duration: 0,
          nodata_seconds: 0,
          severity: 'warning',
        })
      ).toContain('立即未上报新数据')

      expect(
        formatTriggerNaturalSummary({
          expression_mode: 'if_flap',
          metric_name: 'flap_count_1h',
          operator: '>=',
          threshold_value: 0,
          duration: 0,
          severity: 'warning',
        })
      ).toContain('达到 0 次')
    })

    it('校验 hysteresis 必填恢复阈值与方向合理性，以及 manual_device 必填父设备', () => {
      const baseValid = {
        name: '温度滞后告警',
        severity: 'warning' as const,
        expression_mode: 'hysteresis' as const,
        metric_name: 'temperature',
        operator: '>' as const,
        threshold_value: 75,
        duration: 300,
        recovery_operator: '<' as const,
        recovery_threshold: 70,
        dependency_mode: 'none' as const,
      }

      const okParsed = triggerFormSchema.parse(baseValid)
      expect(okParsed.cooldown_minutes).toBe(15)

      // 缺少 recovery_threshold（空字符串不得被静默转成 0）
      const missingRec = triggerFormSchema.safeParse({
        ...baseValid,
        recovery_threshold: '',
      })
      expect(missingRec.success).toBe(false)

      // > 触发搭配 < 恢复，但恢复阈值 >= 触发阈值
      const invalidUpperHyst = triggerFormSchema.safeParse({
        ...baseValid,
        operator: '>',
        threshold_value: 75,
        recovery_operator: '<',
        recovery_threshold: 80,
      })
      expect(invalidUpperHyst.success).toBe(false)

      // < 触发搭配 > 恢复，但恢复阈值 <= 触发阈值
      const invalidLowerHyst = triggerFormSchema.safeParse({
        ...baseValid,
        operator: '<',
        threshold_value: 20,
        recovery_operator: '>',
        recovery_threshold: 15,
      })
      expect(invalidLowerHyst.success).toBe(false)

      // manual_device 必须选择有效正整数父设备
      const missingParent = triggerFormSchema.safeParse({
        ...baseValid,
        dependency_mode: 'manual_device',
        depends_on_device_id: null,
      })
      expect(missingParent.success).toBe(false)

      const validParent = triggerFormSchema.safeParse({
        ...baseValid,
        dependency_mode: 'manual_device',
        depends_on_device_id: 101,
      })
      expect(validParent.success).toBe(true)
    })
  })

  describe('TriggersTab 权限门控、信息展示、二次确认与 uptime_drop 提交', () => {
    it('按 SYSTEM_CONFIG 门控通知渠道链接，展示冷却/渠道/适用范围并支持删除二次确认', async () => {
      const user = userEvent.setup()
      const rule = buildTriggerRule()
      ;(configApi.listMonitoringTriggers as jest.Mock).mockResolvedValue([rule])
      ;(configApi.deleteMonitoringTrigger as jest.Mock).mockResolvedValue(undefined)

      // 无 SYSTEM_CONFIG 权限时隐藏「配置通知渠道」链接
      ;(usePermission as jest.Mock).mockImplementation((perm: Permission) => {
        if (perm === Permission.SYSTEM_CONFIG) return false
        return true
      })

      const { renderWithClient } = createWrapper()
      renderWithClient(<TriggersTab />)

      expect(await screen.findByText('核心链路延迟过高')).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /配置通知渠道/ })).not.toBeInTheDocument()
      expect(screen.getByText('Ping 响应延迟')).toBeInTheDocument()
      expect(screen.getByText('冷却 20 分钟')).toBeInTheDocument()
      expect(screen.getByText('邮件告警')).toBeInTheDocument()
      expect(screen.getByText('Webhook 告警')).toBeInTheDocument()
      expect(screen.getByText('分组: 核心骨干网 · 指定设备 2 台')).toBeInTheDocument()

      // 点击删除弹出二次确认 Dialog，取消不调用删除接口
      await user.click(screen.getByRole('button', { name: '删除规则 核心链路延迟过高' }))
      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText(/确定删除告警规则「核心链路延迟过高」？/)).toBeInTheDocument()
      await user.click(within(dialog).getByRole('button', { name: '取消' }))
      expect(configApi.deleteMonitoringTrigger).not.toHaveBeenCalled()

      // 再次点击删除并确认
      await user.click(screen.getByRole('button', { name: '删除规则 核心链路延迟过高' }))
      const dialog2 = screen.getByRole('dialog')
      await user.click(within(dialog2).getByRole('button', { name: '确认删除' }))
      await waitFor(() => {
        expect(configApi.deleteMonitoringTrigger).toHaveBeenCalledWith(401)
      })
    })

    it('编辑内置指标规则下拉不空白，且 uptime_drop 提交 metric_name=uptime 与 duration=0', async () => {
      const user = userEvent.setup()
      const rule = buildTriggerRule({ metric_name: 'response_time' })
      ;(configApi.listMonitoringTriggers as jest.Mock).mockResolvedValue([rule])
      ;(configApi.createMonitoringTrigger as jest.Mock).mockResolvedValue({ ...rule, id: '402' })

      const { renderWithClient } = createWrapper()
      renderWithClient(<TriggersTab />)

      await screen.findByText('核心链路延迟过高')

      // 编辑 response_time 规则时，监测指标下拉显示中文而非空白
      await user.click(screen.getByRole('button', { name: /编辑/ }))
      expect(screen.getByRole('combobox', { name: '监测指标' })).toHaveTextContent('Ping 响应延迟')
      await user.click(screen.getByRole('button', { name: '取消' }))

      // 新建 uptime_drop 规则，设置冷却时间与适用分组
      await user.click(screen.getByRole('button', { name: /新建告警规则/ }))
      await user.type(screen.getByLabelText('规则名称'), '交换机异常重启检测')
      await user.click(screen.getByRole('combobox', { name: '检测模式' }))
      await user.click(screen.getByRole('option', { name: '设备异常重启' }))

      const cooldownInput = screen.getByLabelText('通知冷却时间（分钟）')
      await user.clear(cooldownInput)
      await user.type(cooldownInput, '10')
      await user.click(screen.getByText('核心骨干网'))

      await user.click(screen.getByRole('button', { name: '创建规则' }))
      await waitFor(() => {
        expect(configApi.createMonitoringTrigger).toHaveBeenCalledWith(
          expect.objectContaining({
            name: '交换机异常重启检测',
            expression_mode: 'uptime_drop',
            metric_name: 'uptime',
            duration: 0,
            cooldown_minutes: 10,
            device_groups: [10],
          })
        )
      })
    })
  })

  describe('maintenanceHelpers 时区转换与停用态判定', () => {
    it('准确执行 Asia/Shanghai 与 UTC 往返转换并消除 8 小时偏移', () => {
      expect(formatIsoInTimezone('2026-11-20T14:00:00Z', 'Asia/Shanghai')).toBe('2026-11-20 22:00')
      expect(formatIsoInTimezone('2026-11-20T16:00:00Z', 'Asia/Shanghai')).toBe('2026-11-21 00:00')
      expect(formatIsoInTimezone('2026-11-20T14:00:00Z', 'UTC')).toBe('2026-11-20 14:00')

      expect(toDatetimeLocalValue('2026-11-20T14:00:00Z', 'Asia/Shanghai')).toBe('2026-11-20T22:00')
      expect(toDatetimeLocalValue('2026-11-20T16:00:00Z', 'Asia/Shanghai')).toBe('2026-11-21T00:00')
      expect(datetimeLocalToIsoInTimezone('2026-11-20T22:00', 'Asia/Shanghai')).toBe(
        '2026-11-20T14:00:00.000Z'
      )
      expect(datetimeLocalToIsoInTimezone('2026-11-20T22:00', 'UTC')).toBe(
        '2026-11-20T22:00:00.000Z'
      )

      const win = buildMaintenanceWindow({
        start_time: '2026-11-20T14:00:00Z',
        end_time: '2026-11-20T18:00:00Z',
        timezone: 'Asia/Shanghai',
      })
      expect(formatMaintenanceWindowSchedule(win)).toBe(
        '2026-11-20 22:00 ~ 2026-11-21 02:00 (Asia/Shanghai)'
      )

      expect(getMaintenanceLifecycleStatus(buildMaintenanceWindow({ enabled: false, is_active: true }))).toBe(
        'disabled'
      )
      expect(getMaintenanceLifecycleStatus(buildMaintenanceWindow({ enabled: true, is_active: true }))).toBe(
        'active'
      )
    })
  })

  describe('MaintenanceTab 与 MaintenanceModal 交互与周期校验', () => {
    it('支持停用筛选、维护说明展示、启停切换、删除二次确认以及周期规则阻断校验', async () => {
      const user = userEvent.setup()
      const activeWin = buildMaintenanceWindow({
        id: 501,
        name: '进行中窗口',
        enabled: true,
        is_active: true,
      })
      const disabledWin = buildMaintenanceWindow({
        id: 502,
        name: '已停用窗口',
        description: '暂停使用的备用割接窗口',
        enabled: false,
        is_active: false,
      })

      ;(configApi.listMonitoringMaintenances as jest.Mock).mockResolvedValue([activeWin, disabledWin])
      ;(configApi.updateMonitoringMaintenance as jest.Mock).mockResolvedValue({
        ...activeWin,
        enabled: false,
      })
      ;(configApi.deleteMonitoringMaintenance as jest.Mock).mockResolvedValue(undefined)

      const { renderWithClient } = createWrapper()
      renderWithClient(<MaintenanceTab />)

      expect(await screen.findByText('进行中窗口')).toBeInTheDocument()
      expect(screen.getByText('已停用窗口')).toBeInTheDocument()
      expect(screen.getByText('暂停使用的备用割接窗口')).toBeInTheDocument()

      // 筛选「已停用」
      await user.click(screen.getByRole('button', { name: '已停用 (1)' }))
      expect(screen.queryByText('进行中窗口')).not.toBeInTheDocument()
      expect(screen.getByText('已停用窗口')).toBeInTheDocument()

      // 切回全部并测试启停开关
      await user.click(screen.getByRole('button', { name: '全部 (2)' }))
      await user.click(screen.getByRole('switch', { name: '启停维护窗口 进行中窗口' }))
      await waitFor(() => {
        expect(configApi.updateMonitoringMaintenance).toHaveBeenCalledWith(
          501,
          expect.objectContaining({
            name: '进行中窗口',
            enabled: false,
            group_ids: [10],
          })
        )
      })

      // 删除二次确认
      await user.click(screen.getByRole('button', { name: '删除维护窗口 已停用窗口' }))
      const delDialog = screen.getByRole('dialog')
      expect(within(delDialog).getByText(/确定删除计划维护窗口「已停用窗口」？/)).toBeInTheDocument()
      await user.click(within(delDialog).getByRole('button', { name: '确认删除' }))
      await waitFor(() => {
        expect(configApi.deleteMonitoringMaintenance).toHaveBeenCalledWith(502)
      })

      // 打开新建弹窗测试每周空选与每月非法日期阻断
      await user.click(screen.getByRole('button', { name: /新建维护窗口/ }))
      await user.type(screen.getByLabelText('维护窗口名称'), '周期校验测试窗口')
      await user.type(screen.getByLabelText('维护说明'), '每周例行检修')
      await user.click(screen.getByText('核心骨干网'))

      await user.click(screen.getByRole('combobox', { name: '执行周期' }))
      await user.click(screen.getByRole('option', { name: '每周重复' }))
      // 取消默认的周六、周日
      await user.click(screen.getByRole('button', { name: '周六' }))
      await user.click(screen.getByRole('button', { name: '周日' }))
      await user.click(screen.getByRole('button', { name: '创建维护窗口' }))
      expect(await screen.findByText('请至少选择一个每周执行日')).toBeInTheDocument()
      expect(configApi.createMonitoringMaintenance).not.toHaveBeenCalled()

      // 切到每月重复并输入非法日期
      await user.click(screen.getByRole('combobox', { name: '执行周期' }))
      await user.click(screen.getByRole('option', { name: '每月重复' }))
      const domInput = screen.getByLabelText(/每月执行日期/)
      fireEvent.change(domInput, { target: { value: '1,32' } })
      await user.click(screen.getByRole('button', { name: '创建维护窗口' }))
      expect(
        await screen.findByText('请填写有效的每月执行日期（1~31 的整数，英文逗号分隔）')
      ).toBeInTheDocument()
      expect(configApi.createMonitoringMaintenance).not.toHaveBeenCalled()
    })
  })

  describe('useMonitoringHosts batchMaintMutation 缓存失效对齐', () => {
    it('批量创建计划维护成功后精准失效总览、主机详情与生效维护缓存', async () => {
      ;(configApi.createMonitoringMaintenance as jest.Mock).mockResolvedValue(buildMaintenanceWindow())
      const { queryClient, Wrapper } = createWrapper()
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(
        () => useMonitoringHosts({ activeGroupId: null, initialStatusFilter: null }),
        { wrapper: Wrapper }
      )

      await act(async () => {
        await result.current.batchAddMaintenance({
          name: '批量割接窗口',
          mode: 'collect_silence',
          durationHours: 2,
          deviceIds: [101],
        })
      })

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['monitoring-hosts'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['monitoring-maintenances'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['monitoring-maintenances-active'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['monitoring-v2'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['monitoring-dashboard-v2'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['monitoring-host-detail'] })
    })
  })
})
