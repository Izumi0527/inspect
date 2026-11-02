import { act, renderHook, waitFor } from '@testing-library/react'
import { useAlerts, useAlertStats } from '@/features/alerts/hooks/useAlerts'
import {
  fetchAlerts,
  fetchAlertStats,
  acknowledgeAlert,
  resolveAlert,
  deleteAlert,
} from '@/features/alerts/api/alerts.api'

jest.mock('@/features/alerts/api/alerts.api', () => ({
  fetchAlerts: jest.fn(),
  fetchAlertStats: jest.fn(),
  acknowledgeAlert: jest.fn(),
  resolveAlert: jest.fn(),
  bulkAlertAction: jest.fn(),
  deleteAlert: jest.fn(),
}))

const mockListResponse = {
  alerts: [
    {
      id: '1',
      title: '测试告警',
      description: 'desc',
      device: '设备A',
      severity: 'warning' as const,
      status: 'active' as const,
      timestamp: new Date().toISOString(),
      category: 'other',
      tags: [],
      metadata: {},
    },
  ],
  total: 1,
  page: 1,
  pageSize: 10,
  currentPage: 1,
  hasNext: false,
  hasPrev: false,
}

describe('useAlerts 单条操作行为', () => {
  const stableQuery = { page: 1, pageSize: 10 }

  beforeEach(() => {
    ;(fetchAlerts as jest.Mock).mockResolvedValue(mockListResponse)
    ;(acknowledgeAlert as jest.Mock).mockResolvedValue(true)
    ;(resolveAlert as jest.Mock).mockResolvedValue(true)
    ;(deleteAlert as jest.Mock).mockResolvedValue(true)
  })

  it('确认/解决/删除不应在 hook 内重复触发列表刷新', async () => {
    const { result } = renderHook(() => useAlerts(stableQuery))

    await waitFor(() => {
      expect(fetchAlerts).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      await result.current.handleAcknowledgeAlert('1')
      await result.current.handleResolveAlert('1')
      await result.current.handleDeleteAlert('1')
    })

    expect(fetchAlerts).toHaveBeenCalledTimes(1)
    expect(acknowledgeAlert).toHaveBeenCalledTimes(1)
    expect(resolveAlert).toHaveBeenCalledTimes(1)
    expect(deleteAlert).toHaveBeenCalledTimes(1)
  })
})

describe('useAlertStats 屏蔽关键字透传', () => {
  const stats = { total: 0, critical: 0, warning: 0, info: 0, active: 0, acknowledged: 0, resolved: 0 }

  beforeEach(() => {
    ;(fetchAlertStats as jest.Mock).mockReset()
    ;(fetchAlertStats as jest.Mock).mockResolvedValue(stats)
  })

  it('有屏蔽词时应把 excludeSearch 传给统计接口', async () => {
    renderHook(() => useAlertStats('NTP'))

    await waitFor(() => {
      expect(fetchAlertStats).toHaveBeenCalledWith({ excludeSearch: 'NTP' })
    })
  })

  it('无屏蔽词时 excludeSearch 为 undefined', async () => {
    renderHook(() => useAlertStats())

    await waitFor(() => {
      expect(fetchAlertStats).toHaveBeenCalledTimes(1)
    })
    const firstArg = (fetchAlertStats as jest.Mock).mock.calls[0][0] as { excludeSearch?: string } | undefined
    expect(firstArg?.excludeSearch).toBeUndefined()
  })
})
