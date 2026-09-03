/**
 * 人话翻译引擎单元测试
 *
 * 样本取自华为 VRP 与思科 IOS 的真实 Syslog 格式，
 * 重点覆盖三类风险：规则优先级、单词边界误匹配、兜底路径。
 */

import {
  humanizeAlertCategory,
  humanizeInterfaceName,
  translateToPlainLanguage,
} from '@/lib/plain-language'

describe('translateToPlainLanguage 接口类', () => {
  it('华为 VRP 接口 DOWN 应命中 interface-down 并说明影响', () => {
    const result = translateToPlainLanguage({
      message: '%%01IFNET/4/IF_STATE(l)[0]:Interface GigabitEthernet0/0/1 has turned into DOWN state.',
      level: 'warning',
      facility: 'interface',
      deviceName: '核心交换机',
    })

    expect(result.matched).toBe(true)
    expect(result.ruleId).toBe('interface-down')
    expect(result.title).toBe('接口链路 Down')
    expect(result.summary).toContain('核心交换机')
    // 接口名保留设备侧原始命名，便于与 display interface 输出对照
    expect(result.summary).toContain('GigabitEthernet0/0/1（千兆以太口）')
    expect(result.summary).toContain('失去网络连通性')
    expect(result.suggestion).toBeDefined()
    expect(result.tone).toBe('warning')
  })

  it('思科 IOS %LINK-3-UPDOWN 同样应命中 interface-down', () => {
    const result = translateToPlainLanguage({
      message: '%LINK-3-UPDOWN: Interface GigabitEthernet0/1, changed state to down',
      deviceName: '接入交换机',
    })

    expect(result.ruleId).toBe('interface-down')
    expect(result.summary).toContain('GigabitEthernet0/1（千兆以太口）')
  })

  it('思科 %LINEPROTO 报文含 Interface+down，但必须优先命中更精确的线路规则', () => {
    // 这条报文同时满足 line-protocol-down 与 interface-down；
    // 规则表顺序保证前者先命中，否则用户会得到不准确的解读。
    const result = translateToPlainLanguage({
      message: '%LINEPROTO-5-UPDOWN: Line protocol on Interface GigabitEthernet0/1, changed state to down',
      deviceName: '汇聚交换机',
    })

    expect(result.ruleId).toBe('line-protocol-down')
    expect(result.title).toBe('链路协议 Down')
  })

  it('接口 UP 应为 success 语气，且不被 UPDOWN 中的 DOWN 误判', () => {
    // %LINK-3-UPDOWN 字面含 "DOWN"，靠单词边界 \bdown\b 避免误匹配为断开
    const result = translateToPlainLanguage({
      message: '%LINK-3-UPDOWN: Interface GigabitEthernet0/1, changed state to up',
      deviceName: '接入交换机',
    })

    expect(result.ruleId).toBe('interface-up')
    expect(result.tone).toBe('success')
    expect(result.summary).toContain('恢复')
  })
})

describe('translateToPlainLanguage 安全与硬件类', () => {
  it('SSH 登录失败应给出口令处置建议', () => {
    const result = translateToPlainLanguage({
      message: '%%01SSH/4/SSH_FAIL(l)[2]:Failed to login through SSH.',
      level: 'warning',
      facility: 'security',
      deviceName: '边界路由器',
    })

    expect(result.ruleId).toBe('login-failed')
    expect(result.title).toBe('用户认证失败')
    expect(result.suggestion).toContain('更换口令')
    expect(result.tone).toBe('warning')
  })

  it('温度过高应判为 critical 并给出机房检查建议', () => {
    const result = translateToPlainLanguage({
      message: '%%01TEMP/4/TEMP_ALARM(l)[3]:The temperature exceeded the high threshold.',
      level: 'error',
      deviceName: '核心交换机',
    })

    expect(result.ruleId).toBe('temperature-high')
    expect(result.tone).toBe('critical')
    expect(result.suggestion).toContain('空调')
  })

  it('本系统自产的告警风暴消息也应被翻译', () => {
    const result = translateToPlainLanguage({
      message: '1 分钟内新 Syslog 告警超过限制（60/分钟），已触发限流保护。',
      deviceName: '核心交换机',
    })

    expect(result.ruleId).toBe('alert-storm')
    expect(result.tone).toBe('critical')
  })
})

describe('translateToPlainLanguage 兜底与占位', () => {
  it('无法识别的消息应走兜底：matched=false、不给建议、坦白说明', () => {
    const result = translateToPlainLanguage({
      message: '%%01XXX/6/UNKNOWN_EVENT(l)[9]:Custom vendor event 12345.',
      level: 'info',
      facility: 'interface',
      deviceName: '测试设备',
    })

    expect(result.matched).toBe(false)
    expect(result.ruleId).toBeUndefined()
    // 兜底不编造解释，也不给无依据的建议
    expect(result.suggestion).toBeUndefined()
    expect(result.summary).toContain('暂无匹配的解析规则')
    // 仍应带上领域信息，让用户至少知道是哪方面的事
    expect(result.summary).toContain('网络接口')
  })

  it('兜底时应按 level 区分标题措辞', () => {
    const abnormal = translateToPlainLanguage({
      message: '%%01XXX/4/UNKNOWN(l)[9]:Vendor specific payload.',
      level: 'warning',
      facility: 'system',
    })
    const normal = translateToPlainLanguage({
      message: '%%01XXX/6/UNKNOWN(l)[9]:Vendor specific payload.',
      level: 'info',
      facility: 'system',
    })

    expect(abnormal.title).toBe('系统运行异常')
    expect(normal.title).toBe('系统运行事件')
  })

  it('华为日志带已收录模块头时，兜底应指明模块与事件名', () => {
    // 规则表未覆盖 VFS 文件删除事件，但 %%01VFS 头是可识别的结构化信息：
    // 兜底必须比笼统的「设备上报一条信息」更有操作价值
    const result = translateToPlainLanguage({
      message: '%%01VFS/6/VFS_FILE_DELETE(l)[3]:Delete file flash:/backup.cfg successfully.',
      level: 'info',
      facility: 'system',
      deviceName: '核心交换机',
    })

    expect(result.matched).toBe(false)
    expect(result.title).toBe('文件系统（VFS）')
    expect(result.summary).toContain('文件系统')
    expect(result.summary).toContain('VFS_FILE_DELETE')
    // 级别数字 6 应译为「信息」级别词
    expect(result.summary).toContain('信息')
    expect(result.summary).toContain('核心交换机')
  })

  it('华为日志模块未收录时仍走通用兜底，不强行翻译模块名', () => {
    const result = translateToPlainLanguage({
      message: '%%01XYZMOD/4/SOME_EVENT(l):Vendor specific payload.',
      level: 'warning',
      facility: 'system',
    })

    expect(result.matched).toBe(false)
    expect(result.title).toBe('系统运行异常')
  })

  it('deviceName 缺省时应回退为「该设备」而不是留空', () => {
    const result = translateToPlainLanguage({
      message: '%%01IFNET/4/IF_STATE(l)[0]:Interface GigabitEthernet0/0/1 has turned into DOWN state.',
    })

    expect(result.summary).toContain('该设备')
    expect(result.summary).not.toContain('undefined')
    expect(result.summary).not.toContain('{device}')
  })

  it('空消息不应抛错', () => {
    const result = translateToPlainLanguage({ message: '   ' })

    expect(result.matched).toBe(false)
    expect(result.title).toBe('空消息')
  })

  it('重复调用同一规则应稳定命中（防正则 lastIndex 残留）', () => {
    const input = {
      message: '%%01IFNET/4/IF_STATE(l)[0]:Interface GigabitEthernet0/0/1 has turned into DOWN state.',
      deviceName: '核心交换机',
    }

    const first = translateToPlainLanguage(input)
    const second = translateToPlainLanguage(input)

    expect(first).toEqual(second)
    expect(second.ruleId).toBe('interface-down')
  })
})

describe('humanizeInterfaceName', () => {
  it.each([
    ['GigabitEthernet0/0/1', 'GigabitEthernet0/0/1（千兆以太口）'],
    ['TenGigabitEthernet1/0/2', 'TenGigabitEthernet1/0/2（万兆以太口）'],
    ['Eth-Trunk1', 'Eth-Trunk1（链路聚合口）'],
    ['Vlanif10', 'Vlanif10（VLAN 虚接口）'],
    ['Loopback0', 'Loopback0（环回口）'],
  ])('%s 应注解为 %s', (raw, expected) => {
    expect(humanizeInterfaceName(raw)).toBe(expected)
  })

  it('必须保留设备侧原始接口名，便于与 display interface 输出对照', () => {
    const result = humanizeInterfaceName('GigabitEthernet0/0/1')
    expect(result.startsWith('GigabitEthernet0/0/1')).toBe(true)
  })

  it('万兆口不应被千兆规则抢先匹配', () => {
    // TenGigabitEthernet 字面包含 GigabitEthernet，靠规则顺序保证正确
    expect(humanizeInterfaceName('TenGigabitEthernet0/0/1')).toContain('万兆以太口')
    expect(humanizeInterfaceName('TenGigabitEthernet0/0/1')).not.toContain('（千兆')
  })

  it('无法识别的接口命名应原样保留，不强行注解', () => {
    expect(humanizeInterfaceName('Xyz9/9')).toBe('Xyz9/9')
  })
})

describe('humanizeAlertCategory', () => {
  it('应把后端英文分类转成中文', () => {
    expect(humanizeAlertCategory('connectivity')).toBe('网络连通性')
    expect(humanizeAlertCategory('hardware')).toBe('硬件')
  })

  it('空值应回退为「未分类」，未知值原样透传', () => {
    expect(humanizeAlertCategory(undefined)).toBe('未分类')
    expect(humanizeAlertCategory('vendor-custom')).toBe('vendor-custom')
  })
})
