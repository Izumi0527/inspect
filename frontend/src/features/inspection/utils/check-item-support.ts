import type { CheckItemType } from '../types'

/**
 * 巡检检查项“执行支持度”定义。
 *
 * 说明：
 * - 后端当前执行引擎主要支持：Ping/ICMP（前端用 ping）与 SNMP
 * - SSH/HTTP/脚本等类型在模板层已预留，但执行时会被跳过
 *
 * 目的：
 * - 前端创建/编辑模板时避免误导用户配置“不会执行”的检查项
 * - 允许历史模板仍能展示/保留这些类型（便于后续扩展）
 */

export const SUPPORTED_CHECK_ITEM_TYPES: ReadonlyArray<CheckItemType> = ['ping', 'snmp']

export function isCheckItemTypeSupported(type: CheckItemType): boolean {
  return SUPPORTED_CHECK_ITEM_TYPES.includes(type)
}

