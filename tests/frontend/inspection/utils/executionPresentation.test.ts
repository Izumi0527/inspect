import {
  clampProgress,
  formatDateRangeFilterLabel,
  formatDeviceScore,
  formatExecutionDuration,
  formatStatusFilterLabel,
  getDeviceStatusMeta,
  getExecutionScoreMeta,
  getExecutionStatusMeta,
  getTriggerMeta,
  normalizeExecutionSummary,
} from '@/features/inspection/utils/executionPresentation'

describe('executionPresentation', () => {
  describe('formatExecutionDuration', () => {
    it('处理非法值、0秒与边界进位', () => {
      expect(formatExecutionDuration(undefined)).toBe('-')
      expect(formatExecutionDuration(Number.NaN)).toBe('-')
      expect(formatExecutionDuration(-5)).toBe('-')
      expect(formatExecutionDuration(0)).toBe('<1秒')
      expect(formatExecutionDuration(0.4)).toBe('<1秒')
      expect(formatExecutionDuration(42)).toBe('42秒')
      expect(formatExecutionDuration(59.8)).toBe('1分')
      expect(formatExecutionDuration(120)).toBe('2分')
      expect(formatExecutionDuration(125)).toBe('2分5秒')
      expect(formatExecutionDuration(3660)).toBe('1小时1分')
    })
  })

  describe('clampProgress', () => {
    it('将进度钳制在 0..100 整数', () => {
      expect(clampProgress(undefined)).toBe(0)
      expect(clampProgress(Number.NaN)).toBe(0)
      expect(clampProgress(-10)).toBe(0)
      expect(clampProgress(45.6)).toBe(46)
      expect(clampProgress(130)).toBe(100)
    })
  })

  describe('getExecutionStatusMeta & getDeviceStatusMeta', () => {
    it('返回执行状态语义元数据', () => {
      expect(getExecutionStatusMeta('running')).toMatchObject({
        label: '执行中',
        badgeVariant: 'info',
        progressBarClass: 'bg-primary',
      })
      expect(getExecutionStatusMeta('completed')).toMatchObject({
        label: '已完成',
        badgeVariant: 'success',
      })
      expect(getExecutionStatusMeta('failed')).toMatchObject({
        label: '失败',
        badgeVariant: 'error',
      })
      expect(getExecutionStatusMeta('cancelled')).toMatchObject({
        label: '已取消',
        badgeVariant: 'neutral',
      })
      expect(getExecutionStatusMeta('pending')).toMatchObject({
        label: '等待中',
        badgeVariant: 'warning',
      })
    })

    it('将设备状态映射为中文标签', () => {
      expect(getDeviceStatusMeta('success')).toEqual({ label: '正常', badgeVariant: 'success' })
      expect(getDeviceStatusMeta('warning')).toEqual({ label: '警告', badgeVariant: 'warning' })
      expect(getDeviceStatusMeta('error')).toEqual({ label: '异常', badgeVariant: 'error' })
      expect(getDeviceStatusMeta('offline')).toEqual({ label: '离线', badgeVariant: 'neutral' })
      expect(getDeviceStatusMeta('')).toEqual({ label: '未知', badgeVariant: 'neutral' })
    })
  })

  describe('getExecutionScoreMeta', () => {
    it('执行中尚无检查项时不展示误导性 0.0 分', () => {
      expect(getExecutionScoreMeta(0, 'running', 0)).toEqual({
        hasScore: false,
        display: '—',
        colorClass: 'text-muted-foreground',
        gradeLabel: '巡检中',
      })
    })

    it('按 90 / 70 阈值返回评分展示与等级文案', () => {
      expect(getExecutionScoreMeta(95.2, 'completed', 10)).toEqual({
        hasScore: true,
        display: '95.2',
        colorClass: 'text-success',
        gradeLabel: '优秀',
      })
      expect(getExecutionScoreMeta(73, 'completed', 20)).toEqual({
        hasScore: true,
        display: '73.0',
        colorClass: 'text-warning',
        gradeLabel: '良好',
      })
      expect(getExecutionScoreMeta(55, 'completed', 20)).toEqual({
        hasScore: true,
        display: '55.0',
        colorClass: 'text-danger',
        gradeLabel: '需要改进',
      })
    })
  })

  describe('getTriggerMeta & filter chip formatters', () => {
    it('格式化触发方式与筛选芯片标签', () => {
      expect(getTriggerMeta('scheduled')).toEqual({ label: '定时触发', isScheduled: true })
      expect(getTriggerMeta('manual')).toEqual({ label: '手动触发', isScheduled: false })
      expect(formatStatusFilterLabel('failed')).toBe('状态: 失败')
      expect(formatDateRangeFilterLabel('2026-11-01', '2026-11-26')).toBe('日期: 2026-11-01 ~ 2026-11-26')
      expect(formatDateRangeFilterLabel('2026-11-26', '2026-11-26')).toBe('日期: 2026-11-26')
      expect(formatDateRangeFilterLabel('', '')).toBe('')
    })
  })

  describe('normalizeExecutionSummary & formatDeviceScore', () => {
    it('在 summary 缺失或设备评分为 NaN/undefined 时安全兜底不崩溃', () => {
      expect(normalizeExecutionSummary(undefined)).toEqual({
        totalChecks: 0,
        passedChecks: 0,
        failedChecks: 0,
        warningChecks: 0,
        score: 0,
        deviceResults: [],
      })
      expect(normalizeExecutionSummary({ totalChecks: -3, score: Number.NaN })).toEqual({
        totalChecks: 0,
        passedChecks: 0,
        failedChecks: 0,
        warningChecks: 0,
        score: 0,
        deviceResults: [],
      })
      expect(formatDeviceScore(undefined)).toBe('—')
      expect(formatDeviceScore(Number.NaN)).toBe('—')
      expect(formatDeviceScore(88.45)).toBe('88.5')
      expect(formatDeviceScore(120)).toBe('100.0')
    })
  })
})
