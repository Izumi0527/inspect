import * as Atoms from '@/components/atoms'
import * as UiSelect from '@/components/ui/select'

describe('Select 导出边界', () => {
  it('ui/select 应提供真实 Select 实现与包装组件', () => {
    expect(UiSelect.Select).toBeDefined()
    expect(UiSelect.SelectTrigger).toBeDefined()
    expect(UiSelect.SelectContent).toBeDefined()
    expect(UiSelect.SelectItem).toBeDefined()
    expect(UiSelect.SimpleSelect).toBeDefined()
    expect(UiSelect.MultiSelect).toBeDefined()
  })

  it('atoms 聚合出口不应再导出 Select 相关能力', () => {
    expect('Select' in Atoms).toBe(false)
    expect('SelectTrigger' in Atoms).toBe(false)
    expect('SelectContent' in Atoms).toBe(false)
    expect('SelectItem' in Atoms).toBe(false)
    expect('SelectValue' in Atoms).toBe(false)
    expect('SimpleSelect' in Atoms).toBe(false)
    expect('MultiSelect' in Atoms).toBe(false)
  })
})
