import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Pagination } from '@/components/atoms/pagination'

const mockPageSizeSelect = jest.fn()

jest.mock('@/components/atoms/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...props
  }: {
    children: React.ReactNode
    onClick?: React.MouseEventHandler<HTMLButtonElement>
    disabled?: boolean
    [key: string]: unknown
  }) => (
    <button type="button" onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}))

jest.mock(
  '@/components/atoms/page-size-select',
  () => ({
    PageSizeSelect: (props: {
      value: number
      options?: readonly number[]
      onChange: (value: number) => void
      ariaLabel?: string
    }) => {
      mockPageSizeSelect(props)
      return (
        <button
          type="button"
          data-testid="shared-page-size-select"
          onClick={() => props.onChange(50)}
        >
          {`页大小:${props.value}`}
        </button>
      )
    },
  }),
  { virtual: true }
)

describe('Pagination 共享页大小下拉接入', () => {
  it('应通过共享 PageSizeSelect 渲染页大小下拉', () => {
    const onPageChange = jest.fn()
    const onPageSizeChange = jest.fn()

    render(
      <Pagination
        currentPage={5}
        totalPages={10}
        totalItems={95}
        pageSize={20}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    )

    expect(screen.getByTestId('shared-page-size-select')).toBeInTheDocument()
    expect(mockPageSizeSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({
        value: 20,
        options: [10, 20, 50, 100],
        ariaLabel: '每页条数',
      })
    )
  })

  it('切换页大小时只上报新条数，不再擅自回调页码（归位由调用方决定）', async () => {
    const user = userEvent.setup()
    const onPageChange = jest.fn()
    const onPageSizeChange = jest.fn()

    render(
      <Pagination
        currentPage={5}
        totalPages={10}
        totalItems={95}
        pageSize={20}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    )

    await user.click(screen.getByTestId('shared-page-size-select'))

    expect(onPageSizeChange).toHaveBeenCalledTimes(1)
    expect(onPageSizeChange).toHaveBeenCalledWith(50)
    // 统一契约：页码规则由调用方统一实现（一律回到第 1 页），组件不得二次改动页码
    expect(onPageChange).not.toHaveBeenCalled()
  })
})

describe('Pagination 空列表边界', () => {
  it('总页数为零时保留档位选择器并禁用全部导航按钮', () => {
    render(
      <Pagination currentPage={1} totalPages={0} totalItems={0} pageSize={20}
        onPageChange={jest.fn()} onPageSizeChange={jest.fn()} />
    )
    expect(screen.getByTestId('shared-page-size-select')).toBeInTheDocument()
    for (const title of ['上一页', '下一页']) {
      expect(screen.getByTitle(title)).toBeDisabled()
    }
    expect(screen.getByText(/第 0 - 0 条/).textContent).toContain('第 0 - 0 条，共 0 条')
  })
})

describe('Pagination 截图布局与页码', () => {
  const renderPage = (currentPage = 1, totalPages = 16, totalItems = 156) => {
    const onPageChange = jest.fn()
    const view = render(<Pagination currentPage={currentPage} totalPages={totalPages}
      totalItems={totalItems} pageSize={10} onPageChange={onPageChange} onPageSizeChange={jest.fn()} />)
    return { ...view, onPageChange }
  }

  it.each<[number, string[]]>([
    [1, ['1', '2', '3', '4', '...', '15', '16']],
    [8, ['1', '2', '...', '7', '8', '9', '...', '15', '16']],
    [16, ['1', '2', '...', '13', '14', '15', '16']],
  ])('第 %i 页的页码与省略号符合规则', (currentPage, expected) => {
    const { container } = renderPage(currentPage)
    const navigation = container.querySelector('[aria-label="分页导航"]')
    expect(navigation).not.toBeNull()
    const items = navigation?.querySelectorAll('[data-page-item]')
    expect(Array.from(items ?? []).map(item => item.textContent)).toEqual(expected)
    expect(screen.getByRole('button', { name: String(currentPage), exact: true })).toHaveAttribute('aria-current', 'page')
  })

  it('最多八页时全部展示，没有省略号', () => {
    const { container } = renderPage(4, 8, 80)
    expect(Array.from(container.querySelectorAll('[data-page-item]')).map(item => item.textContent))
      .toEqual(['1', '2', '3', '4', '5', '6', '7', '8'])
  })

  it('区间位于左侧，选择器位于下一页之后，不显示旧导航', () => {
    renderPage()
    expect(screen.getByText('第 1 - 10 条，共 156 条')).toBeInTheDocument()
    expect(screen.queryByTitle('第一页')).not.toBeInTheDocument()
    expect(screen.queryByTitle('最后一页')).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    const next = screen.getByRole('button', { name: '下一页' })
    const selector = screen.getByTestId('shared-page-size-select')
    expect(next.compareDocumentPosition(selector) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('button', { name: '1', exact: true })).toHaveClass('rounded-full')
  })

  it('当前页和禁用的上一页不触发，下一页只触发一次', async () => {
    const user = userEvent.setup()
    const { onPageChange } = renderPage()
    await user.click(screen.getByRole('button', { name: '1', exact: true }))
    await user.click(screen.getByRole('button', { name: '上一页' }))
    expect(onPageChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '下一页' }))
    expect(onPageChange).toHaveBeenCalledTimes(1)
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('末页区间不超过总数且下一页禁用', () => {
    renderPage(16)
    expect(screen.getByText('第 151 - 156 条，共 156 条')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled()
  })
})

it('临界页数的每个当前页均可见，页码有序且不重复', () => {
  for (let totalPages = 9; totalPages <= 18; totalPages++) {
    for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
      const { container, unmount } = render(<Pagination currentPage={currentPage} totalPages={totalPages}
        totalItems={totalPages * 10} pageSize={10} onPageChange={jest.fn()} />)
      const numbers = Array.from(container.querySelectorAll('button[data-page-item]')).map(item => Number(item.textContent))
      expect(numbers).toContain(currentPage)
      expect(numbers.slice(0, 2)).toEqual([1, 2])
      expect(numbers.slice(-2)).toEqual([totalPages - 1, totalPages])
      expect(numbers).toEqual([...new Set(numbers)].sort((a, b) => a - b))
      expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
      unmount()
    }
  }
})
