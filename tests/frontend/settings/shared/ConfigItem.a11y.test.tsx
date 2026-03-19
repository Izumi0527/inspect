import React from 'react'
import { render, screen } from '@testing-library/react'

import { ConfigItem } from '@/features/settings/components/shared/ConfigItem'
import { ConfigInput } from '@/features/settings/components/shared/ConfigInput'
import { ConfigSelect } from '@/features/settings/components/shared/ConfigSelect'
import { ConfigSwitch } from '@/features/settings/components/shared/ConfigSwitch'

describe('ConfigItem 可访问性', () => {
  it('应关联 label 与输入控件，并将 description/error 关联到 aria-describedby', () => {
    render(
      <ConfigItem
        label="应用程序名称"
        description="显示在浏览器标题和导航栏的应用名称"
        error="应用名称不能为空"
        required
      >
        <ConfigInput value="网络设备巡检系统" onChange={() => {}} />
      </ConfigItem>
    )

    const input = screen.getByLabelText(/应用程序名称/)
    expect(input).toHaveAttribute('aria-invalid', 'true')

    const description = screen.getByText('显示在浏览器标题和导航栏的应用名称')
    expect(description).toHaveAttribute('id')

    const error = screen.getByText('应用名称不能为空')
    expect(error).toHaveAttribute('id')

    const describedBy = input.getAttribute('aria-describedby') ?? ''
    expect(describedBy).toContain(description.id)
    expect(describedBy).toContain(error.id)
  })

  it('应支持 SelectTrigger 的 id/htmlFor/aria-describedby 关联', () => {
    render(
      <ConfigItem label="时区" description="系统使用的时区" required>
        <ConfigSelect
          value="Asia/Shanghai"
          options={[
            { value: 'Asia/Shanghai', label: '中国标准时间 (UTC+8)' },
            { value: 'America/New_York', label: '美国东部时间 (UTC-5)' },
          ]}
          onChange={() => {}}
        />
      </ConfigItem>
    )

    const trigger = screen.getByLabelText(/时区/)
    expect(trigger).toHaveAttribute('aria-describedby')

    const description = screen.getByText('系统使用的时区')
    expect(description).toHaveAttribute('id')
    expect(trigger.getAttribute('aria-describedby') ?? '').toContain(description.id)
  })

  it('应支持 Switch 的 id/htmlFor 关联', () => {
    render(
      <ConfigItem label="启用多因素认证 (MFA)" description="为用户账号添加额外的安全验证层">
        <ConfigSwitch checked={true} onCheckedChange={() => {}} />
      </ConfigItem>
    )

    const switchControl = screen.getByLabelText(/启用多因素认证/)
    expect(switchControl).toBeInTheDocument()
  })
})

