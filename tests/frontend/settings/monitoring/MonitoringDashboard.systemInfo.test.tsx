import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'

import { MonitoringDashboard } from '@/features/settings/components/monitoring/MonitoringDashboard'
import { SettingsShellProvider } from '@/features/settings/context/SettingsShellContext'

const mockUseSystemMonitoring = jest.fn()

jest.mock('@/features/settings/hooks/useSystemMonitoring', () => ({
  useSystemMonitoring: (...args: unknown[]) => mockUseSystemMonitoring(...args),
}))

const metrics = {
  cpu: { usage: 12.3, cores: 4, temperature: 55 },
  memory: { usage: 45.6, used: 1024, total: 2048 },
  disk: { usage: 78.9, used: 100, total: 200 },
  network: { bytesReceived: 1, bytesSent: 2, packetsReceived: 3, packetsSent: 4 },
}

const renderWithSystem = (system: {
  platform: string
  osVersion: string
}) => {
  mockUseSystemMonitoring.mockReturnValue({
    metrics,
    services: [],
    system: {
      hostname: 'inspect-01',
      nodeVersion: 'go1.23.5',
      uptime: 3600,
      processUptime: 60,
      ...system,
    },
    history: undefined,
    timestamp: 1710000000,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  })

  return render(
    <SettingsShellProvider activeTabKey="monitoring">
      <MonitoringDashboard />
    </SettingsShellProvider>
  )
}

// 后端在 Windows 上 platform 本身含产品名，在 Linux 上版本号只在 osVersion 里；
// 此前页面只渲染 platform，导致 Ubuntu 只显示发行版名而丢失版本。
describe('MonitoringDashboard 系统信息卡的操作系统字段', () => {
  beforeEach(() => {
    mockUseSystemMonitoring.mockReset()
  })

  it('platform 与 osVersion 都展示（Ubuntu 场景）', async () => {
    renderWithSystem({ platform: 'Ubuntu', osVersion: '24.04.4 LTS (Noble Numbat)' })

    await waitFor(() => {
      expect(screen.getByText('操作系统')).toBeInTheDocument()
    })
    const cell = within(screen.getByText('操作系统').parentElement as HTMLElement)
    expect(cell.getByText('Ubuntu')).toBeInTheDocument()
    expect(cell.getByText('24.04.4 LTS (Noble Numbat)')).toBeInTheDocument()
  })

  it('osVersion 为空时只展示 platform，不留空节点', async () => {
    renderWithSystem({ platform: 'linux', osVersion: '' })

    await waitFor(() => {
      expect(screen.getByText('操作系统')).toBeInTheDocument()
    })
    const cellElement = screen.getByText('操作系统').parentElement as HTMLElement
    expect(within(cellElement).getByText('linux')).toBeInTheDocument()
    expect(cellElement.querySelectorAll('p')).toHaveLength(2)
  })
})
