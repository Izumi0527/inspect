'use client'

import { BarChart3 } from 'lucide-react'
import { SectionHeader, SectionFailureCard, SectionPermissionLimitedCard } from '../shared'
import { DeviceStatusCard, RealTimeAlertsCard } from '../cards'
import type { MonitoringDataEnvelope, MonitoringDataV2 } from '../../types'

interface StatusSectionProps {
  sectionDeviceStatus: MonitoringDataEnvelope['sections']['deviceStatus'] | undefined
  sectionRealtimeAlerts: MonitoringDataEnvelope['sections']['realtimeAlerts'] | undefined
  deviceStatusDistribution: MonitoringDataV2['deviceStatusDistribution']
  realtimeAlerts: MonitoringDataV2['realtimeAlerts']
  realtimeAlertsPermissionLimited: boolean
  requiredAlertsPermission: string
  onRetry: () => void
}

export function StatusSection({
  sectionDeviceStatus,
  sectionRealtimeAlerts,
  deviceStatusDistribution,
  realtimeAlerts,
  realtimeAlertsPermissionLimited,
  requiredAlertsPermission,
  onRetry,
}: StatusSectionProps) {
  return (
    <section>
      <SectionHeader icon={BarChart3} title="状态详情" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 items-stretch">
        {sectionDeviceStatus?.ok === false ? (
          <SectionFailureCard
            title="设备状态分布"
            message={sectionDeviceStatus?.message ?? '设备状态分布加载失败'}
            onRetry={onRetry}
          />
        ) : deviceStatusDistribution ? (
          <DeviceStatusCard data={deviceStatusDistribution} />
        ) : null}

        {realtimeAlertsPermissionLimited ? (
          <SectionPermissionLimitedCard
            title="实时告警"
            message={
              sectionRealtimeAlerts?.message ??
              `当前账号缺少查看告警权限（${sectionRealtimeAlerts?.requiredPermission ?? requiredAlertsPermission}），该区域已隐藏。`
            }
          />
        ) : sectionRealtimeAlerts?.ok === false ? (
          <SectionFailureCard
            title="实时告警"
            message={sectionRealtimeAlerts?.message ?? '实时告警加载失败'}
            onRetry={onRetry}
          />
        ) : realtimeAlerts ? (
          <RealTimeAlertsCard alerts={realtimeAlerts} maxItems={5} />
        ) : null}
      </div>
    </section>
  )
}
