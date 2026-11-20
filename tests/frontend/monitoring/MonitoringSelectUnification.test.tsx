import fs from 'fs'
import path from 'path'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HostsMatrixTab } from '@/features/monitoring/components/hosts'
import { LatestDataTab } from '@/features/monitoring/components/latest'
import { TriggersTab } from '@/features/monitoring/components/triggers'
import { getMonitoringHosts, getLatestData } from '@/features/monitoring/api/monitoring-hosts.api'
import { listMonitoringTriggers } from '@/features/monitoring/api/monitoring-config.api'
import { getDeviceGroups } from '@/features/devices/api/devices.api'
import { useMonitoringDevices } from '@/features/monitoring/hooks/useMonitoringDevices'
import { useMonitoringV2 } from '@/features/monitoring/hooks/useMonitoringV2'

jest.mock('@/components/ui/select', () =>
  require('./components/helpers/selectMock').createSelectMock()
)

jest.mock('@/lib/contexts/auth-context', () => ({
  usePermission: () => true,
}))

jest.mock('@/features/monitoring/api/monitoring-hosts.api', () => ({
  getMonitoringHosts: jest.fn(),
  getLatestData: jest.fn(),
  getAdhocGraphs: jest.fn(),
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
}))

jest.mock('@/features/devices/api/devices.api', () => ({
  DEVICE_GROUPS_QUERY_KEY: ['device-groups'],
  getDeviceGroups: jest.fn(),
  bulkDeviceAction: jest.fn(),
}))

jest.mock('@/features/monitoring/hooks/useMonitoringDevices', () => ({
  useMonitoringDevices: jest.fn(),
}))

jest.mock('@/features/monitoring/hooks/useMonitoringV2', () => ({
  useMonitoringV2: jest.fn(),
}))

function collectTsxFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectTsxFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      files.push(fullPath)
    }
  }
  return files
}

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('监控中心与全项目下拉框统一化守卫', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getDeviceGroups as jest.Mock).mockResolvedValue([])
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
    ;(getLatestData as jest.Mock).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 50,
      total_pages: 1,
    })
    ;(useMonitoringDevices as jest.Mock).mockReturnValue({
      data: [{ id: 1, name: 'Core-SW-01', ipAddress: '10.0.0.1', status: 'online', isMonitored: true }],
      isLoading: false,
      error: null,
    })
    ;(useMonitoringV2 as jest.Mock).mockReturnValue({
      data: { data: { notificationChannelSummary: [] } },
    })
    ;(listMonitoringTriggers as jest.Mock).mockResolvedValue([])
  })

  it('全项目 frontend/src 下所有 .tsx 文件均不得包含原生 <select> 标签', () => {
    const srcRoot = path.resolve(__dirname, '../../../frontend/src')
    const tsxFiles = collectTsxFiles(srcRoot)
    expect(tsxFiles.length).toBeGreaterThan(0)

    const nativeSelectViolations: string[] = []
    for (const filePath of tsxFiles) {
      const content = fs.readFileSync(filePath, 'utf8')
      if (/<select(?=[\s>])/.test(content)) {
        nativeSelectViolations.push(path.relative(srcRoot, filePath))
      }
    }

    expect(nativeSelectViolations).toEqual([])
  })

  it('监控中心所有 SelectTrigger 均采用设备管理标准 h-9 与 text-sm（禁用 h-8/text-xs/rounded-md/rounded-lg）', () => {
    const monitoringRoot = path.resolve(__dirname, '../../../frontend/src/features/monitoring')
    const tsxFiles = collectTsxFiles(monitoringRoot)
    const triggerRegex = /<SelectTrigger\b[\s\S]*?>/g
    const violations: string[] = []

    for (const filePath of tsxFiles) {
      const content = fs.readFileSync(filePath, 'utf8')
      const matches = content.match(triggerRegex) ?? []
      for (const tag of matches) {
        if (/\b(h-8|text-xs|rounded-md|rounded-lg)\b/.test(tag) || !/\bh-9\b/.test(tag) || !/\btext-sm\b/.test(tag)) {
          violations.push(`${path.relative(monitoringRoot, filePath)}: ${tag}`)
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('HostsMatrixTab、LatestDataTab、TriggersTab 下拉框均渲染为标准 combobox 且具备 h-9 与 text-sm', async () => {
    const user = userEvent.setup()

    const { unmount: unmountHosts } = renderWithQuery(
      <HostsMatrixTab
        activeGroupId={null}
        initialStatusFilter={null}
        onSelectGroup={jest.fn()}
        onSelectHost={jest.fn()}
      />
    )
    const sortCombo = screen.getByRole('combobox', { name: '排序方式' })
    expect(sortCombo).toHaveClass('h-9', 'text-sm')
    expect(sortCombo).toHaveTextContent('异常优先（默认）')
    await user.click(sortCombo)
    await user.click(screen.getByRole('option', { name: '按 CPU 使用率' }))
    await waitFor(() => {
      expect(getMonitoringHosts).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort_by: 'cpu_usage' })
      )
    })
    unmountHosts()

    const { unmount: unmountLatest } = renderWithQuery(
      <LatestDataTab
        activeGroupId={null}
        selectedDeviceIds={[]}
        onSelectHost={jest.fn()}
      />
    )
    const devCombo = screen.getByRole('combobox', { name: '按设备筛选指标' })
    const tagCombo = screen.getByRole('combobox', { name: '按指标分类筛选' })
    expect(devCombo).toHaveClass('h-9', 'text-sm')
    expect(tagCombo).toHaveClass('h-9', 'text-sm')
    expect(devCombo).toHaveTextContent('全部设备')
    expect(tagCombo).toHaveTextContent('全部分类')
    unmountLatest()

    renderWithQuery(<TriggersTab />)
    const sevCombo = await screen.findByRole('combobox', { name: '按告警级别筛选' })
    expect(sevCombo).toHaveClass('h-9', 'text-sm')
    expect(sevCombo).toHaveTextContent('全部级别')
    await user.click(sevCombo)
    await user.click(screen.getByRole('option', { name: '严重告警' }))
    await waitFor(() => {
      expect(listMonitoringTriggers).toHaveBeenLastCalledWith({ severity: 'critical' })
    })
    await user.click(sevCombo)
    await user.click(screen.getByRole('option', { name: '全部级别' }))
    expect(sevCombo).toHaveTextContent('全部级别')
    expect(listMonitoringTriggers).toHaveBeenNthCalledWith(1, undefined)
  })
})
