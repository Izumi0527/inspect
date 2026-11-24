import { renderHook, waitFor } from '@testing-library/react'
import { useLogs, useLogStats } from '@/features/logs/hooks/useLogs'
import * as logsApi from '@/features/logs/api/logsApi'

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))

jest.mock('@/hooks/useDatetimePreferencesSync', () => ({
  useDisplayPreferences: () => ({ data: undefined }),
}))

jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/features/logs/api/logsApi', () => ({
  getAllLogs: jest.fn(),
  getDeviceLogs: jest.fn(),
  getLogStatistics: jest.fn(),
  deleteLog: jest.fn(),
  batchDeleteLogs: jest.fn(),
  collectDeviceLogs: jest.fn(),
  batchCollectLogs: jest.fn(),
  getRecentLogs: jest.fn(),
}))

describe('useLogs & useLogStats', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('直接透传后端分页与全部日志条数，不再二次前端过滤或扣减 total', async () => {
    const items = Array.from({ length: 10 }, (_, idx) => ({
      id: idx + 1,
      device_id: 1,
      device_name: 'core-sw-1',
      level: 'warning' as const,
      facility: 'interface' as const,
      source: 'syslog' as const,
      message:
        idx === 0
          ? 'ERRDOWN/4/ERRDOWN_DOWNRECOVER: The interface GE0/0/1 leaves the error-down state'
          : `Port ${idx} notice`,
      log_timestamp: '2026-11-24T00:00:00Z',
      collected_at: '2026-11-24T00:00:00Z',
      created_at: '2026-11-24T00:00:00Z',
    }))

    ;(logsApi.getAllLogs as jest.Mock).mockResolvedValue({
      items,
      total: 17907,
      page: 1,
      page_size: 10,
      total_pages: 1791,
      has_next: true,
      has_prev: false,
    })

    const { result } = renderHook(() =>
      useLogs({ page: 1, page_size: 10, exclude_search: '错包' })
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.logs).toHaveLength(10)
    expect(result.current.pagination.total).toBe(17907)
  })

  it('useLogStats 透传 exclude_search 参数并忽略过期响应', async () => {
    let resolveFirst!: (val: unknown) => void
    const firstPromise = new Promise((res) => {
      resolveFirst = res
    })

    ;(logsApi.getLogStatistics as jest.Mock)
      .mockReturnValueOnce(firstPromise)
      .mockResolvedValueOnce({
        total_logs: 42,
        by_level: { info: 42 },
        by_facility: { system: 42 },
        by_device: {},
        trends: {},
        time_range_hours: 24,
      })

    const { result, rerender } = renderHook(
      ({ excludeSearch }: { excludeSearch?: string }) => useLogStats(24, excludeSearch),
      { initialProps: { excludeSearch: '电源' } }
    )

    expect(logsApi.getLogStatistics).toHaveBeenLastCalledWith(24, '电源')

    rerender({ excludeSearch: '电源,NTP' })
    expect(logsApi.getLogStatistics).toHaveBeenLastCalledWith(24, '电源,NTP')

    await waitFor(() => {
      expect(result.current.stats?.total_logs).toBe(42)
    })

    // 过期请求晚到时不能覆盖新统计结果
    resolveFirst({
      total_logs: 999,
      by_level: { info: 999 },
      by_facility: { system: 999 },
      by_device: {},
      trends: {},
      time_range_hours: 24,
    })

    await waitFor(() => {
      expect(result.current.stats?.total_logs).toBe(42)
    })
  })
})
