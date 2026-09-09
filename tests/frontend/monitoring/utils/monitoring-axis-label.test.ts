import {
  DEVICE_SERIES_COLORS,
  resolveTimeAxisLabelFormatter,
} from '@/features/monitoring/utils/monitoring'
import { formatDateTimeMDHM, formatTimeHM } from '@/utils/formatters'

describe('resolveTimeAxisLabelFormatter（X 轴时间标签）', () => {
  const date = new Date('2026-09-06T12:34:00Z')

  it.each(['1h', '12h', '24h', ' 1H '])('%p：不超过 24 小时只显示 时:分', (range) => {
    expect(resolveTimeAxisLabelFormatter(range)(date)).toBe(formatTimeHM(date))
  })

  it.each(['25h', '3d', '7d', '2w'])('%p：超过 24 小时带上 月/日', (range) => {
    expect(resolveTimeAxisLabelFormatter(range)(date)).toBe(formatDateTimeMDHM(date))
  })

  it.each([undefined, '', 'abc', '0h', '-1h'])('缺省或非法范围 %p 回退为只显示 时:分', (range) => {
    expect(resolveTimeAxisLabelFormatter(range)(date)).toBe(formatTimeHM(date))
  })

  it('非法日期返回 "-"', () => {
    expect(resolveTimeAxisLabelFormatter('1h')(new Date('invalid'))).toBe('-')
  })
})

describe('DEVICE_SERIES_COLORS（设备曲线调色板）', () => {
  it('固定 5 色且互不相同，温度图与性能图共用', () => {
    expect(DEVICE_SERIES_COLORS).toHaveLength(5)
    expect(new Set(DEVICE_SERIES_COLORS).size).toBe(5)
    expect(DEVICE_SERIES_COLORS[0]).toBe('#0891B2')
  })
})
