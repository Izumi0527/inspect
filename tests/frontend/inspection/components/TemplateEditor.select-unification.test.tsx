import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TemplateEditor } from '@/features/inspection/components/TemplateEditor'
import type { InspectionTemplate } from '@/features/inspection/types'

jest.mock('@/components/ui/select', () => {
  const React = require('react') as typeof import('react')

  type SelectContextValue = {
    value?: string
    open: boolean
    setOpen: (open: boolean) => void
    onValueChange?: (value: string) => void
  }

  const SelectContext = React.createContext<SelectContextValue | null>(null)

  const useSelectContext = () => {
    const context = React.useContext(SelectContext)
    if (!context) {
      throw new Error('Select mock context is missing')
    }
    return context
  }

  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value?: string
      onValueChange?: (value: string) => void
      children: React.ReactNode
    }) => {
      const [open, setOpen] = React.useState(false)
      return (
        <SelectContext.Provider value={{ value, open, setOpen, onValueChange }}>
          <div>{children}</div>
        </SelectContext.Provider>
      )
    },
    SelectTrigger: ({
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
      const { open, setOpen } = useSelectContext()
      return (
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          {...props}
        >
          {children}
        </button>
      )
    },
    SelectValue: ({ placeholder }: { placeholder?: string }) => <>{placeholder ?? null}</>,
    SelectContent: ({ children }: { children: React.ReactNode }) => {
      const { open } = useSelectContext()
      return open ? <div role="listbox">{children}</div> : null
    },
    SelectItem: ({
      value,
      children,
    }: {
      value: string
      children: React.ReactNode
    }) => {
      const { value: currentValue, onValueChange, setOpen } = useSelectContext()
      return (
        <button
          type="button"
          role="option"
          aria-selected={currentValue === value}
          onClick={() => {
            onValueChange?.(value)
            setOpen(false)
          }}
        >
          {children}
        </button>
      )
    },
  }
})

describe('TemplateEditor 下拉统一化', () => {
  it('应使用统一 Select 实现分类选择，并保持保存契约不变', async () => {
    const user = userEvent.setup()
    const onSave = jest.fn()
    const onCancel = jest.fn()
    const template: InspectionTemplate = {
      id: 'template-1',
      name: '模板A',
      description: '描述',
      category: 'custom',
      deviceTypes: ['router'],
      checkItems: [
        {
          id: 'item-1',
          name: '检查项1',
          type: 'ping',
          weight: 1,
          config: {},
        },
      ],
      isActive: true,
      isBuiltIn: false,
      createdAt: '2026-03-31T00:00:00Z',
      updatedAt: '2026-03-31T00:00:00Z',
    }

    const { container } = render(
      <TemplateEditor
        template={template}
        onSave={onSave}
        onCancel={onCancel}
      />
    )

    expect(container.querySelector('select')).toBeNull()
    expect(screen.getByRole('combobox', { name: '模板分类' })).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: '模板分类' }))
    await user.click(screen.getByRole('option', { name: '网络' }))
    await user.click(screen.getByRole('button', { name: '保存模板' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'network',
      })
    )
  })
})
