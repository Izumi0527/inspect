import {
  MONITORING_DATA_STALE_THRESHOLD_MS,
  TIME_RANGE_OPTIONS,
  resolveTickStepMinutes,
  selectTimeTickLabels,
} from '@/features/monitoring/utils/monitoring'

describe('TIME_RANGE_OPTIONS', () => {
  it('应为八档：1h/3h/6h/12h/24h/3d/7d/14d', () => {
    expect(TIME_RANGE_OPTIONS.map((item) => item.value)).toEqual([
      '1h',
      '3h',
      '6h',
      '12h',
      '24h',
      '3d',
      '7d',
      '14d',
    ])
  })

  it('标签应为中文近N描述', () => {
    expect(TIME_RANGE_OPTIONS.map((item) => item.label)).toEqual([
      '近1小时',
      '近3小时',
      '近6小时',
      '近12小时',
      '近1天',
      '近3天',
      '近7天',
      '近14天',
    ])
  })
})

describe('resolveTickStepMinutes（刻度落在自然边界）', () => {
  it.each([
    ['1h', 5],
    ['3h', 15],
    ['6h', 30],
    ['12h', 60],
    ['24h', 120],
    ['3d', 360],
    ['7d', 720],
    ['14d', 1440],
  ])('%s → %d 分钟', (range, expected) => {
    expect(resolveTickStepMinutes(range)).toBe(expected)
  })

  // 步长整除 24 小时时 selectTimeTickLabels 才会按 epoch 对齐，刻度落在整点/整 12 点等自然边界
  it('每个档位的刻度步长都能整除 24 小时', () => {
    for (const option of TIME_RANGE_OPTIONS) {
      expect((24 * 60) % resolveTickStepMinutes(option.value)).toBe(0)
    }
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

describe('MONITORING_DATA_STALE_THRESHOLD_MS（所有档位统一）', () => {
  it('统一 10 分钟：5 分钟桶 + 约 3 分钟采集，容忍两轮采集缺失', () => {
    expect(MONITORING_DATA_STALE_THRESHOLD_MS).toBe(10 * 60 * 1000)
  })
})
