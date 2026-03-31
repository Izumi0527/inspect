import React from 'react'
import { render, screen } from '@testing-library/react'
import { DeviceManagementView } from '@/features/devices/components/DeviceManagementView'

const mockLoadDevices = jest.fn<Promise<void>, [unknown?]>(() => Promise.resolve())
const mockSetError = jest.fn()
const mockAddDevice = jest.fn()
const mockRemoveDevice = jest.fn()
const mockImportDevices = jest.fn()

const createMockDevice = (id: number) => ({
  id,
  name: `edge-0${id}`,
  ip: `10.0.0.${id}`,
  device_type: 'router' as const,
  status: 'online' as const,
  location: 'A区',
  last_seen: '2026-03-10T00:00:00Z',
  uptime: '3600',
  alert_count: 1,
})

let mockDevices = [createMockDevice(1)]

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))

jest.mock('@/lib/contexts/auth-context', () => ({
  useAuth: () => ({
    user: {
      permissions: ['devices:create', 'devices:update', 'devices:delete'],
    },
  }),
}))

jest.mock('@/components/layout', () => ({
  AppLayout: ({
    children,
    title,
  }: {
    children: React.ReactNode
    title?: string
  }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}))

jest.mock('@/components/atoms', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Table: () => <div>table</div>,
  Column: () => null,
  Input: ({
    value,
    onChange,
    placeholder,
  }: {
    value?: string
    onChange?: React.ChangeEventHandler<HTMLInputElement>
    placeholder?: string
  }) => (
    <input value={value} onChange={onChange} placeholder={placeholder} />
  ),
  ConfirmModal: () => null,
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

  const extractItems = (node: React.ReactNode) => {
    return React.Children.toArray(node)
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
  }

  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value?: string
      onValueChange?: (value: string) => void
      children: React.ReactNode
    }) => {
      const childArray = React.Children.toArray(children).filter(React.isValidElement)
      const trigger = childArray.find(
        (child) => (child.type as { displayName?: string }).displayName === 'MockSelectTrigger'
      ) as React.ReactElement | undefined
      const items = extractItems(children)

      return (
        <select
          value={value}
          aria-label={trigger?.props?.['aria-label']}
          className={trigger?.props?.className}
          onChange={(event) => onValueChange?.(event.target.value)}
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

jest.mock('@/features/devices/components/DeviceIcon', () => ({
  DeviceIcon: () => <div>icon</div>,
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  getDeviceTypeLabel: (value: string) => value,
}))

jest.mock('@/features/devices/components/DeviceProbeButton', () => ({
  DeviceProbeButton: () => <button type="button">探测</button>,
}))

jest.mock('@/features/devices/components/DeviceStatsBar', () => ({
  DeviceStatsBar: () => <div>stats</div>,
}))

jest.mock('@/features/devices/components/BulkDeviceImport', () => ({
  BulkDeviceImport: () => null,
}))

jest.mock('@/features/devices/components/BulkDeviceUpdate', () => ({
  BulkDeviceUpdate: () => null,
}))

jest.mock('@/features/devices/components/modals/AddDeviceModal', () => ({
  AddDeviceModal: () => null,
}))

jest.mock('@/features/devices/components/modals/DeviceDetailsModal', () => ({
  DeviceDetailsModal: () => null,
}))

jest.mock('@/features/devices/components/modals/EditDeviceModal', () => ({
  EditDeviceModal: () => null,
}))

jest.mock('@/features/devices/hooks/useDevices', () => {
  const React = require('react')

  return {
    useDevices: () => ({
      devices: mockDevices,
      total: mockDevices.length,
      loading: false,
      error: null,
      errorStatus: null,
      setError: mockSetError,
      addDevice: mockAddDevice,
      removeDevice: mockRemoveDevice,
      importDevices: mockImportDevices,
      loadDevices: (...args: unknown[]) => mockLoadDevices(...args),
    }),
    useDeviceFilters: () => {
      const [filters, setFilters] = React.useState({
        searchQuery: '',
        statusFilter: 'all',
        typeFilter: 'all',
      })

      return {
        filters,
        updateFilter: (key: string, value: string) =>
          setFilters((prev: Record<string, string>) => ({
            ...prev,
            [key]: value,
          })),
      }
    },
    useDeviceSelection: () => ({
      selectedDevices: [],
      toggleDevice: jest.fn(),
      selectAll: jest.fn(),
      clearSelection: jest.fn(),
      setSelectedDevices: jest.fn(),
    }),
  }
})

jest.mock('@/features/devices/api/devices.api', () => ({
  fetchDevice: jest.fn(),
  fetchDeviceStats: jest.fn().mockResolvedValue({
    total_devices: 1,
    online_devices: 1,
    offline_devices: 0,
    alerting_devices: 0,
    total_alerts: 0,
  }),
  updateDevice: jest.fn(),
  batchDeleteDevices: jest.fn(),
  batchProbeDevices: jest.fn(),
  bulkUpdateDevices: jest.fn(),
}))

describe('DeviceManagementView 下拉规范', () => {
  beforeEach(() => {
    mockLoadDevices.mockResolvedValue(undefined)
  })

  it('应为状态和类型筛选提供明确的可访问名称', () => {
    render(<DeviceManagementView />)

    expect(screen.getByRole('combobox', { name: '设备状态筛选' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '设备类型筛选' })).toBeInTheDocument()
  })
})
