import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { AlertDetailModal } from '@/features/alerts/components/AlertDetailModal'
import { fetchAlert, fetchAlertOperations } from '@/features/alerts/api/alerts.api'
import { api } from '@/lib/api-client'
import { clearHuaweiKnowledgeCache } from '@/lib/plain-language'

jest.mock('@/features/alerts/api/alerts.api', () => ({
  fetchAlert: jest.fn(),
  addAlertComment: jest.fn(),
  fetchAlertOperations: jest.fn(),
}))

jest.mock('framer-motion', () => ({
  motion: {
    button: ({
      children,
      whileHover: _whileHover,
      whileTap: _whileTap,
      ...props
    }: any) => (
      <button type="button" {...props}>
        {children}
      </button>
    ),
  },
}))

jest.mock('@/components/atoms', () => ({
  SimpleModal: ({
    open,
    children,
  }: {
    open: boolean
    children: React.ReactNode
  }) => (open ? <div data-testid="simple-modal">{children}</div> : null),
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}))

describe('AlertDetailModal 深链详情加载', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('仅提供 alertId 且 alert 为空时，应拉取并展示告警详情', async () => {
    ;(fetchAlert as jest.Mock).mockResolvedValue({
      id: '99',
      title: '深链告警',
      description: 'desc',
      device: '设备A',
      severity: 'warning',
      status: 'active',
      timestamp: new Date().toISOString(),
      category: 'other',
      tags: [],
      metadata: {},
    })

    render(
      <AlertDetailModal
        open={true}
        onClose={jest.fn()}
        alert={null}
        // 组件尚未声明该入参时用 any 绕过类型检查，保证先写测试再实现
        {...({ alertId: '99' } as any)}
      />,
    )

    await waitFor(() => {
      expect(fetchAlert).toHaveBeenCalledWith('99')
    })
    expect(await screen.findByText('深链告警')).toBeInTheDocument()
  })

  it('当已提供 alert 时，不应重复拉取详情', async () => {
    ;(fetchAlert as jest.Mock).mockResolvedValue({
      id: '99',
      title: '不应被加载的告警',
      description: 'desc',
      device: '设备A',
      severity: 'warning',
      status: 'active',
      timestamp: new Date().toISOString(),
      category: 'other',
      tags: [],
      metadata: {},
    })

    render(
      <AlertDetailModal
        open={true}
        onClose={jest.fn()}
        alert={{
          id: '1',
          title: '列表内告警',
          description: 'desc',
          device: '设备A',
          severity: 'warning',
          status: 'active',
          timestamp: new Date().toISOString(),
          category: 'other',
          tags: [],
          metadata: {},
        }}
        {...({ alertId: '99' } as any)}
      />,
    )

    expect(await screen.findByText('列表内告警')).toBeInTheDocument()
    expect(fetchAlert).toHaveBeenCalledTimes(0)
  })

  it('切换到时间线标签时，应加载并展示操作历史', async () => {
    ;(fetchAlertOperations as jest.Mock).mockResolvedValue([
      {
        id: 'op-1',
        alertId: '1',
        operationType: 'acknowledge',
        operatorId: 'u1',
        operatorName: '张三',
        operationTime: new Date().toISOString(),
        note: '已确认',
        metadata: {},
      },
    ])

    render(
      <AlertDetailModal
        open={true}
        onClose={jest.fn()}
        alert={{
          id: '1',
          title: '列表内告警',
          description: 'desc',
          device: '设备A',
          severity: 'warning',
          status: 'active',
          timestamp: new Date().toISOString(),
          category: 'other',
          tags: [],
          metadata: {},
        }}
      />,
    )

    fireEvent.click(screen.getByText('时间线'))

    await waitFor(() => {
      expect(fetchAlertOperations).toHaveBeenCalledWith('1', 100)
    })

    expect(await screen.findByText('告警确认')).toBeInTheDocument()
    expect(await screen.findByText(/由 张三 确认/)).toBeInTheDocument()
  })

  it('头部不展示内部 ID，附加信息键名展示为中文且隐藏 rule_id', async () => {
    render(
      <AlertDetailModal
        open={true}
        onClose={jest.fn()}
        alert={{
          id: '664',
          title: '接口告警',
          description: 'desc',
          device: '设备A',
          severity: 'critical',
          status: 'active',
          timestamp: new Date().toISOString(),
          category: 'connectivity',
          tags: [],
          metadata: { device_ip: '192.168.20.1', occurrence_count: 36, rule_id: 3 },
        }}
      />,
    )

    expect(await screen.findByText('接口告警')).toBeInTheDocument()

    // 头部不再显示 "ID: 664" 一类内部标识
    expect(screen.queryByText(/ID: 664/)).not.toBeInTheDocument()

    // 附加信息键名映射为中文
    expect(screen.getByText('设备IP:')).toBeInTheDocument()
    expect(screen.getByText('192.168.20.1')).toBeInTheDocument()
    expect(screen.getByText('发生次数:')).toBeInTheDocument()
    expect(screen.getByText('36')).toBeInTheDocument()

    // 原始英文键与内部 rule_id 不再出现
    expect(screen.queryByText(/device_ip/)).not.toBeInTheDocument()
    expect(screen.queryByText(/occurrence_count/)).not.toBeInTheDocument()
    expect(screen.queryByText(/rule_id/)).not.toBeInTheDocument()
  })

  it('告警含华为 Trap OID 时弹窗打开按需请求知识库并展示官方参考，普通纯文本不发请求', async () => {
    clearHuaweiKnowledgeCache()
    const getSpy = jest.spyOn(api, 'get').mockResolvedValue({
      success: true,
      data: {
        matched: true,
        kind: 'alarm',
        alarm: {
          oid: '1.3.6.1.4.1.2011.5.25.219.2.2.3',
          module: 'HUAWEI-ENTITY-TRAP-MIB',
          alarm_name: 'hwBoardFail',
          meaning: '单板发生局部功能失效。',
          causes: ['单板硬件故障或插接不良'],
          procedures: ['执行 display device 检查单板状态'],
        },
      },
    })

    try {
      const { rerender } = render(
        <AlertDetailModal
          open={true}
          onClose={jest.fn()}
          alert={{
            id: '701',
            title: '普通文本告警',
            description: '仅含普通中文描述，不含任何 OID 或 VRP 头',
            device: '核心交换机',
            severity: 'warning',
            status: 'active',
            timestamp: new Date().toISOString(),
            category: 'other',
            tags: [],
            metadata: {},
          }}
        />,
      )

      expect(await screen.findByText('普通文本告警')).toBeInTheDocument()
      expect(getSpy).not.toHaveBeenCalled()

      rerender(
        <AlertDetailModal
          open={true}
          onClose={jest.fn()}
          alert={{
            id: '702',
            title: '单板故障告警',
            description: 'SNMP Trap 1.3.6.1.4.1.2011.5.25.219.2.2.3 | Board failed',
            device: '核心交换机',
            severity: 'critical',
            status: 'active',
            timestamp: new Date().toISOString(),
            category: 'hardware',
            tags: [],
            metadata: {},
          }}
        />,
      )

      expect(await screen.findByText('华为官方文档参考')).toBeInTheDocument()
      expect(screen.getByText('单板发生局部功能失效。')).toBeInTheDocument()
      expect(screen.getByText('执行 display device 检查单板状态')).toBeInTheDocument()
      expect(getSpy).toHaveBeenCalledTimes(1)
    } finally {
      getSpy.mockRestore()
    }
  })
})
