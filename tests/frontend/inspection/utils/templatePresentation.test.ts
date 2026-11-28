import {
  getCategoryMeta,
  getCheckTypeMeta,
  summarizeCheckItems,
} from '@/features/inspection/utils/templatePresentation'
import type { InspectionCheckItem } from '@/features/inspection/types'

describe('templatePresentation 工具函数', () => {
  it('getCategoryMeta 应返回柔和语义徽标配置', () => {
    expect(getCategoryMeta('network')).toEqual({
      label: '网络监控',
      badgeVariant: 'info',
    })
    expect(getCategoryMeta('system')).toEqual({
      label: '系统检查',
      badgeVariant: 'neutral',
    })
    expect(getCategoryMeta('security')).toEqual({
      label: '安全检测',
      badgeVariant: 'warning',
    })
    expect(getCategoryMeta('custom')).toEqual({
      label: '自定义',
      badgeVariant: 'secondary',
    })
    expect(getCategoryMeta(undefined)).toEqual({
      label: '未分类',
      badgeVariant: 'outline',
    })
  })

  it('getCheckTypeMeta 应映射常见协议标签与徽标', () => {
    expect(getCheckTypeMeta('snmp').shortLabel).toBe('SNMP')
    expect(getCheckTypeMeta('ping').badgeVariant).toBe('success')
    expect(getCheckTypeMeta('ssh').label).toBe('SSH命令')
    expect(getCheckTypeMeta('unknown-proto').label).toBe('unknown-proto')
  })

  it('summarizeCheckItems 应按协议汇总并包含停用项与空边界', () => {
    expect(summarizeCheckItems(undefined)).toEqual({
      total: 0,
      enabledCount: 0,
      disabledCount: 0,
      breakdownText: '暂无检查项',
    })

    const items: InspectionCheckItem[] = [
      { id: '1', name: 'CPU', type: 'snmp', metric: 'cpu', weight: 1, config: {} },
      { id: '2', name: '内存', type: 'snmp', metric: 'memory', weight: 1, config: {} },
      { id: '3', name: '连通性', type: 'ping', weight: 1, config: {} },
      {
        id: '4',
        name: 'BGP',
        type: 'snmp',
        metric: 'bgp_peers',
        weight: 1,
        enabled: false,
        config: {},
      },
    ]

    expect(summarizeCheckItems(items)).toEqual({
      total: 4,
      enabledCount: 3,
      disabledCount: 1,
      breakdownText: 'SNMP 2 · Ping 1 · 停用 1',
    })
  })
})
