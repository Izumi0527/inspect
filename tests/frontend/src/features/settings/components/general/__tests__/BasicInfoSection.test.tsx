import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BasicInfoSection } from '@/features/settings/components/general/BasicInfoSection'

jest.mock('@/features/settings/components/shared/ConfigItem', () => ({
  ConfigItem: ({
    label,
    children,
  }: {
    label: string
    children: React.ReactNode
  }) => (
    <label>
      <span>{label}</span>
      {children}
    </label>
  ),
}))

jest.mock('@/features/settings/components/shared/ConfigInput', () => ({
  ConfigInput: ({
    value,
    onChange,
    disabled,
    placeholder,
  }: {
    value?: string
    onChange?: (value: string) => void
    disabled?: boolean
    placeholder?: string
  }) => (
    <input
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      disabled={disabled}
      placeholder={placeholder}
    />
  ),
}))

jest.mock('@/features/settings/components/shared/ConfigSelect', () => ({
  ConfigSelect: ({
    value,
    onChange,
    options,
  }: {
    value?: string
    onChange?: (value: string) => void
    options: Array<{ value: string; label: string }>
  }) => (
    <select
      aria-label="时区"
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}))

describe('BasicInfoSection', () => {
  const data = {
    applicationName: '网络设备巡检系统',
    version: '1.0.0',
    timezone: 'Asia/Shanghai',
  }

  it('在基础信息标题同行渲染保存和重置按钮，并响应点击', async () => {
    const user = userEvent.setup()
    const onSave = jest.fn()
    const onReset = jest.fn()

    render(
      <BasicInfoSection
        {...({
          data,
          onChange: jest.fn(),
          actions: {
            isDirty: true,
            isSaving: false,
            onSave,
            onReset,
          },
        } as any)}
      />
    )

    expect(
      screen.getByRole('group', { name: '基础信息操作' })
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '重置整页更改' }))
    expect(onReset).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: '保存整页更改' }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('在无未保存改动或保存中时禁用按钮', () => {
    render(
      <BasicInfoSection
        {...({
          data,
          onChange: jest.fn(),
          actions: {
            isDirty: false,
            isSaving: true,
            onSave: jest.fn(),
            onReset: jest.fn(),
          },
        } as any)}
      />
    )

    expect(screen.getByRole('button', { name: '重置整页更改' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '保存中...' })).toBeDisabled()
  })
})
