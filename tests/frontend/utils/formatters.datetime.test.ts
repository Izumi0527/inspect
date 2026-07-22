import {
  formatDate,
  formatDateTimeYMDHMS,
  formatDateYMD,
  formatTimeHMS,
} from '@/utils/formatters'

describe('时间格式统一（短横 + 补零 + 24 时制 + 本地时区）', () => {
  // 后端统一返回 RFC3339 UTC（含小数秒），必须被解析并按浏览器本地时区显示，
  // 历史事故：系统设置页直接渲染原始串 2026-07-22T16:14:13.8575683Z
  it('formatDateTimeYMDHMS 解析后端 RFC3339 UTC 串并输出本地时间', () => {
    const out = formatDateTimeYMDHMS('2026-07-22T16:14:13.8575683Z')
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(out).toBe(formatDateTimeYMDHMS(new Date('2026-07-22T16:14:13.8575683Z')))
  })

  it('formatDate 的 datetime/date/time 输出与 YMD 手写模板家族一致（无斜杠风格）', () => {
    const iso = '2026-07-22T16:14:13Z'
    expect(formatDate(iso, 'datetime')).toBe(formatDateTimeYMDHMS(iso))
    expect(formatDate(iso, 'date')).toBe(formatDateYMD(iso))
    expect(formatDate(iso, 'time')).toBe(formatTimeHMS(iso))
    expect(formatDate(iso, 'datetime')).not.toContain('/')
  })

  it('formatTimeHMS 输出补零的 HH:mm:ss', () => {
    expect(formatTimeHMS(new Date(2026, 6, 22, 16, 14, 13))).toBe('16:14:13')
    expect(formatTimeHMS(new Date(2026, 6, 22, 8, 5, 3))).toBe('08:05:03')
  })

  it('无效输入统一返回 无效日期', () => {
    expect(formatDate('not-a-date')).toBe('无效日期')
    expect(formatTimeHMS('')).toBe('无效日期')
    expect(formatDateTimeYMDHMS('garbage')).toBe('无效日期')
  })

  it('relative 模式行为保留', () => {
    expect(formatDate(new Date(Date.now() - 3 * 3600_000), 'relative')).toBe('3小时前')
    expect(formatDate(new Date(), 'relative')).toBe('刚刚')
  })
})
