'use client'

import React from 'react'
import Link from 'next/link'
import { SimpleModal } from '@/components/atoms'
import { Device } from '../../types'
import { DeviceForm } from '../forms/DeviceForm'
import { mapFormDataToUpdatePayload, buildFormInitialData, DevicePayload } from '../../utils/deviceFormMapper'
import type { DeviceDeepLinkSection } from '../../utils/deviceDeepLink'

interface EditDeviceModalProps {
  isOpen: boolean
  device: Device | null
  loading: boolean
  onClose: () => void
  onSubmit: (deviceId: number, payload: DevicePayload) => Promise<void>
  focusSection?: DeviceDeepLinkSection
  returnToMonitoringHref?: string
  onReturnToMonitoring?: () => void
}

export const EditDeviceModal: React.FC<EditDeviceModalProps> = ({
  isOpen,
  device,
  loading,
  onClose,
  onSubmit,
  focusSection,
  returnToMonitoringHref,
  onReturnToMonitoring,
}) => {
  const initialData = React.useMemo(() => buildFormInitialData(device), [device])
  const showDeepLinkNotice = Boolean(
    device && initialData && (focusSection === 'credentials' || returnToMonitoringHref),
  )

  return (
    <SimpleModal open={isOpen} onClose={onClose} title="编辑设备" size="5xl">
      {device && initialData ? (
        <div className="space-y-4">
          {showDeepLinkNotice && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span>
                留空密码/团体字将保留现有加密凭据，仅修改需要更新的字段
              </span>
              {returnToMonitoringHref && (
                <Link
                  href={returnToMonitoringHref}
                  className="inline-flex h-7 items-center rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground hover:bg-accent"
                >
                  返回监控抽屉
                </Link>
              )}
            </div>
          )}
          <DeviceForm
            initialData={initialData}
            loading={loading}
            focusSection={focusSection}
            secondarySubmitLabel={onReturnToMonitoring ? '更新并返回监控' : undefined}
            onSecondarySubmit={
              onReturnToMonitoring
                ? async (formData) => {
                    const payload = mapFormDataToUpdatePayload(formData)
                    await onSubmit(device.id, payload)
                    onClose()
                    onReturnToMonitoring()
                  }
                : undefined
            }
            onSubmit={async (formData) => {
              const payload = mapFormDataToUpdatePayload(formData)
              await onSubmit(device.id, payload)
              onClose()
            }}
            onCancel={onClose}
          />
        </div>
      ) : loading ? (
        <div className="py-10 text-center text-muted-foreground">
          正在加载设备配置与凭据信息...
        </div>
      ) : (
        <div className="py-10 text-center text-muted-foreground">请选择要编辑的设备</div>
      )}
    </SimpleModal>
  )
}
