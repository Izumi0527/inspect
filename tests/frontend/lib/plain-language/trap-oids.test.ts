/**
 * Trap OID 词典与识别逻辑测试
 *
 * 重点覆盖三类风险：
 * 1. 规则优先级 —— OID 词典不得覆盖更易读的正则人话
 * 2. IP 误判 —— 点分数字串必须至少 6 段才算 OID
 * 3. 词典数据完整性 —— 由脚本从产品文档生成，需护栏防止结构损坏
 */

import { TRAP_OID_DICTIONARY, translateToPlainLanguage } from '@/lib/plain-language'

describe('Trap OID 识别', () => {
  it('应从日志 message 的 `SNMP Trap <OID> | ...` 形态中提取并查到词典', () => {
    const result = translateToPlainLanguage({
      message: 'SNMP Trap 1.3.6.1.4.1.2011.5.25.219.2.6.1',
      deviceName: '核心交换机',
    })

    expect(result.trap).toBeDefined()
    expect(result.trap?.oid).toBe('1.3.6.1.4.1.2011.5.25.219.2.6.1')
    expect(result.trap?.name).toBe('hwFanRemove')
    expect(result.trap?.label).toBe('风扇拔出')
  })

  it('message 中无 OID 时应退到告警 title 提取', () => {
    const result = translateToPlainLanguage({
      message: '设备上报了一条告警',
      title: '[WARNING] 核心交换机 - SNMP Trap 接口告警 (1.3.6.1.4.1.2011.5.25.219.2.2.3)',
      deviceName: '核心交换机',
    })

    expect(result.trap?.name).toBe('hwBoardFail')
    expect(result.trap?.label).toBe('单板局部功能失效')
  })

  it('IP 地址不得被误判为 OID', () => {
    const result = translateToPlainLanguage({
      message: 'Device 10.0.0.1 unreachable, gateway 192.168.100.254 down',
      deviceName: '核心交换机',
    })

    expect(result.trap).toBeUndefined()
  })

  it('词典未收录的 OID 应返回 undefined，而不是抛出裸 OID', () => {
    const result = translateToPlainLanguage({
      message: 'SNMP Trap 1.3.6.1.4.1.9999.8888.7777.1.2.3',
      deviceName: '核心交换机',
    })

    expect(result.trap).toBeUndefined()
  })
})

describe('OID 词典与正则规则的分工', () => {
  it('正则命中时：标题采用厂商官方术语，正文仍由规则提供', () => {
    // 官方释义「作为代理的 SNMP 实体已经检测到由于 ifOperStatus……」是长段技术描述，
    // 不含业务影响与处置动作，不能替代规则正文；但其标题措辞比自拟规则更权威。
    const result = translateToPlainLanguage({
      message: 'SNMP Trap 1.3.6.1.6.3.1.1.5.3 | Interface GigabitEthernet0/0/1 has turned into DOWN state',
      deviceName: '核心交换机',
    })

    // 标题来自厂商词典
    expect(result.title).toBe('链路断开')
    // 正文来自正则规则，含接口注解与业务影响
    expect(result.ruleId).toBe('interface-down')
    expect(result.summary).toContain('GigabitEthernet0/0/1（千兆以太口）')
    expect(result.summary).toContain('失去网络连通性')
    // 官方长表述不得泄漏进正文
    expect(result.summary).not.toContain('ifOperStatus')
    // 处置建议同样来自规则
    expect(result.suggestion).toContain('display interface')
    expect(result.trap?.name).toBe('linkDown')
  })

  it('label 为截断版时不得用作标题，应回退到规则标题', () => {
    // 词典中超长释义被截断并以省略号结尾，那种 label 是残句
    const result = translateToPlainLanguage({
      message: '%%01IFNET/4/IF_STATE(l)[0]:Interface GigabitEthernet0/0/1 has turned into DOWN state.',
      deviceName: '核心交换机',
    })

    // 该消息不含 OID，走纯规则路径，标题即规则标题
    expect(result.trap).toBeUndefined()
    expect(result.title).toBe('接口链路 Down')
  })

  it('正则未命中但 OID 有收录时，应改用厂商官方释义且视为已识别', () => {
    const result = translateToPlainLanguage({
      message: 'SNMP Trap 1.3.6.1.4.1.2011.5.25.219.2.2.3',
      deviceName: '核心交换机',
    })

    expect(result.matched).toBe(true)
    expect(result.title).toBe('单板局部功能失效')
    expect(result.summary).toContain('核心交换机')
    expect(result.summary).toContain('hwBoardFail')
    expect(result.ruleId).toBeUndefined()
  })

  it('OID 与正则都未命中时，仍走原有兜底策略', () => {
    const result = translateToPlainLanguage({
      message: '%%01XXX/6/UNKNOWN_EVENT(l)[9]:Custom vendor payload.',
      level: 'info',
      facility: 'system',
      deviceName: '测试设备',
    })

    expect(result.matched).toBe(false)
    expect(result.trap).toBeUndefined()
    expect(result.summary).toContain('暂无匹配的解析规则')
  })
})

describe('Trap 语气推断', () => {
  it('恢复类告警应判为 success，不能因含「失效」二字被标成告警色', () => {
    // hwBoardFailResume 的释义是「单板局部功能失效恢复」，同时含「失效」与「恢复」
    const result = translateToPlainLanguage({
      message: 'SNMP Trap 1.3.6.1.4.1.2011.5.25.219.2.2.4',
      deviceName: '核心交换机',
    })

    expect(result.trap?.name).toBe('hwBoardFailResume')
    expect(result.tone).toBe('success')
  })

  it('风扇拔出应判为 critical', () => {
    const result = translateToPlainLanguage({
      message: 'SNMP Trap 1.3.6.1.4.1.2011.5.25.219.2.6.1',
      deviceName: '核心交换机',
    })

    expect(result.tone).toBe('critical')
  })
})

describe('词典数据完整性', () => {
  const entries = Object.entries(TRAP_OID_DICTIONARY)

  it('应收录足量条目', () => {
    expect(entries.length).toBeGreaterThan(300)
  })

  it('每个键都应是合法 OID（至少 6 段数字）', () => {
    const bad = entries.filter(([oid]) => !/^\d+(\.\d+){5,}$/.test(oid))
    expect(bad).toEqual([])
  })

  it('每条都应有非空的 name 与 label', () => {
    const bad = entries.filter(([, v]) => !v.name?.trim() || !v.label?.trim())
    expect(bad).toEqual([])
  })

  it('label 应足够简短，可直接用作标题', () => {
    // 生成时按 24 字截断并补省略号，留 1 字余量
    const tooLong = entries.filter(([, v]) => v.label.length > 25)
    expect(tooLong).toEqual([])
  })

  it('高频标准 Trap 应有经过人工精修的简洁名称', () => {
    expect(TRAP_OID_DICTIONARY['1.3.6.1.6.3.1.1.5.1'].label).toBe('设备冷启动')
    expect(TRAP_OID_DICTIONARY['1.3.6.1.6.3.1.1.5.3'].label).toBe('链路断开')
    expect(TRAP_OID_DICTIONARY['1.3.6.1.6.3.1.1.5.4'].label).toBe('链路恢复')
    // 精修后完整官方表述仍需保留，供专业人员查证
    expect(TRAP_OID_DICTIONARY['1.3.6.1.6.3.1.1.5.3'].detail).toContain('ifOperStatus')
  })
})
