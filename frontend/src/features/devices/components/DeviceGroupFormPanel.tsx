'use client'

import React from 'react'
import { Button, Input, TextArea } from '@/components/atoms'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { SelectableParentOption } from '../utils/deviceGroupTree'

export interface DeviceGroupFormValues {
  name: string
  description: string
  parentId: string
}

interface DeviceGroupFormPanelProps {
  mode: 'create' | 'edit'
  values: DeviceGroupFormValues
  parentOptions: SelectableParentOption[]
  submitting: boolean
  errorMessage: string | null
  onChange: (next: DeviceGroupFormValues) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onCancel: () => void
}

export const NO_PARENT_GROUP_VALUE = '__none__'

export const DeviceGroupFormPanel: React.FC<DeviceGroupFormPanelProps> = ({
  mode,
  values,
  parentOptions,
  submitting,
  errorMessage,
  onChange,
  onSubmit,
  onCancel,
}) => (
  <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-border bg-surface-2 p-4">
    <div className="flex items-center justify-between">
      <h4 className="text-sm font-semibold text-foreground">
        {mode === 'create' ? '新建设备分组' : '编辑设备分组'}
      </h4>
      <span className="text-xs text-muted-foreground">最多支持 3 级树形分组</span>
    </div>

    <div className="space-y-1.5">
      <label htmlFor="device-group-name" className="block text-xs font-medium text-foreground">
        分组名称
      </label>
      <Input
        id="device-group-name"
        value={values.name}
        onChange={(e) => onChange({ ...values, name: e.target.value })}
        placeholder="例如：总部数据中心 / 核心骨干网"
        className="h-9 px-3 rounded-md"
        maxLength={80}
        disabled={submitting}
      />
    </div>

    <div className="space-y-1.5">
      <label htmlFor="device-group-parent" className="block text-xs font-medium text-foreground">
        上级分组（可选）
      </label>
      <Select
        value={values.parentId || NO_PARENT_GROUP_VALUE}
        onValueChange={(value) => onChange({ ...values, parentId: value })}
        disabled={submitting}
      >
        <SelectTrigger
          id="device-group-parent"
          aria-label="上级分组"
          className="h-9 w-full gap-2 text-sm"
        >
          <SelectValue placeholder="无（作为一级根分组）" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_PARENT_GROUP_VALUE}>无（作为一级根分组）</SelectItem>
          {parentOptions.map((option) => (
            <SelectItem key={option.group.id} value={String(option.group.id)}>
              {option.pathLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>

    <div className="space-y-1.5">
      <label htmlFor="device-group-desc" className="block text-xs font-medium text-foreground">
        描述（可选）
      </label>
      <TextArea
        id="device-group-desc"
        value={values.description}
        onChange={(e) => onChange({ ...values, description: e.target.value })}
        placeholder="填写分组用途或所在机房范围"
        className="min-h-[68px] px-3 py-2 rounded-md"
        maxLength={255}
        disabled={submitting}
      />
    </div>

    {errorMessage && (
      <div
        role="alert"
        className="rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger-soft-foreground"
      >
        {errorMessage}
      </div>
    )}

    <div className="flex justify-end gap-2 pt-1">
      <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={submitting}>
        取消
      </Button>
      <Button type="submit" size="sm" loading={submitting}>
        {mode === 'create' ? '确认创建' : '保存修改'}
      </Button>
    </div>
  </form>
)
