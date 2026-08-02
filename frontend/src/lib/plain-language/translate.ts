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
import type { PlainLanguageInput, PlainLanguageResult } from './types'

/** 模板占位语法：{device}、{1}、{1:iface} */
const PLACEHOLDER_PATTERN = /\{(device|\d+)(?::(\w+))?\}/g

/** deviceName 缺省时的中性称呼 */
const DEFAULT_DEVICE_NAME = '该设备'

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
      return transform === 'iface' ? '某个网口' : ''
    }
    return applyTransform(captured, transform)
  })
}

/**
 * 兜底翻译：没有任何规则命中时使用。
 *
 * 刻意保持诚实 —— 明确告知「无法自动解读」并引导查看原文，
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
    title: `${facility}${isAbnormal ? '异常' : '信息'}`,
    summary: `${deviceName} 报告了一条与${facility}有关的${level}信息。系统暂时无法自动解读它的含义，请查看下方原始内容，或将其提供给网络管理员。`,
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

  if (!message) {
    return {
      title: '空白消息',
      summary: `${deviceName} 上报了一条没有内容的消息，通常可以忽略。`,
      tone: 'info',
      matched: false,
    }
  }

  for (const rule of PLAIN_LANGUAGE_RULES) {
    // 防御性重置：规则表为模块级共享常量，若某条规则日后误加 g 标志，
    // lastIndex 会在多次调用间残留并造成间歇性漏匹配。
    rule.pattern.lastIndex = 0

    const match = rule.pattern.exec(message)
    if (!match) continue

    return {
      title: rule.title,
      summary: renderTemplate(rule.summary, match, deviceName),
      suggestion: rule.suggestion ? renderTemplate(rule.suggestion, match, deviceName) : undefined,
      tone: rule.tone ?? 'info',
      matched: true,
      ruleId: rule.id,
    }
  }

  return buildFallback(input, deviceName)
}
