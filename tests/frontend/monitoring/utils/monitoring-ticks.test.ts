import {
  MONITORING_DATA_STALE_THRESHOLD_MS,
  MONITORING_SAMPLE_INTERVAL_MINUTES,
  TIME_RANGE_OPTIONS,
  resolveTickStepMinutes,
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

describe('resolveTickStepMinutes（刻度既落在自然边界，又对得上采样点）', () => {
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

  // 两条约束缺一不可：整除 24 小时 → 按 epoch 对齐落在整点；是采样间隔的整倍数 → 刻度点上真的有数据
  it('每个档位的步长都能整除 24 小时且是采样间隔的整倍数', () => {
    for (const option of TIME_RANGE_OPTIONS) {
      const step = resolveTickStepMinutes(option.value)
      expect((24 * 60) % step).toBe(0)
      expect(step % MONITORING_SAMPLE_INTERVAL_MINUTES).toBe(0)
    }
  })

  it('未知范围按 范围/12 向上取采样间隔的整倍数兜底', () => {
    // 2h = 120min / 12 = 10min，恰为 5 分钟的整倍数 → 10min
    expect(resolveTickStepMinutes('2h')).toBe(10)
  })

  it('非法输入回退 120 分钟', () => {
    expect(resolveTickStepMinutes('abc')).toBe(120)
  })
})

describe('采样间隔与陈旧阈值', () => {
  it('采样间隔常量为 5 分钟，与采集任务 cron 一致', () => {
    expect(MONITORING_SAMPLE_INTERVAL_MINUTES).toBe(5)
  })

  it('陈旧阈值所有档位统一 15 分钟：5 分钟桶 + 5 分钟采集，容忍一轮采集缺失', () => {
    expect(MONITORING_DATA_STALE_THRESHOLD_MS).toBe(15 * 60 * 1000)
  })
})
