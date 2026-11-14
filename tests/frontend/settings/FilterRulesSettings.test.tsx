import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FilterRulesSettings } from '@/features/settings/components/filter/FilterRulesSettings'
import { SettingsShellProvider } from '@/features/settings/context/SettingsShellContext'
import { toast } from 'react-hot-toast'

const mockGet = jest.fn()
const mockPost = jest.fn()

jest.mock('@/lib/api-client', () => ({
  httpClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}))

jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsShellProvider activeTabKey="filter">
        <FilterRulesSettings />
      </SettingsShellProvider>
    </QueryClientProvider>
  )
}

describe('FilterRulesSettings 屏蔽规则设置页', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGet.mockResolvedValue([
      { key: 'system.alert_exclude_keywords', value: 'NTP, CPU' },
      { key: 'logs.exclude_keywords', value: 'Heartbeat' },
    ])
    mockPost.mockResolvedValue({ updated_count: 2 })
  })

  it('应正确加载并渲染初始服务端配置项', async () => {
    renderComponent()

    expect(await screen.findByText('NTP')).toBeInTheDocument()
    expect(screen.getByText('CPU')).toBeInTheDocument()
    expect(screen.getByText('Heartbeat')).toBeInTheDocument()

    expect(screen.getByText('已配置 2 / 20 个关键字')).toBeInTheDocument()
    expect(screen.getByText('已配置 1 / 20 个关键字')).toBeInTheDocument()

    const saveButton = screen.getByRole('button', { name: '保存整页更改' })
    expect(saveButton).toBeDisabled()
  })

  it('应支持添加屏蔽关键字（逗号分隔与回车添加）并触发脏状态', async () => {
    const user = userEvent.setup()
    renderComponent()

    await screen.findByText('NTP')

    const alertInput = screen.getByRole('textbox', { name: '添加告警屏蔽关键字' })
    await user.type(alertInput, 'Memory, Disk{Enter}')

    expect(screen.getByText('Memory')).toBeInTheDocument()
    expect(screen.getByText('Disk')).toBeInTheDocument()
    expect(screen.getByText('已配置 4 / 20 个关键字')).toBeInTheDocument()
    expect(alertInput).toHaveValue('')

    const saveButton = screen.getByRole('button', { name: '保存整页更改' })
    expect(saveButton).toBeEnabled()
  })

  it('添加关键字时应不区分大小写去重', async () => {
    const user = userEvent.setup()
    renderComponent()

    await screen.findByText('NTP')

    const alertInput = screen.getByRole('textbox', { name: '添加告警屏蔽关键字' })
    await user.type(alertInput, 'ntp{Enter}')

    // 依然只有原本的 2 个关键字
    expect(screen.getByText('已配置 2 / 20 个关键字')).toBeInTheDocument()
  })

  it('超过 20 个关键字时应弹出错误提示并阻止添加', async () => {
    const user = userEvent.setup()
    // 初始已有 19 个关键字
    const nineteenKeywords = Array.from({ length: 19 }, (_, i) => `kw${i}`).join(',')
    mockGet.mockResolvedValue([
      { key: 'system.alert_exclude_keywords', value: nineteenKeywords },
      { key: 'logs.exclude_keywords', value: '' },
    ])

    renderComponent()

    await screen.findByText('kw0')
    expect(screen.getByText('已配置 19 / 20 个关键字')).toBeInTheDocument()

    const alertInput = screen.getByRole('textbox', { name: '添加告警屏蔽关键字' })
    // 尝试添加 2 个关键字（19 + 2 = 21 > 20）
    await user.type(alertInput, 'extra1, extra2')
    const addButton = screen.getByRole('button', { name: '添加告警关键字' })
    await user.click(addButton)

    expect(toast.error).toHaveBeenCalledWith('最多可配置 20 个屏蔽关键字')
    expect(screen.queryByText('extra1')).not.toBeInTheDocument()
  })

  it('应支持移除单个关键字 Badge', async () => {
    const user = userEvent.setup()
    renderComponent()

    await screen.findByText('NTP')

    const removeCpuBtn = screen.getByRole('button', { name: '移除告警屏蔽词 CPU' })
    await user.click(removeCpuBtn)

    expect(screen.queryByText('CPU')).not.toBeInTheDocument()
    expect(screen.getAllByText('已配置 1 / 20 个关键字')).toHaveLength(2)

    const saveButton = screen.getByRole('button', { name: '保存整页更改' })
    expect(saveButton).toBeEnabled()
  })

  it('应支持清空全部关键字并展示空态', async () => {
    const user = userEvent.setup()
    renderComponent()

    await screen.findByText('NTP')

    const clearButtons = screen.getAllByRole('button', { name: '清空全部' })
    // 第一个清空全部属于告警规则区块
    await user.click(clearButtons[0])

    expect(screen.queryByText('NTP')).not.toBeInTheDocument()
    expect(screen.queryByText('CPU')).not.toBeInTheDocument()
    expect(screen.getByText('暂未配置告警屏蔽关键字')).toBeInTheDocument()
    expect(screen.getByText('已配置 0 / 20 个关键字')).toBeInTheDocument()

    const saveButton = screen.getByRole('button', { name: '保存整页更改' })
    expect(saveButton).toBeEnabled()
  })

  it('重置整页更改应回退为初始服务器配置', async () => {
    const user = userEvent.setup()
    renderComponent()

    await screen.findByText('NTP')

    const alertInput = screen.getByRole('textbox', { name: '添加告警屏蔽关键字' })
    await user.type(alertInput, 'Temporary{Enter}')
    expect(screen.getByText('Temporary')).toBeInTheDocument()

    const resetButton = screen.getByRole('button', { name: '重置整页更改' })
    expect(resetButton).toBeEnabled()
    await user.click(resetButton)

    expect(screen.queryByText('Temporary')).not.toBeInTheDocument()
    expect(screen.getByText('NTP')).toBeInTheDocument()
    expect(screen.getByText('CPU')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存整页更改' })).toBeDisabled()
  })

  it('点击保存整页更改应调用 POST /settings/general/bulk 提交并提示成功', async () => {
    const user = userEvent.setup()
    renderComponent()

    await screen.findByText('NTP')

    const alertInput = screen.getByRole('textbox', { name: '添加告警屏蔽关键字' })
    await user.type(alertInput, 'BGP{Enter}')

    const logInput = screen.getByRole('textbox', { name: '添加日志屏蔽关键字' })
    await user.type(logInput, 'Keepalive{Enter}')

    const saveButton = screen.getByRole('button', { name: '保存整页更改' })
    await user.click(saveButton)

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/settings/general/bulk', {
        settings: {
          'system.alert_exclude_keywords': 'NTP,CPU,BGP',
          'logs.exclude_keywords': 'Heartbeat,Keepalive',
        },
      })
    })

    expect(toast.success).toHaveBeenCalledWith('保存成功！屏蔽规则已更新')
  })

  it('在输入框输入关键字后未点添加直接点击保存整页更改，也应自动合并并保存', async () => {
    const user = userEvent.setup()
    renderComponent()

    await screen.findByText('NTP')

    const alertInput = screen.getByRole('textbox', { name: '添加告警屏蔽关键字' })
    await user.type(alertInput, '电源')

    const saveButton = screen.getByRole('button', { name: '保存整页更改' })
    expect(saveButton).toBeEnabled()
    await user.click(saveButton)

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/settings/general/bulk', {
        settings: {
          'system.alert_exclude_keywords': 'NTP,CPU,电源',
          'logs.exclude_keywords': 'Heartbeat',
        },
      })
    })
  })
})
