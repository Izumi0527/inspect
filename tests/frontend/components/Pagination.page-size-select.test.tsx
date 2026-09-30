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
    for (const title of ['第一页', '上一页', '下一页', '最后一页']) {
      expect(screen.getByTitle(title)).toBeDisabled()
    }
    expect(screen.getByText(/显示/).textContent).toContain('显示 0 - 0 / 共 0 条')
  })
})
