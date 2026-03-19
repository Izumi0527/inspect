import { settingsTabRegistry } from '@/features/settings/registry/settings-tabs'

describe('settingsTabRegistry', () => {
  it('应完整声明 9 个系统设置子分页', () => {
    expect(settingsTabRegistry.map((tab) => tab.key)).toEqual([
      'general',
      'logs',
      'users',
      'roles',
      'security',
      'audit',
      'backup',
      'notifications',
      'monitoring',
    ])
  })

  it('每个子分页都应具备壳层所需的基础元数据', () => {
    for (const tab of settingsTabRegistry) {
      expect(tab.label).toEqual(expect.any(String))
      expect(tab.label).not.toHaveLength(0)

      expect(tab.description).toEqual(expect.any(String))
      expect(tab.description).not.toHaveLength(0)

      expect(tab.icon).toBeDefined()
      expect(tab.requiredPermissions.length).toBeGreaterThan(0)
      expect(['form', 'ops', 'table', 'query', 'dashboard']).toContain(tab.kind)
      expect(['page', 'panel']).toContain(tab.scrollMode)
    }
  })

  it('users/roles/audit 应保持当前面板填充滚动模式', () => {
    const panelScrollTabs = settingsTabRegistry
      .filter((tab) => tab.scrollMode === 'panel')
      .map((tab) => tab.key)

    expect(panelScrollTabs).toEqual(['users', 'roles', 'audit'])
  })
})
