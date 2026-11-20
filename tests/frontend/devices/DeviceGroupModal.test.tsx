import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { DeviceGroupModal } from '@/features/devices/components/DeviceGroupModal'
import {
  createDeviceGroup,
  deleteDeviceGroup,
  DEVICE_GROUPS_QUERY_KEY,
  getDeviceGroups,
  updateDeviceGroup,
} from '@/features/devices/api/devices.api'
import type { DeviceGroupItem } from '@/features/devices/types'
import { ApiClientError } from '@/lib/api-client'

jest.mock('@/features/devices/api/devices.api', () => {
  const actual = jest.requireActual('@/features/devices/api/devices.api')
  return {
    ...actual,
    getDeviceGroups: jest.fn(),
    createDeviceGroup: jest.fn(),
    updateDeviceGroup: jest.fn(),
    deleteDeviceGroup: jest.fn(),
  }
})

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/components/ui/select', () => {
  const React = require('react') as typeof import('react')
  const SelectTrigger = ({ children }: { children?: React.ReactNode }) => <>{children}</>
  SelectTrigger.displayName = 'MockSelectTrigger'
  const SelectContent = ({ children }: { children?: React.ReactNode }) => <>{children}</>
  SelectContent.displayName = 'MockSelectContent'
  const SelectItem = ({ children }: { children?: React.ReactNode }) => <>{children}</>
  SelectItem.displayName = 'MockSelectItem'
  const SelectValue = ({ placeholder }: { placeholder?: string }) => <>{placeholder ?? null}</>
  SelectValue.displayName = 'MockSelectValue'

  const extractItems = (node: React.ReactNode): React.ReactElement[] =>
    React.Children.toArray(node)
      .filter((child): child is React.ReactElement => React.isValidElement(child))
      .flatMap((child) => {
        if ((child.type as { displayName?: string }).displayName === 'MockSelectItem') {
          return [child]
        }
        if (child.props?.children) {
          return extractItems(child.props.children)
        }
        return []
      })

  return {
    Select: ({
      value,
      onValueChange,
      children,
      disabled,
    }: {
      value?: string
      onValueChange?: (value: string) => void
      children: React.ReactNode
      disabled?: boolean
    }) => {
      const childArray = React.Children.toArray(children).filter(React.isValidElement)
      const trigger = childArray.find(
        (child) => (child.type as { displayName?: string }).displayName === 'MockSelectTrigger',
      ) as React.ReactElement | undefined
      const items = extractItems(children)

      return (
        <select
          value={value}
          disabled={disabled}
          aria-label={trigger?.props?.['aria-label']}
          onChange={(e) => onValueChange?.(e.target.value)}
        >
          {items.map((item) => (
            <option key={item.props.value} value={item.props.value}>
              {item.props.children}
            </option>
          ))}
        </select>
      )
    },
    SelectTrigger,
    SelectContent,
    SelectItem,
    SelectValue,
  }
})

const makeGroup = (overrides: Partial<DeviceGroupItem> & { id: number; name: string }): DeviceGroupItem => ({
  parent_id: null,
  device_count: 0,
  online_count: 0,
  alert_count: 0,
  alerts_limited_by_permission: false,
  ...overrides,
})

const createTestClient = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const invalidateSpy = jest.spyOn(client, 'invalidateQueries')
  return { client, invalidateSpy }
}

const renderModal = (
  client: QueryClient,
  props: Partial<React.ComponentProps<typeof DeviceGroupModal>> = {},
) =>
  render(
    <QueryClientProvider client={client}>
      <DeviceGroupModal isOpen onClose={jest.fn()} {...props} />
    </QueryClientProvider>,
  )

describe('DeviceGroupModal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('展示树形分组统计，并遵守 alerts_limited_by_permission 门控', async () => {
    ;(getDeviceGroups as jest.Mock).mockResolvedValue([
      makeGroup({ id: 1, name: '总部数据中心', device_count: 5, online_count: 4, alert_count: 2 }),
      makeGroup({
        id: 2,
        name: '核心骨干网',
        parent_id: 1,
        device_count: 2,
        online_count: 2,
        alert_count: 9,
        alerts_limited_by_permission: true,
      }),
    ])

    const { client } = createTestClient()
    renderModal(client)

    expect(await screen.findByText('总部数据中心')).toBeInTheDocument()
    expect(screen.getByText('核心骨干网')).toBeInTheDocument()
    expect(screen.getByText('5 台设备 · 4 在线')).toBeInTheDocument()
    expect(screen.getByText('2 告警')).toBeInTheDocument()
    expect(screen.queryByText('9 告警')).not.toBeInTheDocument()
  })

  it('新建分组成功后自动触发 DEVICE_GROUPS_QUERY_KEY 与设备列表缓存失效', async () => {
    ;(getDeviceGroups as jest.Mock).mockResolvedValue([
      makeGroup({ id: 1, name: '总部数据中心' }),
    ])
    ;(createDeviceGroup as jest.Mock).mockResolvedValue(
      makeGroup({ id: 10, name: '接入区', parent_id: 1 }),
    )

    const { client, invalidateSpy } = createTestClient()
    const onMutated = jest.fn()
    renderModal(client, { onMutated })

    await screen.findByText('总部数据中心')
    fireEvent.click(screen.getByRole('button', { name: '新建分组' }))

    fireEvent.change(screen.getByLabelText('分组名称'), { target: { value: '接入区' } })
    fireEvent.change(screen.getByRole('combobox', { name: '上级分组' }), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('描述（可选）'), { target: { value: '接入层交换机' } })
    fireEvent.click(screen.getByRole('button', { name: '确认创建' }))

    await waitFor(() => {
      expect(createDeviceGroup).toHaveBeenCalledWith({
        name: '接入区',
        description: '接入层交换机',
        parent_id: 1,
      })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: DEVICE_GROUPS_QUERY_KEY })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['devices'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['monitoring-devices'] })
    expect(onMutated).toHaveBeenCalledTimes(1)
  })

  it('编辑分组时自动过滤自身、后代以及导致层级超过 3 级的父分组选项', async () => {
    ;(getDeviceGroups as jest.Mock).mockResolvedValue([
      makeGroup({ id: 1, name: '总部', parent_id: null }),
      makeGroup({ id: 2, name: '汇聚层', parent_id: 1 }),
      makeGroup({ id: 3, name: '接入层', parent_id: 2 }),
      makeGroup({ id: 4, name: '华东', parent_id: null }),
      makeGroup({ id: 5, name: '机房A', parent_id: 4 }),
    ])
    ;(updateDeviceGroup as jest.Mock).mockResolvedValue(
      makeGroup({ id: 2, name: '汇聚层-改', parent_id: 4 }),
    )

    const { client, invalidateSpy } = createTestClient()
    renderModal(client)

    await screen.findByText('接入层')

    // 编辑 L2「汇聚层」(子树高 2)：可选上级应只包含根「无」、L1「总部」、L1「华东」；
    // 必须排除自身(2)、后代(3) 与 L2「机房A」(5，因 2+2=4 > 3)。
    fireEvent.click(screen.getByRole('button', { name: '编辑分组 汇聚层' }))
    const parentSelect = screen.getByRole('combobox', { name: '上级分组' })
    const optionValues = Array.from(within(parentSelect).getAllByRole('option')).map(
      (opt) => (opt as HTMLOptionElement).value,
    )
    expect(optionValues).toEqual(['__none__', '1', '4'])

    fireEvent.change(screen.getByLabelText('分组名称'), { target: { value: '汇聚层-改' } })
    fireEvent.change(parentSelect, { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }))

    await waitFor(() => {
      expect(updateDeviceGroup).toHaveBeenCalledWith(2, {
        name: '汇聚层-改',
        description: null,
        parent_id: 4,
      })
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: DEVICE_GROUPS_QUERY_KEY })
  })

  it('删除空分组直接走 reject；删除非空分组提供取消与移至未分组后删除', async () => {
    ;(getDeviceGroups as jest.Mock).mockResolvedValue([
      makeGroup({ id: 1, name: '空分组', device_count: 0 }),
      makeGroup({ id: 2, name: '非空分组', device_count: 3 }),
    ])
    ;(deleteDeviceGroup as jest.Mock).mockResolvedValue(true)

    const { client, invalidateSpy } = createTestClient()
    renderModal(client)

    await screen.findByText('空分组')

    // 空分组直接 delete(..., 'reject')
    fireEvent.click(screen.getByRole('button', { name: '删除分组 空分组' }))
    await waitFor(() => {
      expect(deleteDeviceGroup).toHaveBeenCalledWith(1, 'reject')
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: DEVICE_GROUPS_QUERY_KEY })
      expect(screen.getByRole('button', { name: '删除分组 非空分组' })).toBeEnabled()
    })

    // 非空分组先弹出确认，取消时不调用 API
    fireEvent.click(screen.getByRole('button', { name: '删除分组 非空分组' }))
    const confirmDialog = await screen.findByRole('alertdialog', { name: '非空分组删除确认' })
    expect(confirmDialog).toHaveTextContent('非空分组')
    fireEvent.click(within(confirmDialog).getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('alertdialog', { name: '非空分组删除确认' })).not.toBeInTheDocument()
    expect(deleteDeviceGroup).toHaveBeenCalledTimes(1)

    // 确认将设备移至未分组并删除 -> unassign
    fireEvent.click(screen.getByRole('button', { name: '删除分组 非空分组' }))
    fireEvent.click(screen.getByRole('button', { name: '将设备移至未分组并删除' }))
    await waitFor(() => {
      expect(deleteDeviceGroup).toHaveBeenCalledWith(2, 'unassign')
    })
  })

  it('本地计数为 0 但后端返回 409 时，也应引导选择移至未分组并删除', async () => {
    ;(getDeviceGroups as jest.Mock).mockResolvedValue([
      makeGroup({ id: 8, name: '并发写入组', device_count: 0 }),
    ])
    ;(deleteDeviceGroup as jest.Mock)
      .mockRejectedValueOnce(new ApiClientError({ status: 409, type: 'conflict', message: '分组非空' }))
      .mockResolvedValueOnce(true)

    const { client } = createTestClient()
    renderModal(client)

    await screen.findByText('并发写入组')
    fireEvent.click(screen.getByRole('button', { name: '删除分组 并发写入组' }))

    expect(await screen.findByRole('alertdialog', { name: '非空分组删除确认' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '将设备移至未分组并删除' }))

    await waitFor(() => {
      expect(deleteDeviceGroup).toHaveBeenNthCalledWith(2, 8, 'unassign')
    })
  })
})
