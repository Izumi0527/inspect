'use client'

import type { Ref } from 'react'
import { Radio } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/atoms'
import { SectionHeader, SectionFailureContent } from '../shared'
import { NetworkTrafficChartWrapper, ChartSkeleton } from '../charts'
import type { MonitoringDataEnvelope, MonitoringDataV2 } from '../../types'

interface NetworkSectionProps {
  sectionRef: Ref<HTMLDivElement>
  networkInView: boolean
  sectionNetworkTraffic: MonitoringDataEnvelope['sections']['networkTraffic'] | undefined
  networkTrafficHistory: MonitoringDataV2['networkTrafficHistory']
  timeRange: string
  onRetry: () => void
}

export function NetworkSection({
  sectionRef,
  networkInView,
  sectionNetworkTraffic,
  networkTrafficHistory,
  timeRange,
  onRetry,
}: NetworkSectionProps) {
  return (
    <section ref={sectionRef}>
      <SectionHeader icon={Radio} title="网络流量" />
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">流量监控</CardTitle>
        </CardHeader>
        <CardContent>
          {networkInView ? (
            sectionNetworkTraffic?.ok === false ? (
              <SectionFailureContent
                title="网络流量"
                message={sectionNetworkTraffic?.message ?? '网络流量数据加载失败'}
                onRetry={onRetry}
                className="h-48"
              />
            ) : networkTrafficHistory && networkTrafficHistory.length > 0 ? (
              <NetworkTrafficChartWrapper data={networkTrafficHistory} height={240} timeRange={timeRange} />
            ) : (
              <div className="flex h-48 items-center justify-center">
                <p className="text-sm text-muted-foreground">暂无流量数据</p>
              </div>
            )
          ) : (
            <ChartSkeleton height={240} />
          )}
        </CardContent>
      </Card>
    </section>
  )
}
