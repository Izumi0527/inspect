import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EditDeviceModal } from '@/features/devices/components/modals/EditDeviceModal'
import type { Device } from '@/features/devices/types'
import {
  buildDeviceCredentialsEditHref,
  buildMonitoringHostDrawerHref,
  parseDeviceDeepLink,
  stripDeviceDeepLinkParams,
} from '@/features/devices/utils/deviceDeepLink'

jest.mock('@/components/atoms', () => {
  const actual = jest.requireActual('@/components/atoms')
  return {
    ...actual,
    SimpleModal: ({
      open,
      title,
      children,
    }: {
      open: boolean
      title: string
      children: React.ReactNode
    }) =>
      open ? (
        <div role="dialog" aria-label={title}>
          <h2>{title}</h2>
          {children}
        </div>
      ) : null,
  }
})

jest.mock('@/features/devices/api/devices.api', () => ({
  testCliConnection: jest.fn(),
}))

const mockDevice: Device = {
  id: 42,
  name: 'Core-SW-42',
  ip: '10.10.1.42',
  device_type: 'switch',
  vendor: 'huawei',
  status: 'online',
  location: 'A机房',
  last_seen: '2026-11-24T08:00:00Z',
  uptime: '1200',
  cli_protocol: 'ssh',
  ssh_config: {
    username: 'netops',
    port: 22,
    use_key_auth: false,
    password_configured: true,
  },
  snmp_config: {
    version: 'v2c',
    port: 161,
    v2c_config: {
      community: '',
      community_configured: true,
      write_community_configured: false,
    },
  },
}

describe('deviceDeepLink 工具模块与 EditDeviceModal 凭据深链聚焦', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('parseDeviceDeepLink 严格校验 deviceId、白名单 action/section/from 并防 Open Redirect', () => {
    expect(
      parseDeviceDeepLink(
        new URLSearchParams('deviceId=42&action=edit&section=credentials&from=monitoring'),
      ),
    ).toEqual({
      deviceId: 42,
      action: 'edit',
      section: 'credentials',
      source: 'monitoring',
      key: '42:edit:credentials:monitoring',
    })

    expect(parseDeviceDeepLink(new URLSearchParams('deviceId=42'))).toEqual({
      deviceId: 42,
      action: 'view',
      section: undefined,
      source: undefined,
      key: '42:view::',
    })

    // 恶意外部 URL 或未知来源一律忽略为 undefined
    expect(
      parseDeviceDeepLink(
        new URLSearchParams(
          'deviceId=42&action=delete&section=other&from=https://evil.com',
        ),
      ),
    ).toEqual({
      deviceId: 42,
      action: 'view',
      section: undefined,
      source: undefined,
      key: '42:view::',
    })

    expect(parseDeviceDeepLink(new URLSearchParams('deviceId=0'))).toBeNull()
    expect(parseDeviceDeepLink(new URLSearchParams('deviceId=-5'))).toBeNull()
    expect(parseDeviceDeepLink(new URLSearchParams('deviceId=abc'))).toBeNull()
    expect(
      parseDeviceDeepLink(new URLSearchParams('deviceId=9007199254740993')),
    ).toBeNull()
  })

  it('buildDeviceCredentialsEditHref / buildMonitoringHostDrawerHref / stripDeviceDeepLinkParams 正确构造与清理参数', () => {
    expect(buildDeviceCredentialsEditHref(21)).toBe(
      '/devices?deviceId=21&action=edit&section=credentials&from=monitoring',
    )
    expect(buildDeviceCredentialsEditHref(21, { canUpdate: false })).toBe(
      '/devices?deviceId=21&from=monitoring',
    )
    expect(buildDeviceCredentialsEditHref(-1)).toBe('/devices')

    expect(buildMonitoringHostDrawerHref(21)).toBe('/monitoring?tab=hosts&hostId=21')
    expect(buildMonitoringHostDrawerHref(0)).toBe('/monitoring?tab=hosts')

    // 清理深链参数时保留无关参数（如 search）
    expect(
      stripDeviceDeepLinkParams(
        new URLSearchParams(
          'search=core&deviceId=42&action=edit&section=credentials&from=monitoring',
        ),
        '/devices',
      ),
    ).toBe('/devices?search=core')

    expect(
      stripDeviceDeepLinkParams(
        new URLSearchParams('deviceId=42&action=edit'),
        '/devices',
      ),
    ).toBe('/devices')

    expect(
      stripDeviceDeepLinkParams(new URLSearchParams('search=core'), '/devices'),
    ).toBeNull()
  })

  it('EditDeviceModal 在 loading && !device 时展示加载中提示而非误导性空态', () => {
    render(
      <EditDeviceModal
        isOpen
        device={null}
        loading
        onClose={jest.fn()}
        onSubmit={jest.fn()}
      />,
    )

    expect(screen.getByText('正在加载设备配置与凭据信息...')).toBeInTheDocument()
    expect(screen.queryByText('请选择要编辑的设备')).not.toBeInTheDocument()
  })

  it('focusSection="credentials" 高亮凭据区、安全调用 scrollIntoView 且「更新并返回监控」保留未修改密文', async () => {
    const scrollIntoViewMock = jest.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoViewMock

    const onSubmit = jest.fn().mockResolvedValue(undefined)
    const onClose = jest.fn()
    const onReturnToMonitoring = jest.fn()

    render(
      <EditDeviceModal
        isOpen
        device={mockDevice}
        loading={false}
        focusSection="credentials"
        returnToMonitoringHref="/monitoring?tab=hosts&hostId=42"
        onReturnToMonitoring={onReturnToMonitoring}
        onClose={onClose}
        onSubmit={onSubmit}
      />,
    )

    expect(
      screen.getByText('留空密码/团体字将保留现有加密凭据，仅修改需要更新的字段'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回监控抽屉' })).toHaveAttribute(
      'href',
      '/monitoring?tab=hosts&hostId=42',
    )

    const credentialsSection = screen.getByTestId('device-credentials-section')
    expect(credentialsSection).toHaveClass('ring-2')
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    })

    // 仅修改 SNMP 只读团体字，保持 SSH 密码留空
    const communityInput = screen.getByPlaceholderText('public')
    fireEvent.change(communityInput, { target: { value: 'new-ro-comm' } })

    const returnSubmitBtn = await screen.findByRole('button', {
      name: '更新并返回监控',
    })
    await waitFor(() => expect(returnSubmitBtn).not.toBeDisabled())
    fireEvent.click(returnSubmitBtn)

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })

    const [submittedId, submittedPayload] = onSubmit.mock.calls[0]
    expect(submittedId).toBe(42)
    expect(submittedPayload.snmp_community).toBe('new-ro-comm')
    expect(submittedPayload.tags.snmp_config.v2c_config?.community).toBe('new-ro-comm')
    // 留空的 SSH 密码不得以空串或占位符下发，保持 undefined 以保留现有加密凭据
    expect(submittedPayload.ssh_password).toBeUndefined()
    expect(submittedPayload.tags.cli_config.ssh_config?.password).toBeUndefined()

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
      expect(onReturnToMonitoring).toHaveBeenCalledTimes(1)
    })
  })
})
