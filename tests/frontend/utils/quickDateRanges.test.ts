import {
  getQuickDateRange,
  matchQuickDateRange,
  startOfMonth,
  startOfWeek,
} from '@/utils/quickDateRanges'

// 2026-10-11 是周日，2026-10-12 是周一（一周第一天），2026-10-14 是周三
const SUNDAY = new Date(2026, 9, 11)
const MONDAY = new Date(2026, 9, 12)
const WEDNESDAY = new Date(2026, 9, 14)

describe('快捷日期区间（今天 / 本周 / 本月）', () => {
  it('今天：起止都是当天', () => {
    expect(getQuickDateRange('today', WEDNESDAY)).toEqual({
      startDate: '2026-10-14',
      endDate: '2026-10-14',
    })
  })

  it('本周：从周一起算、截止到今天', () => {
    expect(WEDNESDAY.getDay()).toBe(3)
    expect(getQuickDateRange('week', WEDNESDAY)).toEqual({
      startDate: '2026-10-12',
      endDate: '2026-10-14',
    })
  })

  it('本周：周一当天即一周第一天，区间为「今天到今天」', () => {
    expect(MONDAY.getDay()).toBe(1)
    expect(getQuickDateRange('week', MONDAY)).toEqual({
      startDate: '2026-10-12',
      endDate: '2026-10-12',
    })
  })

  it('本周：周日属于上一周，起点回退到本周一（6 天前）', () => {
    expect(SUNDAY.getDay()).toBe(0)
    expect(getQuickDateRange('week', SUNDAY)).toEqual({
      startDate: '2026-10-05',
      endDate: '2026-10-11',
    })
  })

  it('本月：从 1 号起算、截止到今天', () => {
    expect(getQuickDateRange('month', MONDAY)).toEqual({
      startDate: '2026-10-01',
      endDate: '2026-10-12',
    })
  })

  it('起点工具函数返回本地自然日零点，跨月/跨年不串位', () => {
    expect(startOfWeek(MONDAY).getDate()).toBe(12)
    expect(startOfWeek(MONDAY).getDay()).toBe(1)
    // 周日回退 6 天到本周一；跨月时由 Date 构造器自动归一化
    expect(startOfWeek(SUNDAY).getDate()).toBe(5)
    // 2026-11-01 是周日，本周一落在 10-26
    expect(startOfWeek(new Date(2026, 10, 1)).getMonth()).toBe(9)
    expect(startOfWeek(new Date(2026, 10, 1)).getDate()).toBe(26)
    expect(startOfMonth(new Date(2027, 0, 3)).getMonth()).toBe(0)
    expect(startOfMonth(new Date(2027, 0, 3)).getDate()).toBe(1)
  })
})

describe('matchQuickDateRange（快捷按钮选中态判定）', () => {
  it('区间与快捷口径一致时命中', () => {
    expect(matchQuickDateRange('week', '2026-10-12', '2026-10-14', WEDNESDAY)).toBe(true)
    expect(matchQuickDateRange('today', '2026-10-14', '2026-10-14', WEDNESDAY)).toBe(true)
    expect(matchQuickDateRange('month', '2026-10-01', '2026-10-14', WEDNESDAY)).toBe(true)
  })

  it('自定义区间不命中任何快捷口径', () => {
    // 以周日为起点不是本项目的周口径（周一起算），不应命中
    expect(matchQuickDateRange('week', '2026-10-11', '2026-10-14', WEDNESDAY)).toBe(false)
    expect(matchQuickDateRange('today', '2026-10-14', '2026-10-15', WEDNESDAY)).toBe(false)
  })

  it('空区间不命中', () => {
    expect(matchQuickDateRange('today', '', '', WEDNESDAY)).toBe(false)
    expect(matchQuickDateRange('month', '2026-10-01', '', WEDNESDAY)).toBe(false)
  })
})
