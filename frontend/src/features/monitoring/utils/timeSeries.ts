import { MONITORING_SAMPLE_INTERVAL_MINUTES, resolveTickStepMinutes } from './monitoring'

/**
 * 时间轴图表共用的缺口与刻度规则（流量图、系统性能趋势图）。
 *
 * 相邻两点相隔超过两个采样周期即视为数据中断（设备离线、采集停摆），曲线在此断开，
 * 不把缺口补成「一直有数据」。与后端速率窗口 RateSampleMaxGap（2 × 采集节奏）同一口径：
 * 只缺一个点（如后端重启漏掉一轮）仍连成一段。
 */
export const TIME_SERIES_GAP_THRESHOLD_MS = 2 * MONITORING_SAMPLE_INTERVAL_MINUTES * 60_000

const UNIT_MS: Readonly<Record<string, number>> = {
  h: 3_600_000,
  d: 86_400_000,
  w: 7 * 86_400_000,
}

/** 时间档位（1h / 3d / 1w）换算为毫秒；无法解析返回 null */
export function resolveTimeRangeMs(timeRange: string | undefined): number | null {
  const match = /^(\d+)([hdw])$/.exec(String(timeRange ?? '').trim().toLowerCase())
  if (!match) return null
  const value = Number.parseInt(match[1], 10)
  if (!Number.isFinite(value) || value <= 0) return null
  return value * UNIT_MS[match[2]]
}

/**
 * 横轴范围 = 所选时间窗口 [终点 - 档位, 终点]，缺口在窗口开头或末尾时也看得见。
 * 终点取「当前时间」与「最新数据点」的较晚者：服务器时钟快于浏览器时，最新点不会画出右边界。
 * 档位无法解析时退回按数据首尾。
 */
export function resolveTimeWindow(
  timeRange: string | undefined,
  nowMs: number,
  dates: ReadonlyArray<Date>
): [Date, Date] {
  const times = dates.map((date) => date.getTime())
  const rangeMs = resolveTimeRangeMs(timeRange)
  if (rangeMs === null) {
    if (times.length === 0) return [new Date(nowMs), new Date(nowMs)]
    return [new Date(Math.min(...times)), new Date(Math.max(...times))]
  }
  const end = Math.max(nowMs, ...times)
  return [new Date(end - rangeMs), new Date(end)]
}

/** 把按时间升序的点列在数据缺口处切成若干连续段 */
export function splitAtGaps<T extends { date: Date }>(points: ReadonlyArray<T>): T[][] {
  const segments: T[][] = []
  for (const point of points) {
    const current = segments[segments.length - 1]
    const previous = current?.[current.length - 1]
    if (previous && point.date.getTime() - previous.date.getTime() <= TIME_SERIES_GAP_THRESHOLD_MS) {
      current.push(point)
    } else {
      segments.push([point])
    }
  }
  return segments
}

/** 在按时间升序的点列中找离 target 最近的下标（十字线吸附）；点列须非空 */
export function nearestPointIndex<T extends { date: Date }>(points: ReadonlyArray<T>, target: Date): number {
  const time = target.getTime()
  let low = 0
  let high = points.length - 1
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (points[mid].date.getTime() < time) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  if (low > 0 && time - points[low - 1].date.getTime() < points[low].date.getTime() - time) {
    return low - 1
  }
  return low
}

/**
 * X 轴刻度：按时间范围取步长（1h→5min，以此类推），对齐到自然边界；
 * 超出宽度可容纳数量时按倍数稀疏，避免标签重叠。
 */
export function buildTimeAxisTicks(
  domain: readonly [Date, Date],
  timeRange: string | undefined,
  innerWidth: number
): Date[] {
  const [minTime, maxTime] = domain
  const stepMinutes = resolveTickStepMinutes(String(timeRange ?? '').trim() || '24h')

  const start = new Date(minTime)
  start.setSeconds(0, 0)
  if (stepMinutes >= 24 * 60) {
    start.setHours(0, 0, 0, 0)
  } else if (stepMinutes >= 60) {
    start.setMinutes(0)
  } else {
    start.setMinutes(Math.floor(start.getMinutes() / stepMinutes) * stepMinutes)
  }

  const ticks: Date[] = []
  const current = new Date(start)
  while (current.getTime() <= maxTime.getTime()) {
    if (current.getTime() >= minTime.getTime()) {
      ticks.push(new Date(current))
    }
    current.setMinutes(current.getMinutes() + stepMinutes)
  }

  const maxTicks = Math.max(Math.floor(innerWidth / 80), 4)
  if (ticks.length > maxTicks) {
    const step = Math.ceil(ticks.length / maxTicks)
    return ticks.filter((_, index) => index % step === 0)
  }
  return ticks
}
