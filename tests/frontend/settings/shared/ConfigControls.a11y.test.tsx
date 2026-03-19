import React from 'react'
import { render, screen } from '@testing-library/react'

import { ConfigInput } from '@/features/settings/components/shared/ConfigInput'
import { ConfigSelect } from '@/features/settings/components/shared/ConfigSelect'
import { ConfigSwitch } from '@/features/settings/components/shared/ConfigSwitch'

describe('Config* 无外部 label 场景可访问性', () => {
  it('ConfigInput 应支持 aria-label 作为可访问名称', () => {
    render(<ConfigInput value="" onChange={() => {}} aria-label="应用名称" />)
    expect(screen.getByLabelText('应用名称')).toBeInTheDocument()
  })

  it('ConfigSelect 应支持 aria-label 作为可访问名称', () => {
    render(
      <ConfigSelect
        value="Asia/Shanghai"
        options={[{ value: 'Asia/Shanghai', label: '中国标准时间' }]}
        onChange={() => {}}
        aria-label="时区"
      />
    )
    expect(screen.getByLabelText('时区')).toBeInTheDocument()
  })

  it('ConfigSwitch 应支持 aria-label 作为可访问名称', () => {
    render(<ConfigSwitch checked={true} onCheckedChange={() => {}} aria-label="启用 MFA" />)
    expect(screen.getByLabelText('启用 MFA')).toBeInTheDocument()
  })
})
