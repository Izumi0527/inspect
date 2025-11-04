'use client'

import React from 'react'
import { Controller, Control, FieldErrors } from 'react-hook-form'
import {
  Settings
} from 'lucide-react'
import {
  SimpleInput as Input,
  Card,
  CardContent
} from '@/components/atoms'
import { AdvancedConfig } from '../types'
import { DeviceFormData } from './DeviceForm'

export interface AdvancedConfigFormData {
  advanced_config: AdvancedConfig
}

interface AdvancedConfigFormProps {
  control: Control<DeviceFormData>
  errors: FieldErrors<DeviceFormData>
}

export const AdvancedConfigForm: React.FC<AdvancedConfigFormProps> = ({
  control,
  errors
}) => {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-4">
          <h3 className="text-md font-medium text-gray-900 flex items-center gap-2">
            <Settings className="h-4 w-4" />
            高级配置
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 连接超时 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                连接超时（秒）
              </label>
              <Controller
                name="advanced_config.timeout"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    type="number"
                    min="5"
                    max="300"
                    placeholder="30 (范围: 5-300)"
                    value={field.value || '30'}
                    onChange={e => field.onChange(parseInt(e.target.value) || 30)}
                    error={errors.advanced_config?.timeout?.message}
                  />
                )}
              />
            </div>

            {/* 重试次数 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                重试次数
              </label>
              <Controller
                name="advanced_config.retry"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    type="number"
                    min="0"
                    max="10"
                    placeholder="3 (范围: 0-10)"
                    value={field.value || '3'}
                    onChange={e => field.onChange(parseInt(e.target.value) || 3)}
                    error={errors.advanced_config?.retry?.message}
                  />
                )}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}