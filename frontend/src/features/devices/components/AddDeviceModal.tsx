'use client'

import React from 'react'
import { SimpleModal } from '@/components/atoms'
import { DeviceForm } from './DeviceForm'
import { Device } from '../types'
import { mapFormDataToApiPayload } from '../utils/deviceFormMapper'

interface AddDeviceModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: Omit<Device, 'id' | 'status' | 'last_seen' | 'uptime' | 'cpu_usage' | 'memory_usage' | 'network_traffic' | 'alert_count' | 'created_at' | 'updated_at'>) => Promise<void>
  loading?: boolean
}

export const AddDeviceModal: React.FC<AddDeviceModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  loading = false
}) => {
  return (
    <SimpleModal
      open={isOpen}
      onClose={onClose}
      title="添加设备"
      size="5xl"
    >
      <DeviceForm
        onSubmit={async (formData) => {
          // 将表单数据转换为后端兼容的负载结构
          const deviceData = mapFormDataToApiPayload(formData)
          await onSubmit(deviceData)
          onClose()
        }}
        onCancel={onClose}
        loading={loading}
      />
    </SimpleModal>
  )
}
