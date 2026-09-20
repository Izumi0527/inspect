import { abbreviatePort } from '@/features/dashboard/utils/topologyPorts'

describe('abbreviatePort', () => {
  it('把华为 / 思科常见接口全称缩成画布上放得下的短名', () => {
    expect(abbreviatePort('GigabitEthernet0/0/49')).toBe('GE0/0/49')
    expect(abbreviatePort('XGigabitEthernet0/0/1')).toBe('XGE0/0/1')
    expect(abbreviatePort('TenGigabitEthernet1/0/1')).toBe('TE1/0/1')
    expect(abbreviatePort('FortyGigE1/0/1')).toBe('40GE1/0/1')
    expect(abbreviatePort('HundredGigE1/0/1')).toBe('100GE1/0/1')
    expect(abbreviatePort('FastEthernet0/1')).toBe('FE0/1')
    expect(abbreviatePort('Ethernet0/0/1')).toBe('Eth0/0/1')
  })

  it('已是短名或未知格式的原样返回，前后空白去掉', () => {
    expect(abbreviatePort('10GE1/0/1')).toBe('10GE1/0/1')
    expect(abbreviatePort('Eth-Trunk1')).toBe('Eth-Trunk1')
    expect(abbreviatePort(' port 12 ')).toBe('port 12')
    expect(abbreviatePort('')).toBe('')
  })

  it('大小写不敏感', () => {
    expect(abbreviatePort('gigabitethernet0/0/1')).toBe('GE0/0/1')
  })
})
