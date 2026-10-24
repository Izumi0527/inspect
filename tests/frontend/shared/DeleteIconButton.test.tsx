import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { DeleteIconButton } from '@/components/shared/DeleteIconButton'
import { DeleteIconButton as ExportedDeleteIconButton } from '@/components/shared'

describe('DeleteIconButton Component', () => {
  it('应正确从 @/components/shared 导出', () => {
    expect(ExportedDeleteIconButton).toBe(DeleteIconButton)
  })

  it('默认渲染：使用 ghost 变体、sm 尺寸、默认删除文案与红色垃圾桶图标', () => {
    const handleClick = jest.fn()
    const { container } = render(<DeleteIconButton onClick={handleClick} />)

    const button = screen.getByRole('button', { name: '删除' })
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('title', '删除')
    expect(button).toHaveAttribute('aria-label', '删除')
    expect(button).toHaveAttribute('data-variant', 'ghost')
    expect(button).toHaveAttribute('data-size', 'sm')
    expect(button).toHaveAttribute('type', 'button')

    // 内部包含红色垃圾桶图标（Trash2 w-4 h-4 text-red-500）
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveClass('w-4', 'h-4', 'text-red-500')

    // 点击事件正常触发
    fireEvent.click(button)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('支持自定义 title、aria-label、className 与 iconClassName', () => {
    const { container } = render(
      <DeleteIconButton
        title="删除设备"
        aria-label="删除设备 edge-01"
        className="px-2 custom-button-class"
        iconClassName="text-red-600 custom-icon-class"
      />
    )

    const button = screen.getByRole('button', { name: '删除设备 edge-01' })
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('title', '删除设备')
    expect(button).toHaveAttribute('aria-label', '删除设备 edge-01')
    expect(button).toHaveClass('px-2', 'custom-button-class')

    const svg = container.querySelector('svg')
    expect(svg).toHaveClass('custom-icon-class', 'text-red-600')
  })

  it('disabled 状态下不应触发 onClick 事件', () => {
    const handleClick = jest.fn()
    render(<DeleteIconButton disabled onClick={handleClick} />)

    const button = screen.getByRole('button', { name: '删除' })
    expect(button).toBeDisabled()

    fireEvent.click(button)
    expect(handleClick).not.toHaveBeenCalled()
  })

  it('stopPropagation=true 时应阻止父级点击事件冒泡', () => {
    const handleParentClick = jest.fn()
    const handleButtonClick = jest.fn()

    render(
      <div onClick={handleParentClick}>
        <DeleteIconButton
          stopPropagation
          onClick={handleButtonClick}
          aria-label="行内删除"
        />
      </div>
    )

    const button = screen.getByRole('button', { name: '行内删除' })
    fireEvent.click(button)

    expect(handleButtonClick).toHaveBeenCalledTimes(1)
    expect(handleParentClick).not.toHaveBeenCalled()
  })

  it('stopPropagation=false 时事件应正常冒泡至父级', () => {
    const handleParentClick = jest.fn()
    const handleButtonClick = jest.fn()

    render(
      <div onClick={handleParentClick}>
        <DeleteIconButton
          onClick={handleButtonClick}
          aria-label="行内删除"
        />
      </div>
    )

    const button = screen.getByRole('button', { name: '行内删除' })
    fireEvent.click(button)

    expect(handleButtonClick).toHaveBeenCalledTimes(1)
    expect(handleParentClick).toHaveBeenCalledTimes(1)
  })

  it('应正确转发 ref 至原生 button 元素', () => {
    const ref = React.createRef<HTMLButtonElement>()
    render(<DeleteIconButton ref={ref} />)

    expect(ref.current).toBeInstanceOf(HTMLButtonElement)
  })
})
