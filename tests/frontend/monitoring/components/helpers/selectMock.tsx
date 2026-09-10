import React from 'react'

/**
 * @/components/ui/select 的轻量替身：Radix Select 在 jsdom 下依赖指针捕获等能力，
 * 这里用 button 模拟 combobox/listbox/option 语义，只保留「打开 → 选项 → 回调」行为。
 *
 * 与真实 Radix 一致的一点：关闭时选项仍挂载（放在 hidden 容器里，*ByRole 查询不可见），
 * 以便 SelectValue 能像真实组件那样显示已选项的文案而不是原始 value。
 */
export function createSelectMock() {
  type SelectContextValue = {
    value?: string
    open: boolean
    setOpen: (open: boolean) => void
    onValueChange?: (value: string) => void
    labels: Map<string, string>
    registerLabel: (value: string, label: string) => void
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
      const labelsRef = React.useRef(new Map<string, string>())
      const [, bump] = React.useReducer((n: number) => n + 1, 0)
      const registerLabel = React.useCallback((itemValue: string, label: string) => {
        if (labelsRef.current.get(itemValue) === label) return
        labelsRef.current.set(itemValue, label)
        bump()
      }, [])
      return (
        <SelectContext.Provider
          value={{ value, open, setOpen, onValueChange, labels: labelsRef.current, registerLabel }}
        >
          <div>{children}</div>
        </SelectContext.Provider>
      )
    },
    SelectTrigger: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
      const { open, setOpen } = useSelectContext()
      return (
        <button type="button" role="combobox" aria-expanded={open} onClick={() => setOpen(!open)} {...props}>
          {children}
        </button>
      )
    },
    SelectValue: ({ placeholder }: { placeholder?: string }) => {
      const { value, labels } = useSelectContext()
      if (value === undefined || value === '') return <>{placeholder ?? null}</>
      return <>{labels.get(value) ?? value}</>
    },
    SelectContent: ({ children }: { children: React.ReactNode }) => {
      const { open } = useSelectContext()
      return open ? <div role="listbox">{children}</div> : <div hidden>{children}</div>
    },
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => {
      const { value: currentValue, onValueChange, setOpen, registerLabel } = useSelectContext()
      const label = typeof children === 'string' ? children : String(children ?? '')
      React.useEffect(() => {
        registerLabel(value, label)
      }, [label, registerLabel, value])
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
}
