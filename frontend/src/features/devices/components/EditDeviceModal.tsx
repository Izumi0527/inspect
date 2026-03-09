'use client'

import React from 'react'
import { SimpleModal } from '@/components/atoms'
import { Device } from '../types'
import { DeviceForm } from './DeviceForm'
import { mapFormDataToUpdatePayload, buildFormInitialData, DevicePayload } from '../utils/deviceFormMapper'

interface EditDeviceModalProps {
  isOpen: boolean
  device: Device | null
  loading: boolean
  onClose: () => void
  onSubmit: (deviceId: number, payload: DevicePayload) => Promise<void>
}

export const EditDeviceModal: React.FC<EditDeviceModalProps> = ({
  isOpen,
  device,
  loading,
  onClose,
  onSubmit
}) => {
  const initialData = React.useMemo(() => buildFormInitialData(device), [device])

  return (
    <SimpleModal open={isOpen} onClose={onClose} title="编辑设备" size="5xl">
      {device && initialData ? (
        <DeviceForm
          initialData={initialData}
          loading={loading}
          onSubmit={async (formData) => {
            const payload = mapFormDataToUpdatePayload(formData)
            await onSubmit(device.id, payload)
            onClose()
          }}
          onCancel={onClose}
        />
      ) : (
        <div className="py-10 text-center text-muted-foreground">请选择要编辑的设备</div>
      )}
    </SimpleModal>
  )
}
