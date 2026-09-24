import { api } from '@/lib/api-client'
import { fetchReports } from '@/features/reports/api/reports.api'

jest.mock('@/lib/api-client', () => ({
  api: { get: jest.fn() },
}))

const mockGet = api.get as jest.Mock

const listOf = (...reports: Record<string, unknown>[]) => ({
  success: true,
  data: { reports, total: reports.length, pages: 1 },
})

describe('fetchReports 创建人显示', () => {
  it('优先显示后端解析出的创建人名称，而不是用户 UUID', async () => {
    mockGet.mockResolvedValue(
      listOf({ id: 1, name: 'r1', generated_by: '3f2a-uuid', created_by_name: '张三' })
    )

    const { reports } = await fetchReports()

    expect(reports[0].generatedBy).toBe('张三')
  })

  it('没有创建人时显示「系统」，创建人无法解析时显示「未知用户」', async () => {
    mockGet.mockResolvedValue(
      listOf({ id: 1, name: 'r1', generated_by: null }, { id: 2, name: 'r2', generated_by: '3f2a-uuid' })
    )

    const { reports } = await fetchReports()

    expect(reports.map((r) => r.generatedBy)).toEqual(['系统', '未知用户'])
  })
})
