import {
  MONITORING_DATA_STALE_THRESHOLD_MS,
  MONITORING_SAMPLE_INTERVAL_MINUTES,
  TIME_RANGE_OPTIONS,
  formatCustomDateRangeSummary,
  formatCustomDateRangeValue,
  formatMonitoringTimeRangeTriggerLabel,
  isValidMonitoringTimeRange,
  parseCustomDateRange,
  resolveTickStepMinutes,
  shouldShowDateOnTimeAxis,
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

describe('自定义日期范围工具函数', () => {
  const nowMs = new Date(2026, 10, 15, 12, 0, 0, 0).getTime()

  it('parseCustomDateRange 正确解析合法多日与单日范围，拒绝超限/反序/未来/非法日期', () => {
    const multi = parseCustomDateRange('2026-11-09..2026-11-12', nowMs)
    expect(multi).not.toBeNull()
    expect(multi?.days).toBe(4)
    expect(multi?.startMs).toBe(new Date(2026, 10, 9, 0, 0, 0, 0).getTime())
    expect(multi?.endMs).toBe(new Date(2026, 10, 12, 23, 59, 59, 999).getTime())

    const single = parseCustomDateRange('2026-11-09..2026-11-09', nowMs)
    expect(single?.days).toBe(1)

    const todayTruncated = parseCustomDateRange('2026-11-14..2026-11-15', nowMs)
    expect(todayTruncated?.days).toBe(2)
    expect(todayTruncated?.endMs).toBe(nowMs)

    expect(parseCustomDateRange('2026-11-02..2026-11-15', nowMs)?.days).toBe(14)
    expect(parseCustomDateRange('2026-11-01..2026-11-15', nowMs)).toBeNull()
    expect(parseCustomDateRange('2026-11-12..2026-11-09', nowMs)).toBeNull()
    expect(parseCustomDateRange('2026-11-16..2026-11-17', nowMs)).toBeNull()
    expect(parseCustomDateRange('2026-02-30..2026-03-01', nowMs)).toBeNull()
  })

  it('formatCustomDateRangeValue 自动归正起止顺序', () => {
    expect(formatCustomDateRangeValue('2026-11-12', '2026-11-09')).toBe('2026-11-09..2026-11-12')
  })

  it('isValidMonitoringTimeRange 校验预设与自定义范围', () => {
    expect(isValidMonitoringTimeRange('6h', nowMs)).toBe(true)
    expect(isValidMonitoringTimeRange('2026-11-09..2026-11-12', nowMs)).toBe(true)
    expect(isValidMonitoringTimeRange('2026-11-01..2026-11-15', nowMs)).toBe(false)
    expect(isValidMonitoringTimeRange('invalid', nowMs)).toBe(false)
  })

  it('formatMonitoringTimeRangeTriggerLabel 格式化触发器文案', () => {
    expect(formatMonitoringTimeRangeTriggerLabel('6h')).toBe('近6小时')
    expect(formatMonitoringTimeRangeTriggerLabel('2026-11-09..2026-11-12')).toBe('11/09 → 11/12')
  })

  it('formatCustomDateRangeSummary 生成中文汇总文案', () => {
    expect(formatCustomDateRangeSummary('2026-11-09', '2026-11-12')).toBe('11月09日 — 11月12日，共 4 天')
  })

  it('resolveTickStepMinutes 与 shouldShowDateOnTimeAxis 支持自定义范围', () => {
    expect(resolveTickStepMinutes('2026-11-09..2026-11-09')).toBe(120)
    expect(resolveTickStepMinutes('2026-11-09..2026-11-11')).toBe(360)
    expect(resolveTickStepMinutes('2026-11-09..2026-11-12')).toBe(720)
    expect(resolveTickStepMinutes('2026-11-01..2026-11-14')).toBe(1440)

    expect(shouldShowDateOnTimeAxis('2026-11-09..2026-11-09')).toBe(false)
    expect(shouldShowDateOnTimeAxis('2026-11-09..2026-11-12')).toBe(true)
  })
})
