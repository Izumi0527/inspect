import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Server } from 'lucide-react'

import { CompactStatCard } from '@/components/shared'

let mockedSkin: 'classic' | 'instrument' | 'glass' = 'classic'
jest.mock('@/lib/contexts/skin-context', () => ({
  useSkin: () => ({ skin: mockedSkin, setSkin: jest.fn() }),
}))

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
    expect(valueEl).toHaveClass('text-2xl', 'font-semibold', 'leading-none', 'tabular-nums')

    // 紧凑内边距由 components 层按 data-slot 锚点提供（不再写死在 CardContent 上）
    expect(container.querySelector('[data-slot="stat-card"]')).toBeInTheDocument()

    // 传入 iconBgClassName 时图标有底衬容器，并带传入的背景色
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg?.parentElement).toHaveClass('h-6', 'w-6', 'rounded-sm', 'bg-blue-100')
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
    expect(changeEl).toHaveClass('text-xs', 'font-medium')
    expect(changeEl).toHaveClass('text-success')
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

describe('CompactStatCard · 皮肤分支', () => {
  afterEach(() => {
    mockedSkin = 'classic'
  })

  it('glass 皮肤保留调用方传入的调色板类（与 classic 同侧）', () => {
    mockedSkin = 'glass'
    render(<CompactStatCard title="在线" value={3} icon={Server} valueClassName="text-emerald-600" />)
    expect(screen.getByText('3')).toHaveClass('text-emerald-600')
  })

  it('instrument 皮肤剥离调用方传入的调色板类', () => {
    mockedSkin = 'instrument'
    render(<CompactStatCard title="在线" value={3} icon={Server} valueClassName="text-emerald-600" />)
    expect(screen.getByText('3')).not.toHaveClass('text-emerald-600')
  })
})
