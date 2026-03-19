import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RotateCcw } from 'lucide-react'
import { SettingsToolbar } from '@/features/settings/shell/SettingsToolbar'

describe('SettingsToolbar', () => {
  it('支持 search 输入并回调 onChange', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()

    const Wrapper: React.FC = () => {
      const [value, setValue] = React.useState('')

      return (
        <SettingsToolbar
          toolbar={{
            search: {
              value,
              placeholder: '搜索用户',
              ariaLabel: '搜索用户',
              onChange: (next) => {
                setValue(next)
                onChange(next)
              },
            },
          }}
        />
      )
    }

    render(<Wrapper />)

    await user.type(screen.getByLabelText('搜索用户'), 'abc')

    expect(onChange).toHaveBeenCalled()
    expect(onChange).toHaveBeenLastCalledWith('abc')
  })

  it('支持渲染主次 actions 并可触发点击', async () => {
    const user = userEvent.setup()
    const onSave = jest.fn()
    const onReset = jest.fn()

    render(
      <SettingsToolbar
        primaryActions={[
          { key: 'save', label: '保存', onClick: onSave },
        ]}
        secondaryActions={[
          {
            key: 'reset',
            label: '重置',
            icon: <RotateCcw className="w-4 h-4" />,
            onClick: onReset,
          },
        ]}
        toolbar={{
          search: {
            value: '',
            ariaLabel: '搜索',
            onChange: () => {},
          },
          filters: <div>filters</div>,
        }}
      />
    )

    await user.click(screen.getByText('保存'))
    await user.click(screen.getByText('重置'))

    expect(onSave).toHaveBeenCalled()
    expect(onReset).toHaveBeenCalled()
    expect(screen.getByText('filters')).toBeInTheDocument()
  })

  it('无 search/filters/actions 时应渲染为空', () => {
    const { container } = render(<SettingsToolbar />)
    expect(container).toBeEmptyDOMElement()
  })
})
