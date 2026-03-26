import type { RefObject } from 'react'
import { TrendingUp } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/atoms'
import { SectionHeader, SectionFailureContent } from '../shared'
import {
  SystemPerformanceChartWrapper,
  TemperatureChartWrapper,
  ChartSkeleton,
} from '../charts'
import type { MonitoringDataEnvelope, MonitoringDataV2 } from '../../types'

interface PerformanceSectionProps {
  sectionRef: RefObject<HTMLDivElement | null>
  chartsInView: boolean
  sectionSystemPerformance: MonitoringDataEnvelope['sections']['systemPerformance'] | undefined
  sectionTemperature: MonitoringDataEnvelope['sections']['temperature'] | undefined
  systemPerformance: MonitoringDataV2['systemPerformance']
  temperatureHistory: MonitoringDataV2['temperatureHistory']
  timeRange: string
  onRetry: () => void
}

export function PerformanceSection({
  sectionRef,
  chartsInView,
  sectionSystemPerformance,
  sectionTemperature,
  systemPerformance,
  temperatureHistory,
  timeRange,
  onRetry,
}: PerformanceSectionProps) {
  return (
    <section ref={sectionRef}>
      <SectionHeader icon={TrendingUp} title="性能趋势" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">系统性能趋势</CardTitle>
          </CardHeader>
          <CardContent>
            {chartsInView ? (
              sectionSystemPerformance?.ok === false ? (
                <SectionFailureContent
                  title="系统性能趋势"
                  message={sectionSystemPerformance?.message ?? '系统性能数据加载失败'}
                  onRetry={onRetry}
                  className="h-64"
                />
              ) : systemPerformance && systemPerformance.length > 0 ? (
                <SystemPerformanceChartWrapper data={systemPerformance} height={280} timeRange={timeRange} />
              ) : (
                <div className="flex h-64 items-center justify-center">
                  <p className="text-sm text-muted-foreground">暂无性能数据</p>
                </div>
              )
            ) : (
              <ChartSkeleton height={280} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">设备温度监控</CardTitle>
          </CardHeader>
          <CardContent>
            {chartsInView ? (
              sectionTemperature?.ok === false ? (
                <SectionFailureContent
                  title="设备温度监控"
                  message={sectionTemperature?.message ?? '温度数据加载失败'}
                  onRetry={onRetry}
                  className="h-64"
                />
              ) : temperatureHistory && temperatureHistory.length > 0 ? (
                <TemperatureChartWrapper
                  data={temperatureHistory}
                  height={280}
                  temperatureThreshold={75}
                  timeRange={timeRange}
                />
              ) : (
                <div className="flex h-64 items-center justify-center">
                  <p className="text-sm text-muted-foreground">暂无温度数据</p>
                </div>
              )
            ) : (
              <ChartSkeleton height={280} />
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
