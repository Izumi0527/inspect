import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PageSizeSelect } from '@/components/atoms/page-size-select'

const mockSharedSelect = jest.fn()

jest.mock(
  '@/components/atoms/shared-select',
  () => ({
    SharedSelect: (props: {
      value?: string
      options: Array<{ value: string; label: React.ReactNode }>
      onChange?: (value: string) => void
      ariaLabel?: string
    }) => {
      mockSharedSelect(props)
      return (
        <button
          type="button"
          data-testid="page-size-shared-select"
          aria-label={props.ariaLabel}
          onClick={() => props.onChange?.('50')}
        >
          {`共享下拉:${props.value}`}
        </button>
      )
    },
  }),
  { virtual: true }
)

describe('PageSizeSelect', () => {
  beforeEach(() => {
    mockSharedSelect.mockReset()
  })

  it('应基于共享 SharedSelect 渲染，并把字符串值转换为数字回传', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()

    render(<PageSizeSelect value={20} options={[10, 20, 50]} onChange={onChange} />)

    expect(screen.getByTestId('page-size-shared-select')).toBeInTheDocument()
    expect(mockSharedSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({
        value: '20',
        ariaLabel: '每页条数',
        options: [
          { value: '10', label: '10条/页' },
          { value: '20', label: '20条/页' },
          { value: '50', label: '50条/页' },
        ],
      })
    )

    await user.click(screen.getByTestId('page-size-shared-select'))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(50)
  })
})
