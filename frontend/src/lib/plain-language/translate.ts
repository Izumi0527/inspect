/**
 * 人话翻译层 —— 匹配引擎
 *
 * 纯函数实现：相同输入恒得相同输出，无副作用，便于单元测试。
 */

import {
  describeFacility,
  describeLevel,
  humanizeInterfaceName,
  humanizeState,
  toneFromLevel,
} from './dictionary'
import { PLAIN_LANGUAGE_RULES } from './rules'
import { TRAP_OID_DICTIONARY } from './trap-oids'
import type {
  PlainLanguageInput,
  PlainLanguageResult,
  PlainTone,
  TrapIdentity,
} from './types'

/** 模板占位语法：{device}、{1}、{1:iface} */
const PLACEHOLDER_PATTERN = /\{(device|\d+)(?::(\w+))?\}/g

/** deviceName 缺省时的中性称呼 */
const DEFAULT_DEVICE_NAME = '该设备'

/**
 * Trap OID 识别模式。
 *
 * 要求至少 6 段数字（`\d+` 后跟 5 组以上 `.\d+`）—— IP 地址只有 4 段，
 * 若放宽到 3 段以上，`10.0.0.1` 之类的地址会被误判成 OID。
 */
const OID_PATTERN = /\b(\d+(?:\.\d+){5,})\b/

/** 从文本中取出第一个形似 OID 的串 */
function extractTrapOID(text: string): string {
  const value = String(text ?? '')
  if (!value) return ''
  const match = OID_PATTERN.exec(value)
  return match ? match[1] : ''
}

/**
 * 识别 Trap OID 并查词典。
 *
 * 先查 message（`SNMP Trap <OID> | 摘要`），再退到 title
 * （`[WARNING] 设备 - SNMP Trap 接口告警 (<OID>)`）。
 * 词典未收录时返回 undefined —— 裸 OID 对使用者没有意义，
 * 且它本就完整保留在可展开的原文里。
 */
function resolveTrapIdentity(message: string, title?: string): TrapIdentity | undefined {
  const oid = extractTrapOID(message) || extractTrapOID(String(title ?? ''))
  if (!oid) return undefined

  const entry = TRAP_OID_DICTIONARY[oid]
  if (!entry) return undefined

  return { oid, name: entry.name, label: entry.label, detail: entry.detail }
}

/**
 * 由 Trap 释义推导语气。
 *
 * 判定顺序不可调换：「失效恢复」同时含「失效」与「恢复」，
 * 必须让恢复类先命中，否则会把好消息标成告警色。
 */
function toneFromTrap(trap: TrapIdentity): PlainTone {
  const text = `${trap.name} ${trap.label} ${trap.detail ?? ''}`
  if (/resume|normal|recover|恢复|正常/i.test(text)) return 'success'
  if (/power|fan|temperature|loop|dyinggasp|电源|风扇|温度|环路|断电|失效|不可用/i.test(text)) {
    return 'critical'
  }
  if (/fail|invalid|remove|down|offline|abnormal|alarm|error|attack|故障|异常|拔出|离线|失败|超过|攻击/i.test(text)) {
    return 'warning'
  }
  return 'info'
}

/**
 * 厂商官方术语优先作为标题。
 *
 * 官方措辞比自拟规则更精确、更权威，且与设备侧日志、巡检报告用词一致，
 * 例如 hwBoardFail 用「单板局部功能失效」优于规则的「单板故障」。
 *
 * 生成词典时超长释义会被截断并以省略号结尾（如 `hwDhcpSnpStatisticIfDesc…`），
 * 那种 label 是残句、不能作标题，此时返回 undefined 让调用方回退到规则 title。
 */
function preferVendorTitle(trap?: TrapIdentity): string | undefined {
  if (!trap) return undefined
  const label = trap.label.trim()
  if (!label || label.endsWith('…')) return undefined
  return label
}

/** 正则规则全部未命中、但 OID 词典命中时，用厂商官方释义构造结果 */
function buildFromTrap(trap: TrapIdentity, deviceName: string): PlainLanguageResult {
  const summary = trap.detail
    ? `${deviceName} 上报 ${trap.name}（${trap.label}）。厂商释义：${trap.detail}`
    : `${deviceName} 上报 ${trap.name}：${trap.label}。`

  return {
    title: preferVendorTitle(trap) ?? trap.name,
    summary,
    tone: toneFromTrap(trap),
    matched: true,
    trap,
  }
}

/** 按占位符声明的转换器加工捕获组 */
function applyTransform(value: string, transform?: string): string {
  switch (transform) {
    case 'iface':
      return humanizeInterfaceName(value)
    case 'state':
      return humanizeState(value)
    default:
      return value
  }
}

/** 用捕获组与设备名填充模板 */
function renderTemplate(template: string, match: RegExpExecArray, deviceName: string): string {
  return template.replace(PLACEHOLDER_PATTERN, (_full, key: string, transform?: string) => {
    if (key === 'device') return deviceName

    const captured = match[Number(key)]
    if (captured === undefined || captured === '') {
      // 捕获组缺失时不能留下空洞导致句子断裂：
      // 接口类占位退回中性说法，其余占位直接省略。
      return transform === 'iface' ? '相关接口' : ''
    }
    return applyTransform(captured, transform)
  })
}

/**
 * 兜底翻译：没有任何规则命中、且 OID 也未收录时使用。
 *
 * 刻意保持诚实 —— 明确说明无匹配规则并引导查看原文，
 * 而不是编造一个看似合理的解释。同时 matched 为 false，
 * 调用方应据此直接展示原文而非折叠。
 */
function buildFallback(input: PlainLanguageInput, deviceName: string): PlainLanguageResult {
  const facility = describeFacility(input.facility)
  const level = describeLevel(input.level)
  const isAbnormal = ['warning', 'error', 'critical'].includes(
    String(input.level ?? '').trim().toLowerCase(),
  )

  return {
    title: `${facility}${isAbnormal ? '异常' : '事件'}`,
    summary: `${deviceName} 上报一条${facility}相关的${level}信息，暂无匹配的解析规则。原始内容见下方，可据此进一步排查或提交厂商分析。`,
    tone: toneFromLevel(input.level),
    matched: false,
  }
}

/**
 * 把设备原始信息翻译成人话。
 *
 * @param input 日志或告警的原始字段
 * @returns 翻译结果；未命中任何规则时 `matched` 为 false 并附兜底说明
 */
export function translateToPlainLanguage(input: PlainLanguageInput): PlainLanguageResult {
  const message = String(input?.message ?? '').trim()
  const deviceName = String(input?.deviceName ?? '').trim() || DEFAULT_DEVICE_NAME
  const trap = resolveTrapIdentity(message, input?.title)

  if (!message) {
    return {
      title: '空消息',
      summary: `${deviceName} 上报的消息体为空，无有效内容。`,
      tone: 'info',
      matched: false,
      trap,
    }
  }

  // 正则规则优先于 OID 词典：厂商官方释义常是长段技术描述
  // （如 linkDown 的 ifOperStatus 表述），不含业务影响与处置动作，
  // 无法替代规则文案。故只在标题层面采用官方术语，正文仍走规则。
  for (const rule of PLAIN_LANGUAGE_RULES) {
    // 防御性重置：规则表为模块级共享常量，若某条规则日后误加 g 标志，
    // lastIndex 会在多次调用间残留并造成间歇性漏匹配。
    rule.pattern.lastIndex = 0

    const match = rule.pattern.exec(message)
    if (!match) continue

    return {
      title: preferVendorTitle(trap) ?? rule.title,
      summary: renderTemplate(rule.summary, match, deviceName),
      suggestion: rule.suggestion ? renderTemplate(rule.suggestion, match, deviceName) : undefined,
      tone: rule.tone ?? 'info',
      matched: true,
      ruleId: rule.id,
      trap,
    }
  }

  // 正则未命中但 OID 有收录：厂商官方释义好过笼统的兜底文案
  if (trap) {
    return buildFromTrap(trap, deviceName)
  }

  return buildFallback(input, deviceName)
}
