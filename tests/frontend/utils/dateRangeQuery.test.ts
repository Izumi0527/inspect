import { toLocalDayBoundaryIso } from '@/utils/dateRangeQuery'

describe('toLocalDayBoundaryIso', () => {
  it('应把 YYYY-MM-DD 转为本地当天零点 / 末尾的 ISO 时间', () => {
    const start = toLocalDayBoundaryIso('2026-09-05', false)
    const end = toLocalDayBoundaryIso('2026-09-05', true)

    expect(start).toBe(new Date(2026, 8, 5, 0, 0, 0, 0).toISOString())
    expect(end).toBe(new Date(2026, 8, 5, 23, 59, 59, 999).toISOString())
  })

  it('非纯日期字符串应原样返回，空串返回 null', () => {
    expect(toLocalDayBoundaryIso('2026-09-05T08:00:00.000Z', false)).toBe('2026-09-05T08:00:00.000Z')
    expect(toLocalDayBoundaryIso('   ', true)).toBeNull()
  })

  it('非法日期应返回 null', () => {
    expect(toLocalDayBoundaryIso('2026-13-01', false)).toBeNull()
    expect(toLocalDayBoundaryIso('2026-02-30', true)).toBeNull()
  })
})
