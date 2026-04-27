import { buildAuditDateRangeQuery } from '@/features/settings/components/audit/auditDateRange'

describe('buildAuditDateRangeQuery', () => {
  it('会将 YYYY-MM-DD 日期范围转换为审计日志查询所需的 ISO 起止时间', () => {
    const result = buildAuditDateRangeQuery('2026-04-12', '2026-04-16')

    expect(result.startDate).toBe(new Date('2026-04-12').toISOString())
    expect(result.endDate).toBe(new Date('2026-04-16T23:59:59').toISOString())
  })

  it('会在日期为空时返回 undefined，避免向接口提交空筛选', () => {
    const result = buildAuditDateRangeQuery('', '')

    expect(result).toEqual({
      startDate: undefined,
      endDate: undefined,
    })
  })
})
