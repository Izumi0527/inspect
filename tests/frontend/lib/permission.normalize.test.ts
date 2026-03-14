import { hasPermission, normalizePermissionKey, normalizePermissionList } from '@/lib/authz/permission'

describe('权限 key 归一化（前端）', () => {
  it('应兼容历史模块名与动作别名', () => {
    expect(normalizePermissionKey('alert:read')).toBe('alerts:read')
    expect(normalizePermissionKey('inspection:list')).toBe('inspections:read')
    expect(normalizePermissionKey('device:view')).toBe('devices:read')
  })

  it('应对大小写与空格鲁棒', () => {
    expect(normalizePermissionKey('  Alerts:Read  ')).toBe('alerts:read')
    expect(normalizePermissionKey('  DEVICES:LIST  ')).toBe('devices:read')
  })

  it('normalizePermissionList 应去重并过滤空值', () => {
    const list = normalizePermissionList(['alert:read', 'alerts:read', ' ALERTS:READ ', '', '   '])
    expect(list).toEqual(['alerts:read'])
  })

  it('hasPermission 应基于归一化结果判断', () => {
    expect(hasPermission('alerts:read', ['alert:read'])).toBe(true)
    expect(hasPermission('devices:update', ['device:read'])).toBe(false)
  })
})

