import {
  formatDate,
  formatDateTimeYMDHMS,
  formatDateYMD,
  formatTimeHM,
  formatTimeHMS,
  setDatetimeDisplayPreferences,
  resetDatetimeDisplayPreferences,
} from '@/utils/formatters'

// 固定的 UTC 时刻：UTC 16:14:13 = 上海(UTC+8) 次日 00:14:13 = 纽约(UTC-4, 夏令时) 12:14:13
const ISO = '2026-07-22T16:14:13Z'

describe('时间显示偏好（时区 + 12/24 小时制）', () => {
  afterEach(() => {
    resetDatetimeDisplayPreferences()
  })

  it('timeZone=UTC 时按 UTC 输出', () => {
    setDatetimeDisplayPreferences({ timeZone: 'UTC' })
    expect(formatDateTimeYMDHMS(ISO)).toBe('2026-07-22 16:14:13')
  })

  it('timeZone=Asia/Shanghai 时跨日正确（日期与时间部件同时区）', () => {
    setDatetimeDisplayPreferences({ timeZone: 'Asia/Shanghai' })
    expect(formatDateTimeYMDHMS(ISO)).toBe('2026-07-23 00:14:13')
    expect(formatTimeHM(ISO)).toBe('00:14')
    expect(formatDate(ISO, 'date')).toBe('2026-07-23')
  })

  it('hour12=true 时输出 上午/下午 12 小时制', () => {
    setDatetimeDisplayPreferences({ timeZone: 'Asia/Shanghai', hour12: true })
    expect(formatDateTimeYMDHMS(ISO)).toBe('2026-07-23 上午 12:14:13')
    setDatetimeDisplayPreferences({ timeZone: 'UTC', hour12: true })
    expect(formatTimeHMS(ISO)).toBe('下午 04:14:13')
  })

  it('无效 timeZone 静默回退浏览器本地（不抛异常）', () => {
    setDatetimeDisplayPreferences({ timeZone: 'Not/AZone' })
    const localExpected = (() => {
      resetDatetimeDisplayPreferences()
      const out = formatDateTimeYMDHMS(ISO)
      setDatetimeDisplayPreferences({ timeZone: 'Not/AZone' })
      return out
    })()
    expect(formatDateTimeYMDHMS(ISO)).toBe(localExpected)
  })

  it('formatDateYMD 不受时区偏好影响（API 参数构造契约）', () => {
    resetDatetimeDisplayPreferences()
    const localYMD = formatDateYMD(ISO)
    setDatetimeDisplayPreferences({ timeZone: 'UTC' })
    expect(formatDateYMD(ISO)).toBe(localYMD)
  })

  it('未设置偏好时行为与本地时区一致', () => {
    const before = formatDateTimeYMDHMS(ISO)
    setDatetimeDisplayPreferences({})
    expect(formatDateTimeYMDHMS(ISO)).toBe(before)
  })
})
