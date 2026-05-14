/**
 * 通用格式化工具函数
 */

/**
 * 格式化字节大小
 * @param bytes 字节数
 * @param decimals 保留小数位数，默认2位
 * @returns 格式化后的字符串，如 "1.23 MB"
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

/**
 * 格式化日期
 * @param date 日期对象、时间戳或日期字符串
 * @param format 格式类型，默认 'datetime'
 * @returns 格式化后的日期字符串
 */
export function formatDate(
  date: Date | string | number,
  format: 'date' | 'time' | 'datetime' | 'relative' = 'datetime'
): string {
  const dateObj = new Date(date)

  if (isNaN(dateObj.getTime())) {
    return '无效日期'
  }

  const now = new Date()
  const diff = now.getTime() - dateObj.getTime()

  switch (format) {
    case 'date':
      return dateObj.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })

    case 'time':
      return dateObj.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })

    case 'datetime':
      return dateObj.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })

    case 'relative':
      const seconds = Math.floor(diff / 1000)
      const minutes = Math.floor(seconds / 60)
      const hours = Math.floor(minutes / 60)
      const days = Math.floor(hours / 24)

      if (days > 0) return `${days}天前`
      if (hours > 0) return `${hours}小时前`
      if (minutes > 0) return `${minutes}分钟前`
      if (seconds > 0) return `${seconds}秒前`
      return '刚刚'

    default:
      return dateObj.toLocaleString('zh-CN')
  }
}

/**
 * 格式化数字
 * @param num 数字
 * @param options 格式化选项
 * @returns 格式化后的数字字符串
 */
export function formatNumber(
  num: number,
  options: {
    decimals?: number
    thousands?: boolean
    prefix?: string
    suffix?: string
  } = {}
): string {
  const { decimals = 0, thousands = true, prefix = '', suffix = '' } = options

  let result = num.toFixed(decimals)

  if (thousands) {
    result = result.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }

  return `${prefix}${result}${suffix}`
}

/**
 * 格式化百分比
 * @param value 数值 (0-1 或 0-100)
 * @param decimals 保留小数位数
 * @param isDecimal 输入值是否为小数形式 (0-1)
 * @returns 格式化后的百分比字符串
 */
export function formatPercentage(
  value: number,
  decimals: number = 1,
  isDecimal: boolean = true
): string {
  const percentage = isDecimal ? value * 100 : value
  return `${percentage.toFixed(decimals)}%`
}

/**
 * 格式化货币
 * @param amount 金额
 * @param currency 货币符号，默认 '¥'
 * @param decimals 保留小数位数，默认2位
 * @returns 格式化后的货币字符串
 */
export function formatCurrency(
  amount: number,
  currency: string = '¥',
  decimals: number = 2
): string {
  return `${currency}${formatNumber(amount, { decimals, thousands: true })}`
}

/**
 * 格式化网络速度
 * @param bytesPerSecond 每秒字节数
 * @returns 格式化后的网络速度字符串
 */
export function formatNetworkSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`
}

/**
 * 格式化延迟时间
 * @param milliseconds 毫秒数
 * @returns 格式化后的延迟时间字符串
 */
export function formatLatency(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${milliseconds.toFixed(0)}ms`
  }
  return `${(milliseconds / 1000).toFixed(2)}s`
}

/**
 * 格式化设备状态
 * @param status 状态值
 * @returns 格式化后的状态字符串
 */
export function formatDeviceStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'online': '在线',
    'offline': '离线',
    'warning': '警告',
    'error': '错误',
    'maintenance': '维护中',
    'unknown': '未知'
  }

  return statusMap[status.toLowerCase()] || status
}

/**
 * 将 bps 值格式化为人类可读的字符串
 * 根据数值大小自动选择合适的单位（bps, Kbps, Mbps, Gbps）
 * @param bps - 比特每秒的数值
 * @returns 格式化后的字符串，如 "1.5 Mbps"
 * @example
 * formatBandwidth(500) // "500.0 bps"
 * formatBandwidth(1500) // "1.5 Kbps"
 * formatBandwidth(1500000) // "1.5 Mbps"
 * formatBandwidth(1500000000) // "1.5 Gbps"
 */
export function formatBandwidth(bps: number | string | null | undefined): string {
  // 处理字符串输入
  if (typeof bps === 'string') {
    // 如果是 "N/A" 或空字符串，直接返回
    if (bps === 'N/A' || bps === 'n/a' || bps === '' || bps.trim() === '') {
      return 'N/A'
    }
    bps = parseFloat(bps)
  }

  // 处理 null/undefined
  if (bps === null || bps === undefined) {
    return 'N/A'
  }

  // 处理无效输入
  if (!isFinite(bps) || isNaN(bps)) {
    return 'N/A'
  }

  // 处理负数
  if (bps < 0) {
    return '0.0 bps'
  }

  // 根据数值大小选择合适的单位
  if (bps < 1000) {
    return `${bps.toFixed(1)} bps`
  } else if (bps < 1_000_000) {
    const val = bps / 1000
    return `${val < 10 ? val.toFixed(2) : val.toFixed(1)} Kbps`
  } else if (bps < 1_000_000_000) {
    const val = bps / 1_000_000
    return `${val < 10 ? val.toFixed(2) : val.toFixed(1)} Mbps`
  } else {
    const val = bps / 1_000_000_000
    return `${val < 10 ? val.toFixed(2) : val.toFixed(1)} Gbps`
  }
}

const pad2 = (value: number) => String(value).padStart(2, '0')

const normalizeDateValue = (value: Date | string | number): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  if (typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null

    // 针对 YYYY-MM-DD 这种“日期字符串”，避免 new Date(...) 的时区偏移问题
    const ymdMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
    if (ymdMatch) {
      const year = Number(ymdMatch[1])
      const month = Number(ymdMatch[2])
      const day = Number(ymdMatch[3])
      const date = new Date(year, month - 1, day)
      if (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
      ) {
        return date
      }
      return null
    }

    const date = new Date(trimmed)
    return Number.isNaN(date.getTime()) ? null : date
  }

  return null
}

/**
 * 将日期格式化为 YYYY-MM-DD
 */
export function formatDateYMD(value: Date | string | number): string {
  const date = normalizeDateValue(value)
  if (!date) return '无效日期'
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/**
 * 将日期格式化为 YYYY-MM-DD HH:mm:ss
 */
export function formatDateTimeYMDHMS(value: Date | string | number): string {
  const date = normalizeDateValue(value)
  if (!date) return '无效日期'
  return `${formatDateYMD(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

/**
 * 将日期格式化为 YYYY-MM-DD HH:mm
 */
export function formatDateTimeYMDHM(value: Date | string | number): string {
  const date = normalizeDateValue(value)
  if (!date) return '无效日期'
  return `${formatDateYMD(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/**
 * 将日期格式化为 MM-DD HH:mm:ss
 */
export function formatDateTimeMDHMS(value: Date | string | number): string {
  const date = normalizeDateValue(value)
  if (!date) return '无效日期'
  return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

/**
 * 将日期格式化为 MM-DD HH:mm
 */
export function formatDateTimeMDHM(value: Date | string | number): string {
  const date = normalizeDateValue(value)
  if (!date) return '无效日期'
  return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/**
 * 将日期格式化为 HH:mm
 */
export function formatTimeHM(value: Date | string | number): string {
  const date = normalizeDateValue(value)
  if (!date) return '无效日期'
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}
