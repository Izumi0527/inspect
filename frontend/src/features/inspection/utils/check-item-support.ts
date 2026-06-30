import type { CheckItemType } from '../types'

/**
 * 巡检检查项"执行支持度"定义。
 *
 * 说明：
 * - 后端执行引擎支持：Ping/ICMP（前端用 ping）、SNMP、SSH（执行只读命令）、HTTP（探测）
 * - Script（任意脚本）出于安全不予执行，前端禁选；如需脚本检查请改用 SSH 命令
 *
 * 目的：
 * - 前端创建/编辑模板时避免误导用户配置"不会执行"的检查项
 */

export const SUPPORTED_CHECK_ITEM_TYPES: ReadonlyArray<CheckItemType> = ['ping', 'snmp', 'ssh', 'http']

export function isCheckItemTypeSupported(type: CheckItemType): boolean {
  return SUPPORTED_CHECK_ITEM_TYPES.includes(type)
}

