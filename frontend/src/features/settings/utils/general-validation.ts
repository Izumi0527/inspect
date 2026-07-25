import type {
  GeneralSettingsResponse,
  ValidatedGeneralSettings,
} from '../types/general.types'

interface NumericRule {
  min: number
  max: number
  label: string
}

/**
 * 数字配置的合法区间。与后端 settings/general_validation.go 的
 * generalNumericConstraints 保持同步，两处集合修改时必须一起改。
 */
export const GENERAL_NUMERIC_RULES: Record<
  'maxConcurrentTasks' | 'defaultTimeout' | 'retryAttempts' | 'maxExportRecords',
  NumericRule
> = {
  maxConcurrentTasks: { min: 1, max: 50, label: '最大并发任务数' },
  defaultTimeout: { min: 5, max: 300, label: '默认超时时间' },
  retryAttempts: { min: 0, max: 10, label: '失败重试次数' },
  maxExportRecords: { min: 1, max: 100000, label: '最大导出记录数' },
}

export type GeneralValidationResult =
  | { ok: true; data: ValidatedGeneralSettings }
  | { ok: false; errors: string[] }

function checkNumeric(value: number | null, rule: NumericRule, errors: string[]): void {
  if (value === null || !Number.isFinite(value)) {
    errors.push(`${rule.label}不能为空`)
    return
  }
  if (!Number.isInteger(value)) {
    errors.push(`${rule.label}必须是整数`)
    return
  }
  if (value < rule.min || value > rule.max) {
    errors.push(`${rule.label}必须在 ${rule.min}-${rule.max} 之间`)
  }
}

/**
 * 保存前整页校验：数字项非空且在区间内、应用名称与时区非空。
 * 通过时返回数字字段已收窄为 number 的数据副本，供提交层使用。
 */
export function validateGeneralSettings(input: GeneralSettingsResponse): GeneralValidationResult {
  const errors: string[] = []

  if (!input.basicInfo.applicationName.trim()) {
    errors.push('应用程序名称不能为空')
  }
  if (!input.basicInfo.timezone.trim()) {
    errors.push('时区不能为空')
  }

  checkNumeric(input.inspectionConfig.maxConcurrentTasks, GENERAL_NUMERIC_RULES.maxConcurrentTasks, errors)
  checkNumeric(input.inspectionConfig.defaultTimeout, GENERAL_NUMERIC_RULES.defaultTimeout, errors)
  checkNumeric(input.inspectionConfig.retryAttempts, GENERAL_NUMERIC_RULES.retryAttempts, errors)
  checkNumeric(input.reportConfig.maxExportRecords, GENERAL_NUMERIC_RULES.maxExportRecords, errors)

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    data: {
      basicInfo: {
        applicationName: input.basicInfo.applicationName.trim(),
        version: input.basicInfo.version,
        timezone: input.basicInfo.timezone.trim(),
      },
      inspectionConfig: {
        maxConcurrentTasks: input.inspectionConfig.maxConcurrentTasks as number,
        defaultTimeout: input.inspectionConfig.defaultTimeout as number,
        retryAttempts: input.inspectionConfig.retryAttempts as number,
      },
      reportConfig: {
        defaultFormat: input.reportConfig.defaultFormat,
        maxExportRecords: input.reportConfig.maxExportRecords as number,
      },
      userPreference: input.userPreference,
    },
  }
}

/** 数字输入框 onChange 的统一解析：空串/非数字返回 null（编辑暂态）。 */
export function parseIntOrNull(value: string): number | null {
  const parsed = parseInt(value, 10)
  return Number.isNaN(parsed) ? null : parsed
}
