import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Server } from 'lucide-react'

import { CompactStatCard } from '@/components/shared'

describe('CompactStatCard', () => {
  it('使用设备管理同款的紧凑规格渲染', () => {
    const { container } = render(
      <CompactStatCard
        title="总设备数"
        value={12}
        icon={Server}
        iconClassName="text-blue-600 dark:text-blue-400"
        iconBgClassName="bg-blue-100 dark:bg-blue-900/30"
      />
    )

    const titleEl = screen.getByText('总设备数')
    expect(titleEl).toHaveClass(
      'text-xs',
      'font-medium',
      'text-muted-foreground',
      'leading-tight'
    )

    const valueEl = screen.getByText('12')
    expect(valueEl).toHaveClass('text-lg', 'font-bold', 'leading-none')

    // CardContent 使用 p-2.5（Tailwind 含小数点，需要转义）
    expect(container.querySelector('.p-2\\.5')).toBeInTheDocument()

    // 图标容器使用 p-1 + rounded-md，并带有传入的背景色
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg?.parentElement).toHaveClass('p-1', 'rounded-md', 'bg-blue-100')
  })

  it('提供 onClick 时可点击并触发回调', async () => {
    const onClick = jest.fn()
    const user = userEvent.setup()

    render(
      <CompactStatCard
        title="总设备数"
        value={10}
        icon={Server}
        onClick={onClick}
      />
    )

    const button = screen.getByRole('button', { name: '总设备数：10' })
    expect(button).toHaveClass('block', 'w-full')

    await user.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('提供 change 时显示趋势信息', () => {
    render(
      <CompactStatCard
        title="在线设备"
        value={1}
        icon={Server}
        change="+10%"
        trend="up"
      />
    )

    const changeEl = screen.getByText('↗ +10%')
    expect(changeEl).toHaveClass('text-xs', 'font-semibold')
    expect(changeEl).toHaveClass('text-green-600')
  })

  it('提供 changeHint 时追加提示文案', () => {
    render(
      <CompactStatCard
        title="在线设备"
        value={1}
        icon={Server}
        change="+10%"
        changeHint="vs 上期"
        trend="up"
      />
    )

    expect(screen.getByText('vs 上期')).toBeInTheDocument()
  })
})
