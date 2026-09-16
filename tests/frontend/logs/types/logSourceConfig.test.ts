import { LOG_SOURCE_CONFIG } from '@/features/logs/types'

// 日志来源枚举 = 后端实际存在的写入通道。manual（手动导入）全代码没有任何写入点，
// 在筛选器里只会让用户"选了没反应"，故从枚举中移除。
describe('LOG_SOURCE_CONFIG', () => {
  it('只包含真实存在的四条写入通道', () => {
    expect(Object.keys(LOG_SOURCE_CONFIG)).toEqual(['syslog', 'ssh', 'snmp', 'snmp_trap'])
  })
})
