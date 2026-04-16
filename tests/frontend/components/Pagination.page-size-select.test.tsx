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
      options?: number[]
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
  it('应通过共享 PageSizeSelect 渲染页大小下拉，并在页数越界时修正当前页', async () => {
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

    expect(screen.getByTestId('shared-page-size-select')).toBeInTheDocument()
    expect(mockPageSizeSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({
        value: 20,
        options: [10, 20, 50, 100],
        ariaLabel: '每页条数',
      })
    )

    await user.click(screen.getByTestId('shared-page-size-select'))

    expect(onPageSizeChange).toHaveBeenCalledWith(50)
    expect(onPageChange).toHaveBeenCalledWith(2)
  })
})
