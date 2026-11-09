import {
  resolveTimeRangeMs,
  resolveTimeWindow,
  splitAtGaps,
} from '@/features/monitoring/utils/timeSeries'

const at = (iso: string) => ({ date: new Date(iso) })

describe('resolveTimeRangeMs', () => {
  it('解析小时/天/周档位', () => {
    expect(resolveTimeRangeMs('1h')).toBe(3_600_000)
    expect(resolveTimeRangeMs('24h')).toBe(86_400_000)
    expect(resolveTimeRangeMs('3d')).toBe(3 * 86_400_000)
    expect(resolveTimeRangeMs('1w')).toBe(7 * 86_400_000)
  })

  it('无法解析时返回 null，由调用方退回按数据首尾定范围', () => {
    expect(resolveTimeRangeMs(undefined)).toBeNull()
    expect(resolveTimeRangeMs('abc')).toBeNull()
    expect(resolveTimeRangeMs('0h')).toBeNull()
  })
})

describe('resolveTimeWindow', () => {
  const now = new Date('2026-11-09T00:00:00Z').getTime()

  it('窗口 = [当前时间 - 档位, 当前时间]', () => {
    const [start, end] = resolveTimeWindow('24h', now, [new Date('2026-11-08T23:00:00Z')])

    expect(start.toISOString()).toBe('2026-11-08T00:00:00.000Z')
    expect(end.toISOString()).toBe('2026-11-09T00:00:00.000Z')
  })

  it('服务器时钟快于浏览器、最新点晚于当前时间时，窗口终点顺延到最新点，避免画出右边界', () => {
    const [start, end] = resolveTimeWindow('1h', now, [new Date('2026-11-09T00:02:00Z')])

    expect(end.toISOString()).toBe('2026-11-09T00:02:00.000Z')
    expect(start.toISOString()).toBe('2026-11-08T23:02:00.000Z')
  })

  it('档位无法解析时按数据首尾', () => {
    const [start, end] = resolveTimeWindow(undefined, now, [
      new Date('2026-11-08T10:00:00Z'),
      new Date('2026-11-08T12:00:00Z'),
    ])

    expect(start.toISOString()).toBe('2026-11-08T10:00:00.000Z')
    expect(end.toISOString()).toBe('2026-11-08T12:00:00.000Z')
  })
})

describe('splitAtGaps（相邻两点超过 2 个采样周期即断开）', () => {
  it('正好 2 个采样周期（只缺一个点）仍连成一段', () => {
    const segments = splitAtGaps([at('2026-11-09T00:00:00Z'), at('2026-11-09T00:10:00Z')])
    expect(segments).toHaveLength(1)
  })

  it('超过 2 个采样周期断成两段', () => {
    const segments = splitAtGaps([at('2026-11-09T00:00:00Z'), at('2026-11-09T00:15:00Z')])
    expect(segments).toHaveLength(2)
  })
})
