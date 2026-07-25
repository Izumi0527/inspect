import React from 'react'
import { render, screen } from '@testing-library/react'
import { GeneralOverviewCard } from '@/features/settings/components/general/GeneralOverviewCard'

jest.mock('@/components/shared', () => ({
  CompactStatCard: ({ title, value }: { title: string; value: React.ReactNode }) => (
    <div>
      <span>{title}</span>
      <span>{String(value)}</span>
    </div>
  ),
}))

describe('GeneralOverviewCard', () => {
  it('在概览中使用“暗色”作为主题展示文案', () => {
    render(
      <GeneralOverviewCard
        applicationName="网络设备巡检系统"
        timezone="Asia/Shanghai"
        maxConcurrentTasks={10}
        defaultTimeout={30}
        defaultFormat="excel"
        theme="dark"
      />
    )

    expect(screen.getByText('当前主题')).toBeInTheDocument()
    expect(screen.getByText('暗色')).toBeInTheDocument()
    expect(screen.queryByText('深色')).not.toBeInTheDocument()
  })
})
