import React from 'react'
import { render, screen } from '@testing-library/react'
import { UserPreferenceSection } from '@/features/settings/components/general/UserPreferenceSection'

jest.mock('@/features/settings/components/shared/SectionHeader', () => ({
  SectionHeader: ({ title }: { title: string }) => <div>{title}</div>,
}))

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
    placeholder,
  }: {
    value?: string
    placeholder?: string
  }) => <input value={value} placeholder={placeholder} readOnly />,
}))

jest.mock('@/features/settings/components/shared/ConfigSelect', () => ({
  ConfigSelect: ({
    value,
    options,
  }: {
    value?: string
    options: Array<{ value: string; label: string }>
  }) => (
    <select value={value} readOnly>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}))

describe('UserPreferenceSection', () => {
  it('将主题字段与暗色模式文案统一为新的命名', () => {
    render(
      <UserPreferenceSection
        data={{
          theme: 'dark',
          language: 'zh-CN',
          dateFormat: 'YYYY-MM-DD',
          timeFormat: '24h',
        }}
        onChange={jest.fn()}
      />
    )

    expect(screen.getByText('主题')).toBeInTheDocument()
    expect(screen.queryByText('主题模式')).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: '暗色模式' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '深色模式' })).not.toBeInTheDocument()
  })
})
