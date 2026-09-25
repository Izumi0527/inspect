import { renderHook, waitFor } from '@testing-library/react'
import {
  describeInspectionRetention,
  useDeleteImpactNotice,
} from '@/features/devices/hooks/useDeleteImpactNotice'
import { fetchDeviceInspectionCount } from '@/features/devices/api/devices.api'

jest.mock('@/features/devices/api/devices.api', () => ({
  fetchDeviceInspectionCount: jest.fn(),
}))

const mockCount = fetchDeviceInspectionCount as jest.Mock

describe('describeInspectionRetention', () => {
  it('没有巡检记录时不提示', () => {
    expect(describeInspectionRetention(0, 1)).toBe('')
  })

  it('单台与多台用不同主语', () => {
    expect(describeInspectionRetention(12, 1)).toBe(
      '该设备有 12 条巡检记录，删除后这些记录和巡检报告仍会保留删除时的设备名称、IP 等信息。'
    )
    expect(describeInspectionRetention(30, 3)).toContain('所选设备共有 30 条巡检记录')
  })
})

describe('useDeleteImpactNotice', () => {
  it('确认框打开时按所选设备查询并给出提示', async () => {
    mockCount.mockResolvedValue(5)

    const { result } = renderHook(() => useDeleteImpactNotice([6, 17], true))

    await waitFor(() => expect(result.current).toContain('所选设备共有 5 条巡检记录'))
    expect(mockCount).toHaveBeenCalledWith([6, 17])
  })

  it('确认框未打开时不查询', () => {
    renderHook(() => useDeleteImpactNotice([6], false))

    expect(mockCount).not.toHaveBeenCalled()
  })

  it('查询失败时静默降级为无提示，不影响删除', async () => {
    mockCount.mockRejectedValue(new Error('403'))

    const { result } = renderHook(() => useDeleteImpactNotice([6], true))

    await waitFor(() => expect(mockCount).toHaveBeenCalled())
    expect(result.current).toBe('')
  })

  it('切换所选设备后不沿用上一次的条数', async () => {
    mockCount.mockResolvedValueOnce(5).mockReturnValueOnce(new Promise(() => {}))

    const { result, rerender } = renderHook(
      ({ ids }: { ids: number[] }) => useDeleteImpactNotice(ids, true),
      { initialProps: { ids: [6] } }
    )
    await waitFor(() => expect(result.current).toContain('5 条'))

    rerender({ ids: [17] })

    expect(result.current).toBe('')
  })
})
