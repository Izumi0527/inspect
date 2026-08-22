/**
 * 检查项结构化明细的解析契约。
 *
 * 后端 inspection_results.details 用顶层 kind 区分五种载荷。前端与 PDF 是两条
 * 互相独立的消费链路（前端走 camelCase 的 buildCheckResultResponse，PDF 走直接
 * 查库的 snake_case 路径），改一处不会惠及另一处，因此两边各锁一份契约。
 *
 * 解析的底线：形状不符时返回 undefined 让 UI 退回纯文本，而不是崩在渲染层。
 * details 列历史上存过手工写入的自由文本。
 */

import { fetchExecutionDetail } from '@/features/inspection/api/inspection.api'
import type {
  BGPPeersDetails,
  ComponentStatusDetails,
  InterfaceRatioDetails,
  OpticalPowerDetails,
} from '@/features/inspection/types'

jest.mock('@/lib/api-client', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
  TokenManager: {
    getAccessToken: jest.fn(),
  },
  getApiOrigin: jest.fn(() => 'http://localhost:3000'),
}))

/** 把一份 details 载荷送进执行详情链路，取回解析后的结果。 */
const parseDetails = async (details: unknown) => {
  const { api } = jest.requireMock('@/lib/api-client') as { api: { get: jest.Mock } }
  api.get.mockResolvedValue({
    data: {
      id: 1,
      strategy_id: 1,
      status: 'completed',
      summary: {
        device_results: [
          {
            device_id: '6',
            device_name: '核心交换机-01',
            check_results: [
              { check_item_name: '被测检查项', status: 'fail', details },
            ],
          },
        ],
      },
    },
  })

  const execution = await fetchExecutionDetail('1')
  return execution.summary.deviceResults[0].checkResults[0].details
}

beforeEach(() => {
  const { api } = jest.requireMock('@/lib/api-client') as { api: { get: jest.Mock } }
  api.get.mockReset()
})

describe('检查项明细解析', () => {
  it('应解析接口错包率明细并保留原始计数', async () => {
    const details = await parseDetails({
      kind: 'interface_errors',
      total: 3,
      evaluated: 2,
      over_warning: 1,
      over_critical: 1,
      warning_threshold: 0.01,
      critical_threshold: 0.1,
      interfaces: [
        { name: 'GigabitEthernet0/0/1', direction: '入', percent: 1.2, count: 1200, packets: 98800 },
      ],
      skipped: [{ name: 'NULL0', reason: '设备未上报该计数器' }],
    })

    expect(details?.kind).toBe('interface_errors')
    const ratio = details as InterfaceRatioDetails
    expect(ratio.interfaces).toHaveLength(1)
    // 原始计数必须保留：累计比率会被历史一次性故障长期拉高，
    // 只看 1.2% 无法区分持续劣化与三年前抖过一次
    expect(ratio.interfaces[0].count).toBe(1200)
    expect(ratio.interfaces[0].packets).toBe(98800)
    expect(ratio.skipped).toHaveLength(1)
  })

  it('应把丢弃率视为与错包率同构的载荷', async () => {
    const details = await parseDetails({
      kind: 'interface_discards',
      total: 1,
      evaluated: 1,
      interfaces: [{ name: 'Eth0/0/1', direction: '出', percent: 0.5, count: 50, packets: 9950 }],
      skipped: [],
    })

    expect(details?.kind).toBe('interface_discards')
    expect((details as InterfaceRatioDetails).interfaces).toHaveLength(1)
  })

  it('应解析光模块明细，未上报的诊断量保持 undefined', async () => {
    const details = await parseDetails({
      kind: 'optical_power',
      total: 2,
      evaluated: 1,
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
    })

    expect(details?.kind).toBe('optical_power')
    const optical = details as OpticalPowerDetails
    expect(optical.modules[0].rx_power).toBe(-26.4)
    expect(optical.modules[0].verdict).toBe('warning')
    // 缺失与 0 必须可区分：「未上报电压」和「电压 0V」是两个不同结论
    expect(optical.modules[0].voltage).toBeUndefined()
    expect(optical.modules[0].bias_current).toBeUndefined()
  })

  it('应解析 BGP 邻居明细并带上震荡判定线', async () => {
    const details = await parseDetails({
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
    })

    expect(details?.kind).toBe('bgp_peers')
    const bgp = details as BGPPeersDetails
    expect(bgp.flapping_threshold_seconds).toBe(3600)
    expect(bgp.peers[0].last_error).toBe('hold timer expired')
    expect(bgp.peers[1].established_seconds).toBe(120)
  })

  it('应解析部件状态明细并回显判定依据', async () => {
    const details = await parseDetails({
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
      ],
    })

    expect(details?.kind).toBe('component_status')
    const component = details as ComponentStatusDetails
    // 状态码语义因厂商而异，只给「码 77，未知」运维无从下手，
    // 必须连同本次生效的判定集合一起给出
    expect(component.normal_states).toEqual([1])
    expect(component.abnormal_states).toEqual([2])
    expect(component.components[1].state).toBe(77)
    expect(component.components[1].verdict).toBe('skip')
  })

  it('应继续解析既有的接口利用率明细', async () => {
    const details = await parseDetails({
      kind: 'interface_utilization',
      total: 2,
      evaluated: 2,
      over_warning: 0,
      over_critical: 0,
      warning_threshold: 70,
      critical_threshold: 90,
      interfaces: [
        { name: 'Eth0/0/1', direction: '入', percent: 12.5, speed_mbps: 1000, is_up: true },
      ],
      skipped: [],
    })

    expect(details?.kind).toBe('interface_utilization')
  })
})

describe('检查项明细解析的容错', () => {
  it.each([
    ['未知 kind', { kind: 'unsupported_kind', rows: [] }],
    ['纯阈值载荷', { kind: 'threshold', threshold: { warning: 1, critical: 2 } }],
    ['缺 kind', { total: 3 }],
    ['自由文本', '检查通过'],
    ['数组', [1, 2, 3]],
    ['null', null],
    ['undefined', undefined],
  ])('%s 应返回 undefined 让 UI 退回纯文本', async (_label, payload) => {
    expect(await parseDetails(payload)).toBeUndefined()
  })

  it('行数组形状不符时应退化为空数组而非抛错', async () => {
    const details = await parseDetails({
      kind: 'optical_power',
      total: 1,
      evaluated: 1,
      modules: '这里本该是数组',
      skipped: null,
    })

    expect(details?.kind).toBe('optical_power')
    expect((details as OpticalPowerDetails).modules).toEqual([])
    expect((details as OpticalPowerDetails).skipped).toEqual([])
  })
})
