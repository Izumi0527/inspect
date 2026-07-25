import {
  parseIntOrNull,
  validateGeneralSettings,
} from '@/features/settings/utils/general-validation'
import type { GeneralSettingsResponse } from '@/features/settings/types/general.types'

const validInput = (): GeneralSettingsResponse => ({
  basicInfo: { applicationName: '网络设备巡检系统', version: '1.1.0', timezone: 'Asia/Shanghai' },
  inspectionConfig: { maxConcurrentTasks: 10, defaultTimeout: 30, retryAttempts: 3 },
  reportConfig: { defaultFormat: 'excel', maxExportRecords: 10000 },
  userPreference: { theme: 'auto', timeFormat: '24h' },
})

describe('parseIntOrNull', () => {
  it('空串/非数字返回 null，不再产生 NaN', () => {
    expect(parseIntOrNull('')).toBeNull()
    expect(parseIntOrNull('abc')).toBeNull()
    expect(parseIntOrNull('45')).toBe(45)
    expect(parseIntOrNull('045')).toBe(45)
  })
})

describe('validateGeneralSettings', () => {
  it('合法输入通过并原样收窄', () => {
    const result = validateGeneralSettings(validInput())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.inspectionConfig.defaultTimeout).toBe(30)
    }
  })

  it('数字空值（清空输入框）被拦截', () => {
    const input = validInput()
    input.inspectionConfig.defaultTimeout = null
    const result = validateGeneralSettings(input)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join('')).toContain('默认超时时间不能为空')
    }
  })

  it('超范围值（9999 > 300）被拦截并提示区间', () => {
    const input = validInput()
    input.inspectionConfig.defaultTimeout = 9999
    const result = validateGeneralSettings(input)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join('')).toContain('默认超时时间必须在 5-300 之间')
    }
  })

  it('各字段边界值合法', () => {
    const input = validInput()
    input.inspectionConfig.maxConcurrentTasks = 50
    input.inspectionConfig.defaultTimeout = 5
    input.inspectionConfig.retryAttempts = 0
    input.reportConfig.maxExportRecords = 100000
    expect(validateGeneralSettings(input).ok).toBe(true)
  })

  it('负数与越下界被拦截', () => {
    const input = validInput()
    input.inspectionConfig.retryAttempts = -1
    input.inspectionConfig.maxConcurrentTasks = 0
    const result = validateGeneralSettings(input)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.length).toBe(2)
    }
  })

  it('应用名称空白被拦截并 trim 后提交', () => {
    const blank = validInput()
    blank.basicInfo.applicationName = '   '
    expect(validateGeneralSettings(blank).ok).toBe(false)

    const padded = validInput()
    padded.basicInfo.applicationName = '  巡检系统  '
    const result = validateGeneralSettings(padded)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.basicInfo.applicationName).toBe('巡检系统')
    }
  })

  it('多个错误一次性全部报出', () => {
    const input = validInput()
    input.basicInfo.applicationName = ''
    input.inspectionConfig.defaultTimeout = null
    input.reportConfig.maxExportRecords = 999999
    const result = validateGeneralSettings(input)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.length).toBe(3)
    }
  })
})
