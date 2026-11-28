import {
  buildCronFromSchedule,
  describeCronExpression,
  describeSchedule,
  formatRelativeFutureTime,
  parseCronToSchedule,
} from '@/features/inspection/utils/strategySchedule'

describe('strategySchedule 工具函数', () => {
  it('应能将 6 段和 5 段 Cron 表达式翻译为简洁中文执行计划', () => {
    expect(describeCronExpression('0 0 2 * * ?')).toBe('每天 02:00')
    expect(describeCronExpression('0 30 9 ? * WED')).toBe('每周三 09:30')
    expect(describeCronExpression('0 15 4 12 * ?')).toBe('每月 12日 04:15')
    expect(describeCronExpression('0 0 * * * ?')).toBe('每小时整点')
    expect(describeCronExpression('0 */30 * * * ?')).toBe('每 30 分钟')
    expect(describeCronExpression('0 9 * * *')).toBe('每天 09:00')
    expect(describeCronExpression('30 9 * * 3')).toBe('每周三 09:30')
    expect(describeCronExpression('0 0/15 * * * ?')).toBe('自定义计划')
    expect(describeCronExpression('')).toBe('未配置周期')
  })

  it('buildCronFromSchedule 与 parseCronToSchedule 应往返一致，且空时刻/纯空白入参行为正确', () => {
    const weekly = parseCronToSchedule('0 30 9 ? * WED')
    expect(weekly).toEqual({
      mode: 'weekly',
      time: '09:30',
      weekday: 'WED',
      monthDay: '1',
    })
    expect(buildCronFromSchedule(weekly, '')).toBe('0 30 9 ? * WED')
    expect(describeSchedule(weekly)).toBe('每周三 09:30 执行')

    expect(parseCronToSchedule('   ').mode).toBe('daily')
    expect(buildCronFromSchedule({ mode: 'daily', time: '', weekday: 'MON', monthDay: '1' }, '')).toBe('')
    expect(describeSchedule({ mode: 'daily', time: '', weekday: 'MON', monthDay: '1' })).toBe('请选择执行时刻')
  })

  it('formatRelativeFutureTime 应覆盖即将、分钟、小时、天与过期边界', () => {
    const now = new Date('2026-11-26T12:00:00Z')
    expect(formatRelativeFutureTime(undefined, now)).toBeNull()
    expect(formatRelativeFutureTime('invalid', now)).toBeNull()
    expect(formatRelativeFutureTime('2026-11-26T11:55:00Z', now)).toBe('等待调度')
    expect(formatRelativeFutureTime('2026-11-26T12:00:30Z', now)).toBe('即将执行')
    expect(formatRelativeFutureTime('2026-11-26T12:25:00Z', now)).toBe('约 25 分钟后')
    expect(formatRelativeFutureTime('2026-11-26T18:00:00Z', now)).toBe('约 6 小时后')
    expect(formatRelativeFutureTime('2026-11-28T15:00:00Z', now)).toBe('约 2 天后')
  })
})
