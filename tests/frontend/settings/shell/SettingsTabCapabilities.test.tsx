import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { Activity, AlertTriangle } from 'lucide-react'
import { SettingsShellProvider } from '@/features/settings/context/SettingsShellContext'
import { useSettingsTabCapabilities } from '@/features/settings/hooks/useSettingsTabCapabilities'
import { useSettingsShellState } from '@/features/settings/hooks/useSettingsShellState'

const CapabilitiesReporter: React.FC = () => {
  useSettingsTabCapabilities('general', {
    dirty: true,
    saving: true,
    blockLeave: true,
    stats: [
      {
        key: 'cpu',
        title: 'CPU 使用率',
        value: '10%',
        icon: Activity,
      },
    ],
    banners: [
      {
        key: 'hint',
        tone: 'warning',
        title: '提示',
        description: '这里是测试用 banner',
      },
    ],
    primaryActions: [
      {
        key: 'save',
        label: '保存',
        onClick: () => {},
      },
    ],
    secondaryActions: [
      {
        key: 'reset',
        label: '重置',
        icon: <AlertTriangle className="w-4 h-4" />,
        onClick: () => {},
      },
    ],
  })

  return <div>capabilities-reporter</div>
}

const CapabilitiesReader: React.FC = () => {
  const { activeTabCapabilities } = useSettingsShellState()
  if (!activeTabCapabilities) return <div data-testid="capabilities">none</div>

  return (
    <div data-testid="capabilities">
      dirty:{String(activeTabCapabilities.dirty)};saving:{String(
        activeTabCapabilities.saving
      )}
      ;blockLeave:{String(activeTabCapabilities.blockLeave)};stats:
      {String(activeTabCapabilities.stats?.length || 0)};banners:
      {String(activeTabCapabilities.banners?.length || 0)};primaryActions:
      {String(activeTabCapabilities.primaryActions?.length || 0)}
    </div>
  )
}

describe('SettingsTabCapabilities', () => {
  it('子页应可向壳层上报 capabilities，且壳层可读取 activeTabCapabilities', async () => {
    render(
      <SettingsShellProvider activeTabKey="general">
        <CapabilitiesReporter />
        <CapabilitiesReader />
      </SettingsShellProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('capabilities')).toHaveTextContent('dirty:true')
    })
    expect(screen.getByTestId('capabilities')).toHaveTextContent('saving:true')
    expect(screen.getByTestId('capabilities')).toHaveTextContent('blockLeave:true')
    expect(screen.getByTestId('capabilities')).toHaveTextContent('stats:1')
    expect(screen.getByTestId('capabilities')).toHaveTextContent('banners:1')
    expect(screen.getByTestId('capabilities')).toHaveTextContent('primaryActions:1')
  })

  it('子页卸载后，应清理对应 tab 的 capabilities', async () => {
    const Wrapper: React.FC<{ showReporter: boolean }> = ({ showReporter }) => (
      <SettingsShellProvider activeTabKey="general">
        {showReporter ? <CapabilitiesReporter /> : null}
        <CapabilitiesReader />
      </SettingsShellProvider>
    )

    const { rerender } = render(<Wrapper showReporter={true} />)

    await waitFor(() => {
      expect(screen.getByTestId('capabilities')).toHaveTextContent('dirty:true')
    })

    rerender(<Wrapper showReporter={false} />)

    await waitFor(() => {
      expect(screen.getByTestId('capabilities')).toHaveTextContent('none')
    })
  })
})

