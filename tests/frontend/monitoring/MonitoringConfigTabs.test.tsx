import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TemplatesTab } from '@/features/monitoring/components/templates'
import { TriggersTab } from '@/features/monitoring/components/triggers'
import { MaintenanceTab } from '@/features/monitoring/components/maintenance'
import * as configApi from '@/features/monitoring/api/monitoring-config.api'
import { useMonitoringV2 } from '@/features/monitoring/hooks/useMonitoringV2'
import { useMonitoringDevices } from '@/features/monitoring/hooks/useMonitoringDevices'
import { getDeviceGroups } from '@/features/devices/api/devices.api'
import type {
  MaintenanceView,
  TemplateDetailResponse,
  TriggerRule,
} from '@/features/monitoring/types/zabbix-monitoring.types'

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: () => true,
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
}))

jest.mock('@/features/devices/components/DeviceGroupModal', () => ({
  DeviceGroupModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div role="dialog" aria-label="设备分组管理弹窗">
        <button type="button" onClick={onClose}>
          关闭分组弹窗
        </button>
      </div>
    ) : null,
}))

jest.mock('@/features/monitoring/api/monitoring-config.api', () => ({
  listMonitoringTemplates: jest.fn(),
  getMonitoringTemplate: jest.fn(),
  createMonitoringTemplate: jest.fn(),
  updateMonitoringTemplate: jest.fn(),
  deleteMonitoringTemplate: jest.fn(),
  cloneMonitoringTemplate: jest.fn(),
  updateMonitoringTemplateBindings: jest.fn(),
  listTemplateItems: jest.fn(),
  createTemplateItem: jest.fn(),
  updateTemplateItem: jest.fn(),
  deleteTemplateItem: jest.fn(),
  testMonitoringItem: jest.fn(),
  listTemplateLLDRules: jest.fn(),
  createTemplateLLDRule: jest.fn(),
  updateTemplateLLDRule: jest.fn(),
  deleteTemplateLLDRule: jest.fn(),
  previewTemplateLLDRule: jest.fn(),
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

const BANNED_JARGON_REGEX = /\{\$|\b(LLD|Preprocessing|ValueMap|Hysteresis|NoData|Trigger)\b/

const BUILTIN_TEMPLATE: TemplateDetailResponse = {
  id: 1,
  code: 'builtin_huawei_campus_switch',
  name: '华为园区交换机标准方案',
  vendor: 'huawei',
  device_type: 'switch',
  description: '内置标准方案',
  is_builtin: true,
  default_interval_sec: 300,
  macros_json: '[]',
  created_at: '2026-11-20T00:00:00Z',
  updated_at: '2026-11-20T00:00:00Z',
  macros: [
    { key: 'cpu_warn_pct', label: 'CPU 预警线', unit: '%', default_value: '80', description: 'CPU 超限警告' },
    { key: 'temp_warn_c', label: '高温预警', unit: '°C', default_value: '75', description: '温度超限警告' },
  ],
  items: [
    {
      id: 11,
      template_id: 1,
      item_key: 'cpu.usage',
      name: 'CPU 利用率',
      application_tag: 'system',
      protocol: 'builtin',
      target_expr: '',
      http_scheme: '',
      http_port: 0,
      http_path: '',
      value_type: 'float',
      unit: '%',
      interval_sec: 300,
      preprocessing_json: '[]',
      value_map_json: '{}',
      enabled: true,
      created_at: '2026-11-20T00:00:00Z',
      updated_at: '2026-11-20T00:00:00Z',
    },
  ],
  lld_rules: [
    {
      id: 21,
      template_id: 1,
      rule_key: 'lld.interfaces',
      name: '交换机物理端口自动识别',
      entity_type: 'interface',
      preset_flags_json: { ignore_virtual: true, ignore_idle: false, highlight_uplink: true },
      include_regex: '',
      exclude_regex: '',
      keep_lost_days: 7,
      enabled: true,
      created_at: '2026-11-20T00:00:00Z',
      updated_at: '2026-11-20T00:00:00Z',
    },
  ],
  bound_group_ids: [10],
  bound_device_ids: [101],
  device_overrides: { 101: '{"temp_warn_c":"82"}' },
}

const CUSTOM_TEMPLATE: TemplateDetailResponse = {
  ...BUILTIN_TEMPLATE,
  id: 2,
  code: 'clone_huawei_custom',
  name: '华为园区交换机标准方案 (副本)',
  is_builtin: false,
  bound_group_ids: [],
  bound_device_ids: [101],
  device_overrides: { 101: '{"temp_warn_c":"82"}' },
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return {
    queryClient,
    renderWithClient: (ui: React.ReactElement) =>
      render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
  }
}

describe('Phase 4 Wave 4C 去黑话配置工作台 (Task 13)', () => {
  beforeEach(() => {
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
            { channel: 'webhook', enabled: false, configured: false },
          ],
        },
      },
    })
  })

  it('TemplatesTab 支持内置方案保护与克隆、阈值参数与生效范围(含分组绑定与单台微调恢复默认)', async () => {
    const user = userEvent.setup()
    ;(configApi.listMonitoringTemplates as jest.Mock).mockResolvedValue([
      BUILTIN_TEMPLATE,
      CUSTOM_TEMPLATE,
    ])
    ;(configApi.getMonitoringTemplate as jest.Mock).mockImplementation(async (id: number) =>
      id === 2 ? CUSTOM_TEMPLATE : BUILTIN_TEMPLATE
    )
    ;(configApi.cloneMonitoringTemplate as jest.Mock).mockResolvedValue(CUSTOM_TEMPLATE)
    ;(configApi.updateMonitoringTemplate as jest.Mock).mockResolvedValue(CUSTOM_TEMPLATE)
    ;(configApi.updateMonitoringTemplateBindings as jest.Mock).mockResolvedValue(undefined)

    const { renderWithClient } = createWrapper()
    const { container } = renderWithClient(<TemplatesTab />)

    expect(
      await screen.findByRole('heading', { name: '华为园区交换机标准方案' })
    ).toBeInTheDocument()
    expect(screen.getByText(/内置系统预置方案不允许直接修改或删除/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /删除/ })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /克隆为自定义方案/ }))
    await waitFor(() => {
      expect(configApi.cloneMonitoringTemplate).toHaveBeenCalledWith(1, undefined)
    })

    // 切换至「阈值参数与生效范围」
    await user.click(screen.getByRole('tab', { name: '阈值参数与生效范围' }))
    expect(container.textContent).not.toMatch(BANNED_JARGON_REGEX)

    // 修改方案默认阈值并保存
    const cpuInput = screen.getByLabelText('CPU 预警线')
    await user.clear(cpuInput)
    await user.type(cpuInput, '85')
    await user.click(screen.getByRole('button', { name: /保存默认阈值/ }))
    await waitFor(() => {
      expect(configApi.updateMonitoringTemplate).toHaveBeenCalled()
    })

    // 勾选设备组自动生效 + 打开新建分组弹窗
    await user.click(screen.getByText('汇聚接入层'))
    await user.click(screen.getByRole('button', { name: '保存生效分组' }))
    await waitFor(() => {
      expect(configApi.updateMonitoringTemplateBindings).toHaveBeenCalledWith(2, {
        group_ids: [11],
        replace_groups: true,
      })
    })

    await user.click(screen.getByRole('button', { name: /\+ 新建设备分组/ }))
    expect(screen.getByRole('dialog', { name: '设备分组管理弹窗' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '关闭分组弹窗' }))

    // 单台微调展示「已单独微调」并支持恢复默认
    expect(screen.getByText('已单独微调')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /单台微调/ }))
    const overrideDialog = screen.getByRole('dialog')
    const overrideTemp = within(overrideDialog).getByLabelText('高温预警')
    await user.clear(overrideTemp)
    await user.type(overrideTemp, '84')
    await user.click(within(overrideDialog).getByRole('button', { name: '保存单台微调' }))
    await waitFor(() => {
      expect(configApi.updateMonitoringTemplateBindings).toHaveBeenCalledWith(2, {
        device_overrides: { 101: { temp_warn_c: '84' } },
      })
    })

    await user.click(screen.getByRole('button', { name: /恢复默认/ }))
    await waitFor(() => {
      expect(configApi.updateMonitoringTemplateBindings).toHaveBeenCalledWith(2, {
        clear_overrides: [101],
      })
    })
  })

  it('TemplatesTab 支持端口与硬件自动识别预设、折叠专家正则防抖预览，以及采集指标拆分HTTP与在线测试台', async () => {
    const user = userEvent.setup()
    ;(configApi.listMonitoringTemplates as jest.Mock).mockResolvedValue([CUSTOM_TEMPLATE])
    ;(configApi.getMonitoringTemplate as jest.Mock).mockResolvedValue(CUSTOM_TEMPLATE)
    ;(configApi.previewTemplateLLDRule as jest.Mock).mockResolvedValue({
      matched: ['GigabitEthernet0/0/1', 'XGigabitEthernet0/0/2'],
      excluded: ['LoopBack0', 'Null0'],
    })
    ;(configApi.testMonitoringItem as jest.Mock).mockResolvedValue({
      raw_value: '755',
      steps: [{ step_index: 0, type: 'multiplier', input: '755', output: '75.5' }],
      final_value: '75.5',
      display_text: '75.5 °C',
      duration_ms: 18,
    })
    ;(configApi.createTemplateItem as jest.Mock).mockResolvedValue({
      ...CUSTOM_TEMPLATE.items[0],
      id: 99,
      item_key: 'http.health',
      name: 'Web 健康检查',
    })

    const { renderWithClient } = createWrapper()
    const { container } = renderWithClient(<TemplatesTab />)
    expect(
      await screen.findByRole('heading', { name: '华为园区交换机标准方案 (副本)' })
    ).toBeInTheDocument()

    // 1) 新建采集指标 + 拆分式 HTTP + 数据换算 + 在线测试台
    await user.click(screen.getByRole('button', { name: /新建采集指标/ }))
    await user.type(screen.getByLabelText('指标名称'), 'Web 健康检查')
    await user.type(screen.getByLabelText('指标编码（英文）'), 'http.health')
    await user.selectOptions(screen.getByLabelText('采集方式'), 'http')
    expect(screen.getByLabelText('协议')).toBeInTheDocument()
    expect(screen.getByLabelText('端口')).toBeInTheDocument()
    const pathInput = screen.getByLabelText(/检查路径/)
    await user.clear(pathInput)
    await user.type(pathInput, '/api/health')

    await user.click(screen.getByRole('button', { name: /添加换算步骤/ }))
    await user.selectOptions(screen.getByLabelText('选择测试设备'), '101')
    await user.click(screen.getByRole('button', { name: /执行测试/ }))

    expect(await screen.findByText('755')).toBeInTheDocument()
    expect(screen.getByText('75.5 °C')).toBeInTheDocument()
    expect(screen.getByText(/分步换算中间值/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '取消' }))

    // 2) 端口与硬件自动识别：默认折叠专家模式，展开后 150ms 防抖预览
    await user.click(screen.getByRole('tab', { name: '端口与硬件自动识别' }))
    expect(container.textContent).not.toMatch(BANNED_JARGON_REGEX)
    expect(screen.getByText('自动忽略虚拟/环回口')).toBeInTheDocument()
    expect(screen.getByText('排除长期关闭闲置端口')).toBeInTheDocument()
    expect(screen.getByText('优先重点监测上联高速口与聚合口')).toBeInTheDocument()

    const expertToggle = screen.getByRole('button', { name: /高级规则（专家模式）/ })
    expect(expertToggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(expertToggle)

    const includeInput = screen.getByLabelText(/仅保留匹配名称/)
    expect(includeInput).toHaveAttribute('maxLength', '256')
    fireEvent.change(includeInput, { target: { value: '^(Gigabit|XGigabit)' } })

    await waitFor(
      () => {
        expect(configApi.previewTemplateLLDRule).toHaveBeenCalled()
      },
      { timeout: 1500 }
    )
    expect(await screen.findByText('GigabitEthernet0/0/1')).toBeInTheDocument()
    expect(screen.getByText('LoopBack0')).toBeInTheDocument()
  })

  it('TriggersTab 展示脱敏通知渠道就绪条、自然语言摘要与抽屉实时动态预览', async () => {
    const user = userEvent.setup()
    const rule: TriggerRule = {
      id: '301',
      name: '核心机房温度过热',
      enabled: true,
      is_active: true,
      severity: 'critical',
      category: 'hardware',
      metric_name: 'temperature',
      operator: '>',
      condition: 'gt',
      threshold: 75,
      threshold_value: 75,
      duration: 900,
      device_types: [],
      device_groups: [],
      specific_devices: [],
      notify_email: false,
      notify_websocket: true,
      email_recipients: [],
      cooldown_minutes: 30,
      expression_mode: 'hysteresis',
      recovery_operator: '<',
      recovery_threshold: 70,
      nodata_seconds: 0,
      dependency_mode: 'lldp_upstream',
      entity_filter_regex: '',
      tags_json: {},
    }
    ;(configApi.listMonitoringTriggers as jest.Mock).mockResolvedValue([rule])
    ;(configApi.toggleMonitoringTrigger as jest.Mock).mockResolvedValue({ ...rule, is_active: false })
    ;(configApi.createMonitoringTrigger as jest.Mock).mockResolvedValue({ ...rule, id: '302' })

    const { renderWithClient } = createWrapper()
    const { container } = renderWithClient(<TriggersTab />)

    expect(await screen.findByText('核心机房温度过热')).toBeInTheDocument()
    expect(screen.getByText('邮件通知 · 已启用')).toBeInTheDocument()
    expect(screen.getByText('Webhook 推送 · 未配置')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /配置通知渠道/ })).toHaveAttribute(
      'href',
      '/settings?tab=notifications'
    )
    expect(
      screen.getByText(/当设备温度连续 15 分钟高于 75°C 触发严重告警；降至 70°C 以下自动恢复/)
    ).toBeInTheDocument()
    expect(container.textContent).not.toMatch(BANNED_JARGON_REGEX)

    await user.click(screen.getByRole('switch', { name: /启停规则 核心机房温度过热/ }))
    await waitFor(() => {
      expect(configApi.toggleMonitoringTrigger).toHaveBeenCalledWith(301)
    })

    await user.click(screen.getByRole('button', { name: /新建告警规则/ }))
    await user.type(screen.getByLabelText('规则名称'), '接口断流规则')
    await user.selectOptions(screen.getByLabelText('检测模式'), 'nodata')
    expect(screen.getByLabelText('规则自然语言预览')).toHaveTextContent(/未上报新数据时/)

    await user.click(screen.getByRole('button', { name: '创建规则' }))
    await waitFor(() => {
      expect(configApi.createMonitoringTrigger).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '接口断流规则',
          expression_mode: 'nodata',
        })
      )
    })
  })

  it('MaintenanceTab 展示状态看板并在新建维护窗口后精准失效主机与总览缓存', async () => {
    const user = userEvent.setup()
    const activeWindow: MaintenanceView = {
      id: 88,
      name: '核心路由器割接窗口',
      description: '夜间板卡升级',
      mode: 'collect_silence',
      schedule_type: 'once',
      start_time: '2026-11-20T14:00:00Z',
      end_time: '2026-11-20T18:00:00Z',
      timezone: 'Asia/Shanghai',
      enabled: true,
      created_by: 'admin',
      created_at: '2026-11-20T10:00:00Z',
      updated_at: '2026-11-20T10:00:00Z',
      recurrence: {},
      targets: [{ id: 1, maintenance_id: 88, target_type: 'device_group', target_id: 10 }],
      is_active: true,
    }
    ;(configApi.listMonitoringMaintenances as jest.Mock).mockResolvedValue([activeWindow])
    ;(configApi.createMonitoringMaintenance as jest.Mock).mockResolvedValue({
      ...activeWindow,
      id: 89,
      name: '接入交换机固件升级',
    })

    const { queryClient, renderWithClient } = createWrapper()
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')

    const { container } = renderWithClient(<MaintenanceTab />)
    expect(await screen.findByText('核心路由器割接窗口')).toBeInTheDocument()
    expect(screen.getByText('仅静默告警·仍记录曲线')).toBeInTheDocument()
    expect(screen.getByText('分组: 核心骨干网')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(BANNED_JARGON_REGEX)

    await user.click(screen.getByRole('button', { name: /新建维护窗口/ }))
    await user.type(screen.getByLabelText('维护窗口名称'), '接入交换机固件升级')
    expect(screen.getByLabelText('执行时区')).toHaveValue('Asia/Shanghai')

    await user.click(screen.getByText('核心骨干网'))
    await user.click(screen.getByRole('button', { name: '创建维护窗口' }))

    await waitFor(() => {
      expect(configApi.createMonitoringMaintenance).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '接入交换机固件升级',
          mode: 'collect_silence',
          timezone: 'Asia/Shanghai',
          group_ids: [10],
        })
      )
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['monitoring-hosts'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['monitoring-dashboard-v2'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['monitoring-v2'] })
  })
})
