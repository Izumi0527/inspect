// 接口全称 → 画布上放得下的短名。按前缀最长优先匹配，大小写不敏感；未命中原样返回。
const PORT_PREFIXES: Array<[pattern: RegExp, short: string]> = [
  [/^HundredGigE/i, '100GE'],
  [/^FortyGigE/i, '40GE'],
  [/^TwentyFiveGigE/i, '25GE'],
  [/^TenGigabitEthernet/i, 'TE'],
  [/^XGigabitEthernet/i, 'XGE'],
  [/^GigabitEthernet/i, 'GE'],
  [/^FastEthernet/i, 'FE'],
  [/^Ethernet/i, 'Eth'],
]

export const abbreviatePort = (port: string): string => {
  const trimmed = port.trim()
  for (const [pattern, short] of PORT_PREFIXES) {
    if (pattern.test(trimmed)) {
      return trimmed.replace(pattern, short)
    }
  }
  return trimmed
}
