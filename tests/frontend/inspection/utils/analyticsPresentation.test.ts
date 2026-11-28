import {
  buildAnalyticsDateRange,
  formatAnalyticsDateLabel,
  getComparisonBaselineLabel,
  normalizeDeviceDistribution,
  normalizeProblemRanking,
  parseChangeTrend,
  summarizeTrends,
} from '@/features/inspection/utils/analyticsPresentation'

describe('analyticsPresentation', () => {
  describe('getComparisonBaselineLabel & buildAnalyticsDateRange', () => {
    it('返回各周期环比基线与不依赖 toISOString 的日期区间', () => {
      expect(getComparisonBaselineLabel('day')).toBe('vs 前一日')
      expect(getComparisonBaselineLabel('week')).toBe('vs 上周')
      expect(getComparisonBaselineLabel('month')).toBe('vs 上月')

      const isoSpy = jest.spyOn(Date.prototype, 'toISOString').mockImplementation(() => {
        throw new Error('不应依赖 toISOString')
      })

      const anchor = new Date(2026, 10, 26, 12, 0, 0)
      expect(buildAnalyticsDateRange('day', anchor)).toEqual({
        startDate: '2026-11-20',
        endDate: '2026-11-26',
      })
      expect(buildAnalyticsDateRange('week', anchor)).toEqual({
        startDate: '2026-10-30',
        endDate: '2026-11-26',
      })
      expect(buildAnalyticsDateRange('month', anchor)).toEqual({
        startDate: '2025-12-01',
        endDate: '2026-11-26',
      })

      isoSpy.mockRestore()
    })
  })

  describe('formatAnalyticsDateLabel', () => {
    it('按周期切分 YYYY-MM-DD 标签，不受时区干扰', () => {
      expect(formatAnalyticsDateLabel('2026-11-05', 'day')).toBe('11/05')
      expect(formatAnalyticsDateLabel('2026-11-05T00:00:00Z', 'week')).toBe('11/05')
      expect(formatAnalyticsDateLabel('2026-11-05', 'month')).toBe('2026/11')
      expect(formatAnalyticsDateLabel('invalid-date', 'week')).toBe('invalid-date')
    })
  })

  describe('parseChangeTrend', () => {
    it('如实解析正值、负值、零值与空值方向和颜色', () => {
      expect(parseChangeTrend('3.5%')).toEqual({
        direction: 'up',
        arrow: '↗',
        colorClass: 'text-success',
        display: '+3.5%',
      })
      expect(parseChangeTrend('+12.0%')).toEqual({
        direction: 'up',
        arrow: '↗',
        colorClass: 'text-success',
        display: '+12.0%',
      })
      expect(parseChangeTrend('-4.2%')).toEqual({
        direction: 'down',
        arrow: '↘',
        colorClass: 'text-danger',
        display: '-4.2%',
      })
      expect(parseChangeTrend('0.0%')).toEqual({
        direction: 'flat',
        arrow: '→',
        colorClass: 'text-muted-foreground',
        display: '0.0%',
      })
      expect(parseChangeTrend('')).toEqual({
        direction: 'flat',
        arrow: '→',
        colorClass: 'text-muted-foreground',
        display: '0.0%',
      })
      expect(parseChangeTrend('NaN%')).toEqual({
        direction: 'flat',
        arrow: '→',
        colorClass: 'text-muted-foreground',
        display: '0.0%',
      })
      expect(parseChangeTrend('Infinity%')).toEqual({
        direction: 'flat',
        arrow: '→',
        colorClass: 'text-muted-foreground',
        display: '0.0%',
      })
    })
  })

  describe('summarizeTrends', () => {
    it('排除零执行空槽后计算有效均分与极值区间', () => {
      expect(summarizeTrends([])).toEqual({
        totalExecutions: 0,
        totalSuccess: 0,
        totalFailed: 0,
        avgScore: 0,
        minScore: 0,
        maxScore: 0,
        hasScorePoints: false,
      })

      const result = summarizeTrends([
        { executions: 0, success: 0, failed: 0, avgScore: 0 },
        { executions: 2, success: 0, failed: 2, avgScore: 0 },
        { executions: 2, success: 2, failed: 0, avgScore: 80 },
        { executions: 3, success: 2, failed: 1, avgScore: 95 },
      ])
      expect(result).toEqual({
        totalExecutions: 7,
        totalSuccess: 4,
        totalFailed: 3,
        avgScore: 87.5,
        minScore: 80,
        maxScore: 95,
        hasScorePoints: true,
      })
    })
  })

  describe('normalizeDeviceDistribution & normalizeProblemRanking', () => {
    it('翻译设备类型中文名并按降序分配语义配色', () => {
      const normalized = normalizeDeviceDistribution([
        { name: 'firewall', value: 2, color: '#EE6666' },
        { name: 'switch', value: 5, color: '#5470C6' },
        { name: '交换机', value: 1, color: '#91CC75' },
        { name: 'router', value: 0, color: '#FAC858' },
      ])

      expect(normalized.totalDevices).toBe(8)
      expect(normalized.items).toEqual([
        { name: '交换机', value: 6, color: 'var(--brand)' },
        { name: '防火墙', value: 2, color: 'var(--info)' },
      ])
    })

    it('归并问题类别、降序排序并计算占比与进度条宽度', () => {
      const ranking = normalizeProblemRanking([
        { category: 'CPU使用率', count: 3 },
        { category: '端口状态', count: 7 },
        { category: '', count: 0 },
      ])

      expect(ranking.totalProblems).toBe(10)
      expect(ranking.items).toEqual([
        { category: '端口状态', count: 7, percent: 70, barPercent: 70 },
        { category: 'CPU使用率', count: 3, percent: 30, barPercent: 30 },
      ])
    })
  })
})
