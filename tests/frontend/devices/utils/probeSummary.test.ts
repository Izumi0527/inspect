import { summarizeBatchProbe } from '@/features/devices/utils/probeSummary'
import type { DeviceBatchProbeResponse } from '@/features/devices/types'

const result = (overrides: Partial<DeviceBatchProbeResponse> = {}): DeviceBatchProbeResponse => ({
  total: 3,
  probed: 3,
  results: [
    { device_id: 1, ip_address: '10.0.0.1', icmp_reachable: true, snmp_reachable: true, probed_at: 't' },
    { device_id: 2, ip_address: '10.0.0.2', icmp_reachable: true, snmp_reachable: false, snmp_error: 'request timeout (after 2 retries)', probed_at: 't' },
    { device_id: 3, ip_address: '10.0.0.3', icmp_reachable: false, icmp_error: 'Request timed out.\nmore', snmp_reachable: false, snmp_error: 'SNMP community not configured', probed_at: 't' },
  ],
  ...overrides,
})

const names = new Map<number, string>([[1, '核心'], [2, '汇聚'], [3, '接入']])

describe('summarizeBatchProbe', () => {
  it('统计在线/SNMP 成功数量，并逐台列出失败原因', () => {
    const summary = summarizeBatchProbe(result(), names, 3)
    expect(summary.onlineCount).toBe(1 + 1)
    expect(summary.snmpSuccessCount).toBe(1)
    expect(summary.missingCount).toBe(0)
    expect(summary.failures).toEqual([
      { deviceId: 2, name: '汇聚', reason: 'SNMP 失败：request timeout (after 2 retries)' },
      { deviceId: 3, name: '接入', reason: 'ICMP 离线：Request timed out.；SNMP 失败：SNMP community not configured' },
    ])
    expect(summary.hiddenFailureCount).toBe(0)
  })

  it('后端未返回结果的设备计入 missingCount', () => {
    const summary = summarizeBatchProbe(result({ total: 5, probed: 3 }), names, 3)
    expect(summary.missingCount).toBe(2)
  })

  it('失败条数超过上限时截断并记录隐藏条数，名称缺失时退回 IP', () => {
    const summary = summarizeBatchProbe(result(), new Map(), 1)
    expect(summary.failures).toHaveLength(1)
    expect(summary.failures[0].name).toBe('10.0.0.2')
    expect(summary.hiddenFailureCount).toBe(1)
  })
})
