import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '@/constants/pagination'

describe('分页数值策略', () => {
  it('默认每页为 10 条且档位集合不变', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(10)
    expect(PAGE_SIZE_OPTIONS).toEqual([10, 20, 50, 100])
  })

  it('默认值属于档位集合，所有档位均为正整数且不重复', () => {
    expect(PAGE_SIZE_OPTIONS).toContain(DEFAULT_PAGE_SIZE)
    expect(PAGE_SIZE_OPTIONS.every(size => Number.isInteger(size) && size > 0)).toBe(true)
    expect(new Set(PAGE_SIZE_OPTIONS).size).toBe(PAGE_SIZE_OPTIONS.length)
  })
})
