'use client'

import { useEffect, useMemo, useState, type Ref } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/atoms'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { SectionFailureContent } from '../shared'
import { InterfaceTrafficChartWrapper, TrafficSeriesLegend, ChartSkeleton } from '../charts'
import { useMonitoringDevices } from '../../hooks/useMonitoringDevices'
import { useDeviceInterfaceTraffic } from '../../hooks/useDeviceInterfaceTraffic'
import type { MonitoringDataEnvelope, MonitoringDataV2 } from '../../types'

const CHART_HEIGHT = 260

interface NetworkSectionProps {
  sectionRef: Ref<HTMLDivElement>
  networkInView: boolean
  /** 页面级设备筛选（空 = 全部设备）；恰好 1 台时切换为该设备的接口视图 */
  deviceIds: number[]
  timeRange: string
  pageVisible: boolean
  sectionNetworkTraffic: MonitoringDataEnvelope['sections']['networkTraffic'] | undefined
  /** v2 聚合流量（全部设备/多选时使用） */
  networkTrafficHistory: MonitoringDataV2['networkTrafficHistory']
  onRetry: () => void
}

/**
 * 流量监控卡
 *
 * - 单设备视图：物理 UP 接口选择器（逻辑口不列出），数据来自 /monitoring/devices/:id/interface-traffic；
 *   selectedInterface 为空表示跟随后端默认（列表首个物理口）
 * - 聚合视图：全部设备或多选时沿用 v2 的跨设备聚合曲线
 * 两种视图都只画上行/下行两条序列。
 */
export function NetworkSection({
  sectionRef,
  networkInView,
  deviceIds,
  timeRange,
  pageVisible,
  sectionNetworkTraffic,
  networkTrafficHistory,
  onRetry,
}: NetworkSectionProps) {
  const singleDeviceId = deviceIds.length === 1 ? deviceIds[0] : null
  const { data: devices = [] } = useMonitoringDevices()

  const [selectedInterface, setSelectedInterface] = useState('')
  // 换设备后接口列表不同，回到后端默认接口
  useEffect(() => {
    setSelectedInterface('')
  }, [singleDeviceId])

  const interfaceTraffic = useDeviceInterfaceTraffic({
    deviceId: networkInView ? singleDeviceId : null,
    timeRange,
    interfaceName: selectedInterface,
    enablePolling: pageVisible,
  })
  const upInterfaces = useMemo(() => interfaceTraffic.data?.interfaces ?? [], [interfaceTraffic.data])

  // 已选接口不再 UP（从列表消失）时回到后端默认接口，避免选择器显示空值
  useEffect(() => {
    if (selectedInterface === '' || !interfaceTraffic.data) return
    if (!upInterfaces.some((item) => item.name === selectedInterface)) {
      setSelectedInterface('')
    }
  }, [interfaceTraffic.data, selectedInterface, upInterfaces])

  // 选择器显示值：用户未选时显示后端实际采用的接口（响应里的 interface）
  const activeInterface = selectedInterface !== '' ? selectedInterface : (interfaceTraffic.data?.interface ?? '')

  const scopeLabel = useMemo(() => {
    if (singleDeviceId !== null) {
      const device = devices.find((item) => item.id === singleDeviceId)
      if (!device) return `设备 #${singleDeviceId}`
      return device.ipAddress ? `${device.name} · ${device.ipAddress}` : device.name
    }
    return deviceIds.length === 0 ? '全部设备' : `已选 ${deviceIds.length} 台`
  }, [deviceIds.length, devices, singleDeviceId])

  const renderInterfaceView = () => {
    if (interfaceTraffic.error) {
      return (
        <SectionFailureContent
          title="接口流量"
          message={interfaceTraffic.error.message || '接口流量数据加载失败'}
          onRetry={() => void interfaceTraffic.refetch()}
          className="h-48"
        />
      )
    }
    if (interfaceTraffic.isPending || !interfaceTraffic.data) {
      return <ChartSkeleton height={CHART_HEIGHT} />
    }
    if (upInterfaces.length === 0) {
      return (
        <div className="flex h-48 items-center justify-center">
          <p className="text-sm text-muted-foreground">该设备当前没有 UP 状态的物理接口</p>
        </div>
      )
    }
    return (
      <InterfaceTrafficChartWrapper
        data={interfaceTraffic.data.points}
        height={CHART_HEIGHT}
        timeRange={timeRange}
        className={interfaceTraffic.isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity'}
      />
    )
  }

  const renderAggregateView = () => {
    if (sectionNetworkTraffic?.ok === false) {
      return (
        <SectionFailureContent
          title="流量监控"
          message={sectionNetworkTraffic?.message ?? '网络流量数据加载失败'}
          onRetry={onRetry}
          className="h-48"
        />
      )
    }
    return <InterfaceTrafficChartWrapper data={networkTrafficHistory ?? []} height={CHART_HEIGHT} timeRange={timeRange} />
  }

  return (
    <section ref={sectionRef}>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <CardTitle className="text-base">流量监控</CardTitle>
            <span className="truncate text-sm text-muted-foreground">{scopeLabel}</span>
            {singleDeviceId !== null ? (
              <Select value={activeInterface} onValueChange={setSelectedInterface}>
                <SelectTrigger className="h-8 w-auto min-w-40 max-w-64 px-3 py-1 text-sm" aria-label="接口选择">
                  <SelectValue placeholder="选择接口" />
                </SelectTrigger>
                <SelectContent>
                  {upInterfaces.map((item) => (
                    <SelectItem key={item.name} value={item.name}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-xs text-muted-foreground">勾选单台设备可查看各接口流量</span>
            )}
            <div className="ml-auto">
              <TrafficSeriesLegend />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!networkInView ? (
            <ChartSkeleton height={CHART_HEIGHT} />
          ) : singleDeviceId !== null ? (
            renderInterfaceView()
          ) : (
            renderAggregateView()
          )}
        </CardContent>
      </Card>
    </section>
  )
}
