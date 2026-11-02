import {
  MAX_EXCLUDE_KEYWORDS,
  matchesExcludeKeywords,
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
