'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Input, TextArea } from '@/components/atoms'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { TemplateDetailResponse } from '../../types/zabbix-monitoring.types'

const templateSchema = z.object({
  name: z.string().trim().min(1, '请填写方案名称').max(128, '名称不超过 128 字符'),
  vendor: z.string().trim().max(64).default(''),
  device_type: z.string().trim().max(64).default('switch'),
  default_interval_sec: z.coerce
    .number()
    .int()
    .min(60, '默认采集周期最低 60 秒')
    .max(86400, '默认采集周期不超过 86400 秒'),
  description: z.string().trim().max(512).default(''),
})

type TemplateFormValues = z.infer<typeof templateSchema>

interface TemplateFormModalProps {
  open: boolean
  editingTemplate: TemplateDetailResponse | null
  submitting: boolean
  onClose: () => void
  onSubmit: (values: TemplateFormValues) => void
}

export function TemplateFormModal({
  open,
  editingTemplate,
  submitting,
  onClose,
  onSubmit,
}: TemplateFormModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: '',
      vendor: '',
      device_type: 'switch',
      default_interval_sec: 300,
      description: '',
    },
  })

  useEffect(() => {
    if (!open) return
    if (editingTemplate) {
      reset({
        name: editingTemplate.name,
        vendor: editingTemplate.vendor ?? '',
        device_type: editingTemplate.device_type ?? 'switch',
        default_interval_sec: editingTemplate.default_interval_sec || 300,
        description: editingTemplate.description ?? '',
      })
    } else {
      reset({
        name: '',
        vendor: '',
        device_type: 'switch',
        default_interval_sec: 300,
        description: '',
      })
    }
  }, [open, editingTemplate, reset])

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingTemplate ? '编辑自定义监控方案' : '新建自定义监控方案'}</DialogTitle>
          <DialogDescription>
            方案可绑定到设备分组或单台设备，统一管理采集指标与默认告警阈值。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <label htmlFor="tpl-name" className="mb-1 block text-xs font-medium text-foreground">
              方案名称
            </label>
            <Input id="tpl-name" {...register('name')} placeholder="例如：核心机房汇聚交换机方案" />
            {errors.name && <p className="mt-1 text-xs text-danger">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="tpl-vendor" className="mb-1 block text-xs font-medium text-foreground">
                适用厂商
              </label>
              <Input id="tpl-vendor" {...register('vendor')} placeholder="huawei / h3c" />
            </div>
            <div>
              <label htmlFor="tpl-type" className="mb-1 block text-xs font-medium text-foreground">
                设备类型
              </label>
              <Input id="tpl-type" {...register('device_type')} placeholder="switch / router" />
            </div>
            <div>
              <label htmlFor="tpl-interval" className="mb-1 block text-xs font-medium text-foreground">
                默认周期（秒）
              </label>
              <Input
                id="tpl-interval"
                type="number"
                className="tabular-nums"
                {...register('default_interval_sec')}
              />
              {errors.default_interval_sec && (
                <p className="mt-1 text-xs text-danger">{errors.default_interval_sec.message}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="tpl-desc" className="mb-1 block text-xs font-medium text-foreground">
              方案说明
            </label>
            <TextArea
              id="tpl-desc"
              rows={3}
              className="min-h-[76px] p-2.5"
              {...register('description')}
              placeholder="简要说明该方案适用的设备范围与重点监测项"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              取消
            </Button>
            <Button type="submit" loading={submitting}>
              {editingTemplate ? '保存修改' : '创建方案'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
