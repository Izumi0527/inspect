import {
  TIME_RANGE_OPTIONS,
  resolveMonitoringDataStaleThresholdMs,
  resolveTickStepMinutes,
  selectTimeTickLabels,
} from '@/features/monitoring/utils/monitoring'

describe('TIME_RANGE_OPTIONS', () => {
  it('应为五档：1h/12h/24h/3d/7d', () => {
    expect(TIME_RANGE_OPTIONS.map((item) => item.value)).toEqual(['1h', '12h', '24h', '3d', '7d'])
  })

  it('标签应为中文近N描述', () => {
    expect(TIME_RANGE_OPTIONS.map((item) => item.label)).toEqual([
      '近1小时',
      '近12小时',
      '近24小时',
      '近3天',
      '近7天',
    ])
  })
})

describe('resolveTickStepMinutes（刻度=范围/12）', () => {
  it.each([
    ['1h', 5],
    ['12h', 60],
    ['24h', 120],
    ['3d', 360],
    ['7d', 840],
  ])('%s → %d 分钟', (range, expected) => {
    expect(resolveTickStepMinutes(range)).toBe(expected)
  })

  it('未知范围按 范围/12 向上取 5 的倍数兜底', () => {
    // 2h = 120min / 12 = 10min
    expect(resolveTickStepMinutes('2h')).toBe(10)
  })

  it('非法输入回退 120 分钟', () => {
    expect(resolveTickStepMinutes('abc')).toBe(120)
  })
})

describe('selectTimeTickLabels', () => {
  const fmt = (date: Date) =>
    `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`

  it('5 分钟采集点 + 5 分钟步长：全部入选（1h 档）', () => {
    const points = Array.from({ length: 12 }, (_, i) => ({
      timestamp: new Date(Date.UTC(2026, 6, 25, 13, i * 5)).toISOString(),
    }))
    const labels = selectTimeTickLabels(points, 5, fmt)
    expect(labels).toHaveLength(12)
    expect(labels[0]).toBe('13:00')
    expect(labels[11]).toBe('13:55')
  })

  it('5 分钟采集点 + 60 分钟步长：仅整点入选（12h 档）', () => {
    const points = Array.from({ length: 25 }, (_, i) => ({
      timestamp: new Date(Date.UTC(2026, 6, 25, 12, 0) + i * 5 * 60_000).toISOString(),
    }))
    const labels = selectTimeTickLabels(points, 60, fmt)
    expect(labels).toEqual(['12:00', '13:00', '14:00'])
  })

  it('步长不整除 24 小时（14h）时按首点锚定', () => {
    const base = Date.UTC(2026, 6, 20, 3, 0)
    const points = Array.from({ length: 29 }, (_, i) => ({
      timestamp: new Date(base + i * 60 * 60_000).toISOString(),
    }))
    const labels = selectTimeTickLabels(points, 14 * 60, fmt)
    // 首点 03:00 锚定，其后每 14 小时：03:00、17:00、07:00(次日+28h)
    expect(labels).toEqual(['03:00', '17:00', '07:00'])
  })

  it('空数据返回空数组', () => {
    expect(selectTimeTickLabels([], 5, fmt)).toEqual([])
  })
})

describe('resolveMonitoringDataStaleThresholdMs（新五档）', () => {
  it.each([
    ['1h', 10 * 60 * 1000],
    ['12h', 10 * 60 * 1000],
    ['24h', 10 * 60 * 1000],
    ['3d', 2 * 60 * 60 * 1000],
    ['7d', 2 * 60 * 60 * 1000],
  ])('%s → %d ms', (range, expected) => {
    expect(resolveMonitoringDataStaleThresholdMs(range)).toBe(expected)
  })
})
