import React from 'react'
import { render } from '@testing-library/react'
import { AuditLogs } from '@/features/settings/components/audit/AuditLogs'

const mockUseAuditLogs = jest.fn()
const mockUseDateFilters = jest.fn()
const mockUseSettingsTabCapabilities = jest.fn()

jest.mock('@/features/settings/hooks/useAuditLogs', () => ({
  useAuditLogs: (...args: unknown[]) => mockUseAuditLogs(...args),
}))

jest.mock('@/hooks/useDateFilters', () => ({
  useDateFilters: (...args: unknown[]) => mockUseDateFilters(...args),
}))

jest.mock('@/features/settings/hooks/useSettingsTabCapabilities', () => ({
  useSettingsTabCapabilities: (...args: unknown[]) =>
    mockUseSettingsTabCapabilities(...args),
}))

jest.mock('@/features/settings/components/audit/AuditLogDetailDialog', () => ({
  AuditLogDetailDialog: () => null,
}))

jest.mock('@/features/settings/components/audit/AuditLogFilters', () => ({
  AuditLogFilters: () => <div>审计日志筛选器</div>,
}))

jest.mock('@/features/settings/components/shared/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}))

jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

describe('AuditLogs', () => {
  beforeEach(() => {
    mockUseSettingsTabCapabilities.mockReset()
    mockUseDateFilters.mockReturnValue({
      getDateRange: jest.fn(() => ({
        startDate: '2026-04-01',
        endDate: '2026-04-23',
      })),
    })
    mockUseAuditLogs.mockReturnValue({
      logs: [],
      totalCount: 0,
      page: 1,
      pageSize: 20,
      stats: {
        totalLogs: 10,
        todayLogs: 2,
        successRate: 0.9,
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      updateQueryParams: jest.fn(),
      exportLogs: jest.fn(),
    })
  })

  it('向外壳注册与用户管理一致的同一行头部布局', () => {
    render(<AuditLogs />)

    const capabilities = mockUseSettingsTabCapabilities.mock.calls[0][1]
    expect(capabilities.headerLayout).toBe('inline')
    expect(capabilities.toolbar.layout).toBe('end')
    expect(capabilities.primaryActions[0].label).toBe('导出日志')
    expect(capabilities.secondaryActions[0].label).toBe('刷新')
  })
})
