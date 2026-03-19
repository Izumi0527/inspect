import React from 'react'
import { render, screen } from '@testing-library/react'
import { Activity, Database } from 'lucide-react'
import { SettingsStatsStrip } from '@/features/settings/shell/SettingsStatsStrip'

describe('SettingsStatsStrip', () => {
  it('应基于 descriptor 渲染 CompactStatCard', () => {
    render(
      <SettingsStatsStrip
        stats={[
          { key: 'cpu', title: 'CPU 使用率', value: '10%', icon: Activity },
          { key: 'db', title: '数据库连接', value: '正常', icon: Database },
        ]}
      />
    )

    expect(screen.getByText('CPU 使用率')).toBeInTheDocument()
    expect(screen.getByText('10%')).toBeInTheDocument()
    expect(screen.getByText('数据库连接')).toBeInTheDocument()
    expect(screen.getByText('正常')).toBeInTheDocument()
  })
})

