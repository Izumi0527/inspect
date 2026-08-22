import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckDetailTables } from '@/features/inspection/components/CheckDetailTables'
import type {
  BGPPeersDetails,
  ComponentStatusDetails,
  InterfaceRatioDetails,
  OpticalPowerDetails,
} from '@/features/inspection/types'

/**
 * 四类明细表的渲染契约。
 *
 * 明细的价值在于「摘要说有问题之后，能指出是哪一个」。这里锁住三件事：
 * 默认折叠不占版面、展开后逐行可见、缺失数据显示占位符而非 0。
 */

const expand = async (label: RegExp) => {
  await userEvent.click(screen.getByRole('button', { name: label }))
}

describe('接口错包率明细表', () => {
  const details: InterfaceRatioDetails = {
    kind: 'interface_errors',
    total: 3,
    evaluated: 2,
    over_warning: 1,
    over_critical: 1,
    warning_threshold: 0.01,
    critical_threshold: 0.1,
    interfaces: [
      { name: 'GigabitEthernet0/0/1', direction: '入', percent: 1.2, count: 1200, packets: 98800 },
      { name: 'GigabitEthernet0/0/2', direction: '出', percent: 0, count: 0, packets: 100000 },
    ],
    skipped: [{ name: 'NULL0', reason: '设备未上报该计数器' }],
  }

  it('默认折叠，展开后列出逐接口比率与原始计数', async () => {
    render(<CheckDetailTables details={details} />)

    expect(screen.queryByText('GigabitEthernet0/0/1')).not.toBeInTheDocument()

    await expand(/错包/)

    expect(screen.getByText('GigabitEthernet0/0/1')).toBeInTheDocument()
    // 原始计数与包数必须同时可见：累计比率会被历史一次性故障长期拉高，
    // 只看 1.20% 无法区分持续劣化与三年前抖过一次
    expect(screen.getByText('1200')).toBeInTheDocument()
    expect(screen.getByText('98800')).toBeInTheDocument()
  })

  it('展开后列出未评估接口及原因', async () => {
    render(<CheckDetailTables details={details} />)
    await expand(/错包/)

    expect(screen.getByText('NULL0')).toBeInTheDocument()
    expect(screen.getByText(/设备未上报该计数器/)).toBeInTheDocument()
  })
})

describe('光模块明细表', () => {
  const details: OpticalPowerDetails = {
    kind: 'optical_power',
    total: 2,
    evaluated: 1,
    over_warning: 1,
    over_critical: 0,
    warning_threshold: -25,
    critical_threshold: -30,
    modules: [
      {
        index: 'GigabitEthernet0/0/1',
        verdict: 'warning',
        rx_power: -26.4,
        rx_power_unit: 'dBm',
        tx_power: -3.1,
        tx_power_unit: 'dBm',
      },
    ],
    skipped: [{ name: 'GigabitEthernet0/0/2', reason: '设备未上报收光功率' }],
  }

  it('展开后列出收光功率与判定', async () => {
    render(<CheckDetailTables details={details} />)
    await expand(/光模块/)

    expect(screen.getByText('GigabitEthernet0/0/1')).toBeInTheDocument()
    expect(screen.getByText(/-26\.4/)).toBeInTheDocument()
    expect(screen.getByText('警告')).toBeInTheDocument()
  })

  it('未上报的诊断量显示占位符而非 0', async () => {
    render(<CheckDetailTables details={details} />)
    await expand(/光模块/)

    // 「未上报电压」和「电压 0V」是两个完全不同的结论，
    // 渲染成 0 会让运维以为模块供电异常
    expect(screen.queryByText('0.00V')).not.toBeInTheDocument()
    expect(screen.getAllByText('-').length).toBeGreaterThan(0)
  })
})

describe('BGP 邻居明细表', () => {
  const details: BGPPeersDetails = {
    kind: 'bgp_peers',
    total: 3,
    established: 2,
    down: 1,
    flapping: 1,
    flapping_threshold_seconds: 3600,
    peers: [
      {
        index: '10.0.0.3',
        verdict: 'fail',
        state: 2,
        state_label: 'connect',
        last_error: 'hold timer expired',
      },
      { index: '10.0.0.2', verdict: 'warning', state: 6, established_seconds: 120 },
    ],
  }

  it('展开后列出邻居状态与最后错误', async () => {
    render(<CheckDetailTables details={details} />)
    await expand(/BGP|邻居/)

    expect(screen.getByText('10.0.0.3')).toBeInTheDocument()
    expect(screen.getByText('connect')).toBeInTheDocument()
    // LastError 是排障起点：hold timer expired 指向链路，
    // authentication failure 指向配置
    expect(screen.getByText('hold timer expired')).toBeInTheDocument()
  })

  it('展开后声明震荡判定口径', async () => {
    render(<CheckDetailTables details={details} />)
    await expand(/BGP|邻居/)

    // 「建立时长 120 秒」本身不说明问题，得知道判定线在哪。
    // 判定线用人话表述而非裸秒数：3600 说成「1 小时」，且不拖一个多余的「0 分钟」
    expect(screen.getByText(/低于 1 小时视为近期重建/)).toBeInTheDocument()
  })

  it('展开后把建立时长说成人话', async () => {
    render(<CheckDetailTables details={details} />)
    await expand(/BGP|邻居/)

    expect(screen.getByText('2 分钟')).toBeInTheDocument()
  })
})

describe('部件状态明细表', () => {
  const details: ComponentStatusDetails = {
    kind: 'component_status',
    component_kind: 'fan',
    label: '风扇',
    total: 3,
    normal: 1,
    abnormal: 1,
    unknown: 1,
    normal_states: [1],
    abnormal_states: [2],
    components: [
      { index: '2', kind: 'fan', verdict: 'fail', state: 2 },
      { index: '3', kind: 'fan', verdict: 'skip', state: 77 },
      { index: '1', kind: 'fan', verdict: 'pass', state: 1 },
    ],
  }

  it('展开后列出逐部件原始状态码', async () => {
    render(<CheckDetailTables details={details} />)
    await expand(/风扇/)

    expect(screen.getByText('77')).toBeInTheDocument()
  })

  it('展开后回显本次生效的判定依据', async () => {
    render(<CheckDetailTables details={details} />)
    await expand(/风扇/)

    // 状态码语义因厂商而异，只给「码 77，未知」运维无从下手；
    // 给出判定集合才能据此校准模板配置
    expect(screen.getByText(/正常状态码/)).toBeInTheDocument()
    expect(screen.getByText(/异常状态码/)).toBeInTheDocument()
  })
})

describe('未知明细类型', () => {
  it('接口利用率交由既有组件渲染，本组件不重复出表', () => {
    const { container } = render(
      <CheckDetailTables
        details={{
          kind: 'interface_utilization',
          total: 1,
          evaluated: 1,
          over_warning: 0,
          over_critical: 0,
          warning_threshold: 70,
          critical_threshold: 90,
          interfaces: [],
          skipped: [],
        }}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })
})
