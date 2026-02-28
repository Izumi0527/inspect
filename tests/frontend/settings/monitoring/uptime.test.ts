import { formatUptime } from '@/features/settings/components/monitoring/uptime'

describe('formatUptime', () => {
  it('空值应显示不可用', () => {
    expect(formatUptime(null)).toBe('不可用')
    expect(formatUptime(undefined)).toBe('不可用')
  })

  it('非法值应显示不可用', () => {
    expect(formatUptime(Number.NaN)).toBe('不可用')
    expect(formatUptime(-1)).toBe('不可用')
  })

  it('零值应正确格式化', () => {
    expect(formatUptime(0)).toBe('0天 0小时 0分钟')
  })

  it('正值应正确格式化', () => {
    expect(formatUptime(3661)).toBe('0天 1小时 1分钟')
    expect(formatUptime(90061)).toBe('1天 1小时 1分钟')
  })
})
