import React from 'react'
import { render, screen } from '@testing-library/react'

import { AuditLogs } from '@/features/settings/components/audit/AuditLogs'
import { SettingsShellProvider } from '@/features/settings/context/SettingsShellContext'

const mockUseAuditLogs = jest.fn()

jest.mock('@/features/settings/hooks/useAuditLogs', () => ({
  useAuditLogs: () => mockUseAuditLogs(),
}))

describe('AuditLogs 错误态', () => {
  beforeEach(() => {
    mockUseAuditLogs.mockReturnValue({
      logs: [],
      totalCount: 0,
      page: 1,
      pageSize: 50,
      stats: null,
      isLoading: false,
      error: new Error('boom'),
      refetch: jest.fn(),
      updateQueryParams: jest.fn(),
      exportLogs: jest.fn(),
    })
  })

  it('加载失败时应展示明确错误提示', () => {
    render(
      <SettingsShellProvider activeTabKey="audit">
        <AuditLogs />
      </SettingsShellProvider>
    )

    expect(screen.getByText('加载审计日志失败')).toBeInTheDocument()
  })
})
