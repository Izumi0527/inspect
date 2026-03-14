import { useMemo, useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { Group } from '@visx/group'
import { AreaClosed, LinePath } from '@visx/shape'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { GridRows } from '@visx/grid'
import { scaleLinear, scaleTime } from '@visx/scale'
import { curveMonotoneX } from '@visx/curve'
import { localPoint } from '@visx/event'
import { useTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip'
import { LinearGradient } from '@visx/gradient'
import { ChartContainer } from '@/components/atoms/charts'
import type { NetworkTrafficDataPoint } from '../../types'

/**
 * 格式化带宽值（bps），自动选择合适的单位
 */
function formatBandwidthValue(bps: number): string {
  if (bps <= 0) return '0 bps'
  const units = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps']
  const k = 1000
  const i = Math.min(Math.floor(Math.log(bps) / Math.log(k)), units.length - 1)
  const value = bps / Math.pow(k, i)
  if (value >= 100) return `${value.toFixed(0)} ${units[i]}`
  if (value >= 10) return `${value.toFixed(1)} ${units[i]}`
  return `${value.toFixed(2)} ${units[i]}`
}

interface NetworkTrafficStackedAreaChartProps {
  data: NetworkTrafficDataPoint[]
  height?: number
  className?: string
  /** 时间范围（用于 x 轴刻度/tooltip 时间格式优化） */
  timeRange?: string
}

/**
 * 网络流量堆叠面积图
 *
 * 显示入站、出站和总流量的堆叠面积,便于对比总流量和流量分布
 * - 入站流量: 蓝色区域
 * - 出站流量: 绿色区域
 * - 总流量: 入站 + 出站之和（橙色线）
 *
 * Y轴单位: bps（自适应 bps/Kbps/Mbps/Gbps）
 * X轴刻度: 按时间跨度自适应（小时/12小时/天/周），避免 7d/30d 下标签过密
 */
export function NetworkTrafficStackedAreaChart({
  data,
  height = 300,
  className,
  timeRange,
}: NetworkTrafficStackedAreaChartProps) {
  // 容器引用和宽度状态
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)

  // 监听容器宽度变化
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setWidth(containerRef.current.clientWidth)
      }
    }

    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  // 深色模式检测
  const isDark =
    typeof window !== 'undefined' && document.documentElement.classList.contains('dark')
  const gridColor = isDark ? '#374151' : '#e5e7eb'
  const axisColor = isDark ? '#9CA3AF' : '#6b7280'
  const tooltipBg = isDark ? 'rgba(17, 24, 39, 0.95)' : 'rgba(255, 255, 255, 0.95)'
  const tooltipBorder = isDark ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 0.5)'

  const margin = { top: 20, right: 30, bottom: 50, left: 70 }
  const innerWidth = Math.max(width - margin.left - margin.right, 100)
  const innerHeight = height - margin.top - margin.bottom

  const { showTooltip, hideTooltip, tooltipData, tooltipLeft = 0, tooltipTop = 0 } = useTooltip<{
    time: string
    inbound: number
    outbound: number
    total: number
  }>()

  const showDateOnAxis = useMemo(() => {
    const trimmed = String(timeRange ?? '').trim().toLowerCase()
    const match = /^(\d+)([hdw])$/.exec(trimmed)
    if (!match) return false
    const value = Number.parseInt(match[1], 10)
    const unit = match[2]
    if (!Number.isFinite(value) || value <= 0) return false
    return !(unit === 'h' && value <= 24)
  }, [timeRange])

  const formatTimeLabel = useMemo(() => {
    return (date: Date): string => {
      if (Number.isNaN(date.getTime())) return '-'
      if (!showDateOnAxis) {
        return format(date, 'HH:mm')
      }
      return format(date, 'MM-dd HH:mm')
    }
  }, [showDateOnAxis])

  // 数据处理:将后端Mbps转为bps，计算堆叠值
  const processedData = useMemo(() => {
    return data.map((point) => {
      const date = new Date(point.timestamp)
      // 后端返回Mbps，转换为bps以便自适应显示单位
      const inboundBps = point.inbound * 1_000_000
      const outboundBps = point.outbound * 1_000_000
      const totalBps = inboundBps + outboundBps
      return {
        date,
        time: formatTimeLabel(date),
        inbound: inboundBps,
        outbound: outboundBps,
        total: totalBps,
        // 堆叠计算
        inboundBase: 0,
        inboundTop: inboundBps,
        outboundBase: inboundBps,
        outboundTop: totalBps,
      }
    })
  }, [data, formatTimeLabel])

  // Scales
  const xScale = useMemo(
    () =>
      scaleTime({
        domain: [
          new Date(Math.min(...processedData.map((d) => d.date.getTime()))),
          new Date(Math.max(...processedData.map((d) => d.date.getTime()))),
        ],
        range: [0, innerWidth],
      }),
    [processedData, innerWidth]
  )

  const yScale = useMemo(() => {
    const maxTotal = Math.max(...processedData.map((d) => d.total))
    return scaleLinear({
      domain: [0, maxTotal * 1.1],
      range: [innerHeight, 0],
      nice: true,
    })
  }, [processedData, innerHeight])

  // 处理鼠标悬停
  const handleMouseMove = (
    event: React.MouseEvent<SVGRectElement>,
    datum: (typeof processedData)[0]
  ) => {
    const point = localPoint(event)
    if (!point) return

    showTooltip({
      tooltipData: {
        time: datum.time,
        inbound: datum.inbound,
        outbound: datum.outbound,
        total: datum.total,
      },
      tooltipLeft: point.x,
      tooltipTop: point.y,
    })
  }

  if (processedData.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="text-muted-foreground">暂无流量数据</p>
      </div>
    )
  }

  return (
    <ChartContainer className={className}>
      <div ref={containerRef} style={{ position: 'relative', width: '100%', height }}>
        <svg width={width} height={height} style={{ display: 'block' }}>
          <defs>
            {/* 入站流量渐变 - 更鲜艳的蓝色 */}
            <LinearGradient
              id="inbound-gradient"
              from="#0EA5E9"
              to="#0EA5E9"
              fromOpacity={0.7}
              toOpacity={0.15}
            />
            {/* 出站流量渐变 - 更鲜艳的绿色 */}
            <LinearGradient
              id="outbound-gradient"
              from="#22C55E"
              to="#22C55E"
              fromOpacity={0.7}
              toOpacity={0.15}
            />
          </defs>

          <Group left={margin.left} top={margin.top}>
            <GridRows scale={yScale} width={innerWidth} stroke={gridColor} strokeDasharray="3,3" />

            {/* 入站流量面积 */}
            <AreaClosed
              data={processedData}
              x={(d) => xScale(d.date)}
              y0={(d) => yScale(d.inboundBase)}
              y1={(d) => yScale(d.inboundTop)}
              yScale={yScale}
              fill="url(#inbound-gradient)"
              curve={curveMonotoneX}
            />

            {/* 出站流量面积 */}
            <AreaClosed
              data={processedData}
              x={(d) => xScale(d.date)}
              y0={(d) => yScale(d.outboundBase)}
              y1={(d) => yScale(d.outboundTop)}
              yScale={yScale}
              fill="url(#outbound-gradient)"
              curve={curveMonotoneX}
            />

            {/* 入站流量边界线 */}
            <LinePath
              data={processedData}
              x={(d) => xScale(d.date)}
              y={(d) => yScale(d.inboundTop)}
              stroke="#0EA5E9"
              strokeWidth={2.5}
              curve={curveMonotoneX}
            />

            {/* 出站流量边界线 */}
            <LinePath
              data={processedData}
              x={(d) => xScale(d.date)}
              y={(d) => yScale(d.outboundTop)}
              stroke="#22C55E"
              strokeWidth={1.5}
              curve={curveMonotoneX}
            />

            {/* 总流量线（入站+出站之和，虚线覆盖在堆叠顶部） */}
            <LinePath
              data={processedData}
              x={(d) => xScale(d.date)}
              y={(d) => yScale(d.total)}
              stroke="#F97316"
              strokeWidth={2.5}
              strokeDasharray="6,3"
              curve={curveMonotoneX}
            />

            {/* 透明交互区域 */}
            {processedData.map((datum, i) => {
              const x = xScale(datum.date)
              const nextX =
                i < processedData.length - 1
                  ? xScale(processedData[i + 1].date)
                  : innerWidth
              const rectWidth = nextX - x

              return (
                <rect
                  key={i}
                  x={x}
                  y={0}
                  width={rectWidth}
                  height={innerHeight}
                  fill="transparent"
                  onMouseMove={(e) => handleMouseMove(e, datum)}
                  onMouseLeave={hideTooltip}
                />
              )
            })}

            <AxisBottom
              top={innerHeight}
              scale={xScale}
              stroke={axisColor}
              tickStroke={axisColor}
              tickValues={(() => {
                // 根据时间跨度生成刻度，避免 7d/30d 下刻度与标签过密
                if (processedData.length < 2) return undefined
                const [minTime, maxTime] = xScale.domain()
                const ticks: Date[] = []
                const durationMs = maxTime.getTime() - minTime.getTime()

                const stepMinutes = (() => {
                  if (durationMs <= 24 * 60 * 60 * 1000) return 60 // 24h 内：每小时一个刻度
                  if (durationMs <= 48 * 60 * 60 * 1000) return 120
                  if (durationMs <= 7 * 24 * 60 * 60 * 1000) return 12 * 60
                  if (durationMs <= 30 * 24 * 60 * 60 * 1000) return 24 * 60
                  return 7 * 24 * 60
                })()

                const start = new Date(minTime)
                start.setSeconds(0, 0)
                if (stepMinutes >= 60) {
                  start.setMinutes(0)
                }
                if (stepMinutes >= 24 * 60) {
                  start.setHours(0, 0, 0, 0)
                }

                const endTime = maxTime.getTime()
                const current = new Date(start)
                while (current.getTime() <= endTime) {
                  ticks.push(new Date(current))
                  current.setMinutes(current.getMinutes() + stepMinutes)
                }
                // 如果刻度太多（超过innerWidth/60），按倍数稀疏
                const maxTicks = Math.max(Math.floor(innerWidth / 80), 4)
                if (ticks.length > maxTicks) {
                  const step = Math.ceil(ticks.length / maxTicks)
                  return ticks.filter((_, i) => i % step === 0)
                }
                return ticks
              })()}
              tickLabelProps={() => ({
                fill: axisColor,
                fontSize: 12,
                textAnchor: 'middle',
              })}
              tickFormat={(value) => {
                const date = value as Date
                return formatTimeLabel(date)
              }}
            />
            <AxisLeft
              scale={yScale}
              stroke={axisColor}
              tickStroke={axisColor}
              tickLabelProps={() => ({
                fill: axisColor,
                fontSize: 12,
                textAnchor: 'end',
                dx: -4,
              })}
              tickFormat={(value) => formatBandwidthValue(Number(value))}
              numTicks={5}
            />
          </Group>
        </svg>

        {tooltipData && (
          <TooltipWithBounds
            key={Math.random()}
            top={tooltipTop}
            left={tooltipLeft}
            style={{
              ...defaultStyles,
              background: tooltipBg,
              backdropFilter: 'blur(10px)',
              border: `1px solid ${tooltipBorder}`,
              borderRadius: '8px',
              padding: '12px',
              minWidth: '160px',
            }}
          >
            <p className="mb-2 text-sm font-medium text-foreground">
              {tooltipData.time}
            </p>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-sky-500" />
                  <span className="text-muted-foreground">入站:</span>
                </div>
                <span className="font-semibold text-foreground">
                  {formatBandwidthValue(tooltipData.inbound)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <span className="text-muted-foreground">出站:</span>
                </div>
                <span className="font-semibold text-foreground">
                  {formatBandwidthValue(tooltipData.outbound)}
                </span>
              </div>
              <div className="mt-2 border-t border-border pt-2">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-orange-500" />
                    <span className="font-medium text-foreground/90">总流量:</span>
                  </div>
                  <span className="font-bold text-foreground">
                    {formatBandwidthValue(tooltipData.total)}
                  </span>
                </div>
              </div>
            </div>
          </TooltipWithBounds>
        )}
      </div>

      {/* 图例 */}
      <div className="mt-4 flex items-center justify-center gap-6">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-sky-500" />
          <span className="text-sm font-medium text-foreground/90">入站流量</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-green-500" />
          <span className="text-sm font-medium text-foreground/90">出站流量</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-orange-500" />
          <span className="text-sm font-medium text-foreground/90">总流量</span>
        </div>
      </div>
    </ChartContainer>
  )
}
