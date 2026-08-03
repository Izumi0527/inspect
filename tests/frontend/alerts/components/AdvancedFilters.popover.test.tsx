/**
 * 高级过滤浮层化测试
 *
 * 验证核心诉求：筛选面板改为浮层后不再占据文档流，
 * 展开时不会把下方告警列表推走。
 *
 * 与 AdvancedFilters.select-unification.test.tsx 的分工：
 * 那里 mock 了 @/components/atoms 以聚焦 Select 统一化；
 * 这里必须使用真实的 Popover，否则测不到 Portal 行为。
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdvancedFilters } from '@/features/alerts/components/AdvancedFilters'

// 仅替换 Select：Radix Select 在 jsdom 下依赖指针捕获等能力，
// 而本用例关注 Popover 的挂载位置，与 Select 实现无关。
jest.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const noop = () => {}

describe('AdvancedFilters 浮层化', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('收起状态下筛选面板不应存在于 DOM 中', () => {
    render(<AdvancedFilters onFilterChange={noop} onReset={noop} renderAsCard={false} />)

    expect(screen.queryByRole('textbox', { name: '关键词搜索' })).not.toBeInTheDocument()
  })

  it('展开后面板应渲染在组件容器之外，从而不占据文档流', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <AdvancedFilters onFilterChange={noop} onReset={noop} renderAsCard={false} />,
    )

    await user.click(screen.getByRole('button', { name: /高级过滤/ }))

    const keywordInput = await screen.findByRole('textbox', { name: '关键词搜索' })
    expect(keywordInput).toBeInTheDocument()

    // 关键断言：面板不在组件自身的 DOM 子树内，说明它挂在 Portal 上。
    // 这正是「展开不再挤压告警列表」的结构性保证。
    expect(container.contains(keywordInput)).toBe(false)
  })

  it('组件容器高度不应随展开变化（不再撑高把列表推走）', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <AdvancedFilters onFilterChange={noop} onReset={noop} renderAsCard={false} />,
    )

    const wrapper = container.firstElementChild as HTMLElement
    const childCountBefore = wrapper.querySelectorAll('*').length

    await user.click(screen.getByRole('button', { name: /高级过滤/ }))
    await screen.findByRole('textbox', { name: '关键词搜索' })

    // 展开前后容器内的元素数量保持一致 —— 面板内容全部去了 Portal
    expect(wrapper.querySelectorAll('*').length).toBe(childCountBefore)
  })

  it('触发按钮应通过 aria-expanded 暴露展开状态', async () => {
    const user = userEvent.setup()
    render(<AdvancedFilters onFilterChange={noop} onReset={noop} renderAsCard={false} />)

    const trigger = screen.getByRole('button', { name: /高级过滤/ })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('点击「应用」应关闭浮层', async () => {
    const user = userEvent.setup()
    render(<AdvancedFilters onFilterChange={noop} onReset={noop} renderAsCard={false} />)

    await user.click(screen.getByRole('button', { name: /高级过滤/ }))
    await screen.findByRole('textbox', { name: '关键词搜索' })

    await user.click(screen.getByRole('button', { name: '应用' }))

    expect(screen.queryByRole('textbox', { name: '关键词搜索' })).not.toBeInTheDocument()
  })
})
