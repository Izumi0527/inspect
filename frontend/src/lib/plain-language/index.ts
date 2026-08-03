/**
 * 人话翻译层 —— 统一导出
 *
 * 使用方式：
 * ```ts
 * import { translateToPlainLanguage } from '@/lib/plain-language'
 *
 * const plain = translateToPlainLanguage({
 *   message: log.message,
 *   level: log.level,
 *   facility: log.facility,
 *   deviceName: log.device_name,
 * })
 * ```
 */

export { translateToPlainLanguage } from './translate'
export {
  describeFacility,
  describeLevel,
  humanizeAlertCategory,
  humanizeInterfaceName,
  humanizeState,
  toneFromLevel,
} from './dictionary'
export { PLAIN_LANGUAGE_RULES } from './rules'
export { TRAP_OID_DICTIONARY } from './trap-oids'
export type { TrapOIDEntry } from './trap-oids'
export type {
  PlainLanguageInput,
  PlainLanguageResult,
  PlainLanguageRule,
  PlainTone,
  TrapIdentity,
} from './types'
