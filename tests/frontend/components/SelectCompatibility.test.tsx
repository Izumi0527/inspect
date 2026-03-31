import * as Atoms from '@/components/atoms'
import * as AtomsSelect from '@/components/atoms/select'
import * as UiSelect from '@/components/ui/select'

describe('Select 底层兼容链路', () => {
  it('ui/select 应提供真实 Select 实现与包装组件', () => {
    expect(UiSelect.Select).toBeDefined()
    expect(UiSelect.SelectTrigger).toBeDefined()
    expect(UiSelect.SelectContent).toBeDefined()
    expect(UiSelect.SelectItem).toBeDefined()
    expect(UiSelect.SimpleSelect).toBeDefined()
    expect(UiSelect.MultiSelect).toBeDefined()
  })

  it('atoms/select 应反向兼容到 ui/select', () => {
    expect(AtomsSelect.Select).toBe(UiSelect.Select)
    expect(AtomsSelect.SelectTrigger).toBe(UiSelect.SelectTrigger)
    expect(AtomsSelect.SelectContent).toBe(UiSelect.SelectContent)
    expect(AtomsSelect.SelectItem).toBe(UiSelect.SelectItem)
    expect(AtomsSelect.SimpleSelect).toBe(UiSelect.SimpleSelect)
    expect(AtomsSelect.MultiSelect).toBe(UiSelect.MultiSelect)
  })

  it('atoms 聚合出口仍应兼容导出 Select 能力', () => {
    expect(Atoms.Select).toBe(UiSelect.Select)
    expect(Atoms.SelectTrigger).toBe(UiSelect.SelectTrigger)
    expect(Atoms.SelectContent).toBe(UiSelect.SelectContent)
    expect(Atoms.SelectItem).toBe(UiSelect.SelectItem)
    expect(Atoms.SimpleSelect).toBe(UiSelect.SimpleSelect)
    expect(Atoms.MultiSelect).toBe(UiSelect.MultiSelect)
  })
})
