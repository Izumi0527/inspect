import {
  MAX_EXCLUDE_KEYWORDS,
  matchesAlertExcludeKeywords,
  matchesExcludeKeywords,
  matchesLogExcludeKeywords,
  splitExcludeKeywords,
} from '@/utils/excludeKeywords'

// 切分与匹配规则必须与后端 internal/common/keyword_filter.go 逐条一致：
// 分隔符 , ， ; ；，去空白，按小写去重保留首次原样，上限 20；匹配为大小写不敏感子串。

describe('splitExcludeKeywords', () => {
  it('支持中英文逗号与分号混合切分、去空与按小写去重', () => {
    expect(splitExcludeKeywords(' NTP , lldp，GigabitEthernet; ntp ； LLDP ; ; ')).toEqual([
      'NTP',
      'lldp',
      'GigabitEthernet',
    ])
  })

  it('空白字符串返回空数组', () => {
    expect(splitExcludeKeywords('   ')).toEqual([])
  })

  it('只有分隔符时返回空数组', () => {
    expect(splitExcludeKeywords('，，；')).toEqual([])
  })

  it('超过 20 个时截断并保留前 20 个', () => {
    const raw = Array.from({ length: 30 }, (_, i) => `kw_${i}`).join(',')
    const result = splitExcludeKeywords(raw)

    expect(MAX_EXCLUDE_KEYWORDS).toBe(20)
    expect(result).toHaveLength(20)
    expect(result[0]).toBe('kw_0')
    expect(result[19]).toBe('kw_19')
  })
})

describe('matchesExcludeKeywords', () => {
  it('大小写不敏感子串命中，并跳过 null 字段', () => {
    expect(matchesExcludeKeywords(['[WARNING] core - NTP sync lost', null, 42], ['ntp'])).toBe(true)
  })

  it('数字字段按字符串参与匹配', () => {
    expect(matchesExcludeKeywords([null, undefined, 42], ['4'])).toBe(true)
  })

  it('关键字列表为空时恒为不命中', () => {
    expect(matchesExcludeKeywords(['anything'], [])).toBe(false)
  })

  it('所有关键字都不是子串时不命中', () => {
    expect(matchesExcludeKeywords(['CPU high'], ['ntp', 'lldp'])).toBe(false)
  })
})

describe('matchesAlertExcludeKeywords & matchesLogExcludeKeywords（人话翻译层联动）', () => {
  it('当设备原始告警为英文 Power/Dying gasp 时，配置中文屏蔽词“电源”应命中翻译结果并屏蔽', () => {
    const powerAlert = {
      title: '[CRITICAL] test - SNMP Trap 硬件告警 (1.3.6.1.4.1.2011.5.25.129.2.1.19)',
      description: 'Dying gasp is detected. (EntityPhysicalIndex=603979809)',
      device: 'test',
      severity: 'critical',
      category: 'hardware',
    }
    expect(matchesAlertExcludeKeywords(powerAlert, ['电源'])).toBe(true)
    expect(matchesAlertExcludeKeywords(powerAlert, ['风扇'])).toBe(false)
  })

  it('当设备原始日志为英文 Power supply 恢复时，配置中文屏蔽词“电源”应命中日志翻译结果并屏蔽', () => {
    const powerLog = {
      message: 'Power 1 has resumed. (EntityPhysicalIndex=603979809, BaseTrapSeverity=1)',
      device_name: 'test',
      level: 'info',
      facility: 'system',
    }
    expect(matchesLogExcludeKeywords(powerLog, ['电源'])).toBe(true)
    expect(matchesLogExcludeKeywords(powerLog, ['温度'])).toBe(false)
  })

  it('不再匹配人话翻译 suggestion 字段，避免恢复类或接口类事件被 suggestion 中的排查词误杀', () => {
    const recoverLog = {
      message: 'ERRDOWN/4/ERRDOWN_DOWNRECOVER: The interface GE0/0/1 leaves the error-down state',
      device_name: 'sw1',
      level: 'info',
      facility: 'interface',
    }
    expect(matchesLogExcludeKeywords(recoverLog, ['错包'])).toBe(false)

    const recoverAlert = {
      title: '端口恢复',
      description: 'ERRDOWN/4/ERRDOWN_DOWNRECOVER: The interface GE0/0/1 leaves the error-down state',
      device: 'sw1',
      severity: 'info',
      category: 'connectivity',
    }
    expect(matchesAlertExcludeKeywords(recoverAlert, ['错包'])).toBe(false)
  })
})
