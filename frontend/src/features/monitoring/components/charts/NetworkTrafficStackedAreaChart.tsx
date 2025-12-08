import { useMemo } from 'react'
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

interface NetworkTrafficStackedAreaChartProps {
  data: NetworkTrafficDataPoint[]
  height?: number
  className?: string
}

/**
 * 网络流量堆叠面积图
 *
 * 显示入站和出站流量的堆叠面积,便于对比总流量和流量分布
 * - 入站流量: 蓝色区域
 * - 出站流量: 绿色区域
 */
export function NetworkTrafficStackedAreaChart({
  data,
  height = 300,
  className,
}: NetworkTrafficStackedAreaChartProps) {
  // 深色模式检测
  const isDark =
    typeof window !== 'undefined' && document.documentElement.classList.contains('dark')
  const gridColor = isDark ? '#374151' : '#e5e7eb'
  const axisColor = isDark ? '#9CA3AF' : '#6b7280'
  const tooltipBg = isDark ? 'rgba(17, 24, 39, 0.95)' : 'rgba(255, 255, 255, 0.95)'
  const tooltipBorder = isDark ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 0.5)'

  const width = 800
  const margin = { top: 20, right: 30, bottom: 40, left: 60 }
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom

  const { showTooltip, hideTooltip, tooltipData, tooltipLeft = 0, tooltipTop = 0 } = useTooltip<{
    time: string
    inbound: number
    outbound: number
    total: number
  }>()

  // 数据处理:计算堆叠值
  const processedData = useMemo(() => {
    return data.map((point) => {
      const date = new Date(point.timestamp)
      return {
        date,
        time: date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        inbound: point.inbound,
        outbound: point.outbound,
        total: point.inbound + point.outbound,
        // 堆叠计算
        inboundBase: 0,
        inboundTop: point.inbound,
        outboundBase: point.inbound,
        outboundTop: point.inbound + point.outbound,
      }
    })
  }, [data])

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
        <p className="text-gray-500 dark:text-gray-400">暂无流量数据</p>
      </div>
    )
  }

  return (
    <ChartContainer className={className}>
      <div style={{ position: 'relative', width: '100%', height }}>
        <svg width="100%" height={height}>
          <defs>
            {/* 入站流量渐变 */}
            <LinearGradient
              id="inbound-gradient"
              from="#06B6D4"
              to="#06B6D4"
              fromOpacity={0.6}
              toOpacity={0.1}
            />
            {/* 出站流量渐变 */}
            <LinearGradient
              id="outbound-gradient"
              from="#10B981"
              to="#10B981"
              fromOpacity={0.6}
              toOpacity={0.1}
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
              stroke="#06B6D4"
              strokeWidth={2}
              curve={curveMonotoneX}
            />

            {/* 总流量边界线 */}
            <LinePath
              data={processedData}
              x={(d) => xScale(d.date)}
              y={(d) => yScale(d.outboundTop)}
              stroke="#10B981"
              strokeWidth={2}
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
              numTicks={6}
              tickLabelProps={() => ({
                fill: axisColor,
                fontSize: 12,
                textAnchor: 'middle',
              })}
              tickFormat={(value) => {
                const date = value as Date
                return date.toLocaleTimeString('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
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
              tickFormat={(value) => `${value} Mbps`}
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
            <p className="mb-2 text-sm font-medium text-gray-900 dark:text-gray-100">
              {tooltipData.time}
            </p>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-cyan-500" />
                  <span className="text-gray-600 dark:text-gray-400">入站:</span>
                </div>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {tooltipData.inbound.toFixed(1)} Mbps
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <span className="text-gray-600 dark:text-gray-400">出站:</span>
                </div>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {tooltipData.outbound.toFixed(1)} Mbps
                </span>
              </div>
              <div className="mt-2 border-t border-gray-200 pt-2 dark:border-gray-700">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="font-medium text-gray-700 dark:text-gray-300">总计:</span>
                  <span className="font-bold text-gray-900 dark:text-gray-100">
                    {tooltipData.total.toFixed(1)} Mbps
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
          <div className="h-3 w-3 rounded-full bg-cyan-500" />
          <span className="text-sm text-gray-600 dark:text-gray-400">入站流量</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-green-500" />
          <span className="text-sm text-gray-600 dark:text-gray-400">出站流量</span>
        </div>
      </div>
    </ChartContainer>
  )
}
