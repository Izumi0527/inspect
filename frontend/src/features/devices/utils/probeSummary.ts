import type { DeviceBatchProbeResponse, DeviceProbeResult } from '../types'
import { summarizeProbeError } from '../components/DeviceProbeButton'

export interface ProbeFailureItem {
  deviceId: number
  name: string
  reason: string
}

export interface BatchProbeSummary {
  onlineCount: number
  snmpSuccessCount: number
  /** 请求了但后端没有返回结果的设备数（通常是设备已被删除或未找到） */
  missingCount: number
  failures: ProbeFailureItem[]
  /** 失败条目超过展示上限时被省略的条数 */
  hiddenFailureCount: number
}

const describeFailure = (item: DeviceProbeResult): string => {
  const parts: string[] = []
  if (!item.icmp_reachable) {
    const reason = summarizeProbeError(item.icmp_error)
    parts.push(`ICMP 离线${reason ? `：${reason}` : ''}`)
  }
  if (!item.snmp_reachable) {
    const reason = summarizeProbeError(item.snmp_error)
    parts.push(`SNMP 失败${reason ? `：${reason}` : ''}`)
  }
  return parts.join('；')
}

/**
 * 把批量探测响应整理成可直接展示的摘要。此前"探测本页"只弹出三个数字，
 * 哪台失败、为何失败都看不到，用户只能逐台再点单独探测。
 */
export const summarizeBatchProbe = (
  response: DeviceBatchProbeResponse,
  deviceNames: Map<number, string>,
  maxFailures: number,
): BatchProbeSummary => {
  const failed = response.results.filter((item) => !item.icmp_reachable || !item.snmp_reachable)
  const failures = failed.slice(0, maxFailures).map((item) => ({
    deviceId: item.device_id,
    name: deviceNames.get(item.device_id) || item.ip_address,
    reason: describeFailure(item),
  }))

  return {
    onlineCount: response.results.filter((item) => item.icmp_reachable).length,
    snmpSuccessCount: response.results.filter((item) => item.snmp_reachable).length,
    missingCount: Math.max(0, response.total - response.probed),
    failures,
    hiddenFailureCount: Math.max(0, failed.length - failures.length),
  }
}
