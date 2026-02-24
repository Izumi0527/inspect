import { act, renderHook, waitFor } from '@testing-library/react'
import { useAlerts } from '@/features/alerts/hooks/useAlerts'
import {
  fetchAlerts,
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
