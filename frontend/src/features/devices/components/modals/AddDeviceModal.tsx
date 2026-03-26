'use client'

import React from 'react'
import { SimpleModal } from '@/components/atoms'
import { DeviceForm } from '../forms/DeviceForm'
import { mapFormDataToCreatePayload, type CreateDevicePayload } from '../../utils/deviceFormMapper'

interface AddDeviceModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CreateDevicePayload) => Promise<void>
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
          const deviceData = mapFormDataToCreatePayload(formData)
          await onSubmit(deviceData)
          onClose()
        }}
        onCancel={onClose}
        loading={loading}
      />
    </SimpleModal>
  )
}
