import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckDetailTables } from '@/features/inspection/components/CheckDetailTables'
import type {
  BGPPeersDetails,
  ComponentStatusDetails,
  DiskUsageDetails,
  FlashUsageDetails,
  InterfaceRatioDetails,
  InterfaceStatusDetails,
  OpticalPowerDetails,
  PoEDetails,
  StackStatusDetails,
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

describe('磁盘分区明细表', () => {
  const details: DiskUsageDetails = {
    kind: 'disk_usage',
    total: 3,
    evaluated: 2,
    over_warning: 1,
    over_critical: 1,
    warning_threshold: 80,
    critical_threshold: 90,
    disks: [
      { name: '/data', total_bytes: 536870912000, used_bytes: 510027366400, percent: 95, verdict: 'fail' },
      { name: '/', total_bytes: 53687091200, used_bytes: 24159191040, percent: 45, verdict: 'pass' },
    ],
    skipped: [{ name: '/snap/core/16928', reason: '伪文件系统或只读镜像，不参与判定' }],
  }

  // 只给「95%」看不出是 10 GB 的系统盘还是 500 GB 的数据盘，处置紧迫程度完全不同
  it('展开后逐分区列出使用率、已用与容量', async () => {
    render(<CheckDetailTables details={details} />)
    expect(screen.queryByText('/data')).not.toBeInTheDocument()

    await expand(/磁盘分区明细/)

    expect(screen.getByText('/data')).toBeInTheDocument()
    expect(screen.getByText('95.0%')).toBeInTheDocument()
    expect(screen.getByText('475.0 GB')).toBeInTheDocument()
    expect(screen.getByText('500.0 GB')).toBeInTheDocument()
    expect(screen.getByText('异常')).toBeInTheDocument()
  })

  it('展开后列出未参与判定的分区及原因', async () => {
    render(<CheckDetailTables details={details} />)
    await expand(/磁盘分区明细/)
    expect(screen.getByText('/snap/core/16928')).toBeInTheDocument()
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

describe('升级既有明细字段（名称、描述、SN、温度）', () => {
  it('光模块表渲染端口名、SN 与温度，且端口错包表与 PoE 表展示描述/端口名', async () => {
    const optical: OpticalPowerDetails = {
      kind: 'optical_power',
      total: 1,
      evaluated: 1,
      over_warning: 0,
      over_critical: 0,
      warning_threshold: -25,
      critical_threshold: -30,
      modules: [
        {
          index: '101',
          name: 'XGigabitEthernet0/0/1',
          vendor_sn: 'SN2026001',
          verdict: 'pass',
          rx_power: -3.2,
          rx_power_unit: 'dBm',
          temperature: 42.5,
          temperature_unit: '°C',
        },
      ],
      skipped: [],
    }
    const { rerender } = render(<CheckDetailTables details={optical} />)
    await expand(/光模块明细/)
    expect(screen.getByText('XGigabitEthernet0/0/1')).toBeInTheDocument()
    expect(screen.getByText('SN2026001')).toBeInTheDocument()
    expect(screen.getByText('42.5°C')).toBeInTheDocument()

    const comp: ComponentStatusDetails = {
      kind: 'component_status',
      component_kind: 'board',
      label: '单板',
      total: 1,
      normal: 1,
      abnormal: 0,
      unknown: 0,
      normal_states: [1],
      abnormal_states: [2],
      components: [
        { index: 'slot-1', name: 'MPU-Board-0', kind: 'board', verdict: 'pass', state: 1, status_label: '正常在位' },
      ],
    }
    rerender(<CheckDetailTables details={comp} />)
    await expand(/单板明细/)
    expect(screen.getByText('MPU-Board-0')).toBeInTheDocument()
    expect(screen.getByText('正常在位')).toBeInTheDocument()

    const poe: PoEDetails = {
      kind: 'poe',
      remaining_power: 120,
      remaining_unit: 'W',
      ports: [{ index: '1.3', name: 'GE0/0/3', consuming_power: 15.4, peak_power: 18.0, unit: 'W' }],
    }
    rerender(<CheckDetailTables details={poe} />)
    await expand(/PoE 供电明细/)
    expect(screen.getByText('GE0/0/3')).toBeInTheDocument()

    const ratio: InterfaceRatioDetails = {
      kind: 'interface_errors',
      total: 1,
      evaluated: 1,
      over_warning: 0,
      over_critical: 0,
      warning_threshold: 0.01,
      critical_threshold: 0.1,
      interfaces: [{ name: 'GE0/0/1', alias: 'Core-Uplink', direction: '入', percent: 0, count: 0, packets: 1000 }],
      skipped: [],
    }
    rerender(<CheckDetailTables details={ratio} />)
    await expand(/接口错包率明细/)
    expect(screen.getByText('Core-Uplink')).toBeInTheDocument()
  })
})

describe('交换机专项明细表（堆叠、接口状态/双工、Flash）', () => {
  it('堆叠状态明细默认折叠，展开后展示成员角色、MAC、优先级与堆叠端口', async () => {
    const stack: StackStatusDetails = {
      kind: 'stack_status',
      enabled: true,
      standalone: false,
      topology: '环形拓扑',
      member_count: 2,
      port_up_count: 2,
      port_down_count: 0,
      members: [
        { id: '1', role: 'Master', priority: 200, mac: '00:11:22:33:44:55', verdict: 'pass' },
        { id: '2', role: 'Standby', priority: 150, mac: '00:11:22:33:44:66', verdict: 'pass' },
      ],
      ports: [{ name: 'stack-port 1/1', status: 'UP', verdict: 'pass' }],
    }

    render(<CheckDetailTables details={stack} />)
    expect(screen.queryByText('00:11:22:33:44:55')).not.toBeInTheDocument()

    await expand(/堆叠状态明细/)
    expect(screen.getAllByText(/环形拓扑/).length).toBeGreaterThan(0)
    expect(screen.getByText('Master')).toBeInTheDocument()
    expect(screen.getByText('00:11:22:33:44:55')).toBeInTheDocument()
    expect(screen.getByText('stack-port 1/1')).toBeInTheDocument()
  })

  it('接口状态一致性与双工模式明细分别按 sub_kind 渲染字段', async () => {
    const adminDetail: InterfaceStatusDetails = {
      kind: 'interface_status_detail',
      sub_kind: 'admin_status',
      total_evaluated: 24,
      abnormal_count: 1,
      admin_down_count: 3,
      idle_count: 5,
      entries: [
        {
          name: 'GE0/0/10',
          alias: 'Access-AP',
          speed_mbps: 1000,
          status_label: 'down',
          verdict: 'fail',
          reason: '曾承载流量现已中断',
        },
      ],
    }

    const { unmount } = render(<CheckDetailTables details={adminDetail} />)
    expect(screen.queryByText('Access-AP')).not.toBeInTheDocument()

    await expand(/接口状态一致性明细/)
    expect(screen.getByText('GE0/0/10')).toBeInTheDocument()
    expect(screen.getByText('Access-AP')).toBeInTheDocument()
    expect(screen.getByText('1000 Mbps')).toBeInTheDocument()
    expect(screen.getByText('曾承载流量现已中断')).toBeInTheDocument()
    unmount()

    const duplexDetail: InterfaceStatusDetails = {
      kind: 'interface_status_detail',
      sub_kind: 'duplex',
      total_evaluated: 12,
      abnormal_count: 1,
      entries: [
        {
          name: 'GE0/0/12',
          speed_mbps: 1000,
          status_label: 'up',
          duplex_label: 'half-duplex',
          verdict: 'fail',
          reason: '千兆端口协商为半双工',
        },
      ],
    }
    render(<CheckDetailTables details={duplexDetail} />)
    await expand(/接口双工模式明细/)
    expect(screen.getByText('GE0/0/12')).toBeInTheDocument()
    expect(screen.getByText('half-duplex')).toBeInTheDocument()
    expect(screen.getByText('千兆端口协商为半双工')).toBeInTheDocument()
  })

  it('Flash 存储明细默认折叠，展开后展示分区使用率、已用、剩余与总容量', async () => {
    const flash: FlashUsageDetails = {
      kind: 'flash_usage',
      total: 2,
      evaluated: 1,
      over_warning: 1,
      over_critical: 0,
      warning_threshold: 80,
      critical_threshold: 90,
      partitions: [
        {
          name: 'flash:/',
          total_bytes: 1073741824,
          used_bytes: 912680550,
          free_bytes: 161061274,
          percent: 85,
          verdict: 'warning',
        },
      ],
      skipped: [{ name: 'ramfs:/', reason: '内存临时文件系统' }],
    }

    render(<CheckDetailTables details={flash} />)
    expect(screen.queryByText('flash:/')).not.toBeInTheDocument()

    await expand(/Flash 存储明细/)
    expect(screen.getByText('flash:/')).toBeInTheDocument()
    expect(screen.getByText('85.0%')).toBeInTheDocument()
    expect(screen.getByText('1.0 GB')).toBeInTheDocument()
    expect(screen.getByText('ramfs:/')).toBeInTheDocument()
  })
})
