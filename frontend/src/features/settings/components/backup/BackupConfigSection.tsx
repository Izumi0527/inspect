'use client'

import { SectionHeader } from '@/features/settings/components/shared/SectionHeader'
import { ConfigItem } from '@/features/settings/components/shared/ConfigItem'
import { ConfigInput } from '@/features/settings/components/shared/ConfigInput'
import { ConfigSwitch } from '@/features/settings/components/shared/ConfigSwitch'
import { ConfigSelect } from '@/features/settings/components/shared/ConfigSelect'
import { Button } from '@/components/ui/button'
import { RotateCcw, Save, Settings } from 'lucide-react'
import type { BackupConfig } from '@/features/settings/types/backup.types'

interface BackupActionProps {
  isDirty: boolean
  isSaving: boolean
  onSave: () => void
  onReset: () => void
}

interface Props {
  data: BackupConfig
  onChange: <K extends keyof BackupConfig>(field: K, value: BackupConfig[K]) => void
  actions?: BackupActionProps
}

const frequencyOptions = [
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
]

export function BackupConfigSection({ data, onChange, actions }: Props) {
  return (
    <section aria-label="备份策略配置" className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <SectionHeader
        title="备份策略配置"
        icon={Settings}
        actions={
          actions ? (
            <div role="group" aria-label="备份策略操作" className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={actions.onReset}
                disabled={!actions.isDirty || actions.isSaving}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                重置整页更改
              </Button>
              <Button
                type="button"
                onClick={actions.onSave}
                disabled={!actions.isDirty || actions.isSaving}
              >
                <Save className="w-4 h-4 mr-2" />
                {actions.isSaving ? '保存中...' : '保存整页更改'}
              </Button>
            </div>
          ) : null
        }
      />

      <div className="mt-6 space-y-4">
        {/* 启用自动备份 */}
        <ConfigItem
          label="启用自动备份"
        >
          <ConfigSwitch
            checked={data.autoBackupEnabled}
            onCheckedChange={(checked) => onChange('autoBackupEnabled', checked)}
          />
        </ConfigItem>

        {/* 备份频率 + 备份时间 并排（条件展示）*/}
        {data.autoBackupEnabled && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ConfigItem label="备份频率" required>
              <ConfigSelect
                value={data.backupFrequency}
                // 选项值域由 frequencyOptions 限定，此处将 string 收窄回字段联合类型
                onChange={(value) => onChange('backupFrequency', value as BackupConfig['backupFrequency'])}
                options={frequencyOptions}
              />
            </ConfigItem>

            <ConfigItem
              label="备份时间"
              description="每日备份的执行时间（HH:mm）"
              required
            >
              <ConfigInput
                type="time"
                value={data.backupTime}
                onChange={(value) => onChange('backupTime', value)}
                className="w-full"
              />
            </ConfigItem>
          </div>
        )}

        {/* 备份保留天数 + 备份存储路径 */}
        <div className="pt-4 border-t space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ConfigItem
              label="备份保留天数"
              description="自动删除超过此天数的旧备份（1-365天）"
              required
            >
              <ConfigInput
                type="number"
                value={data.retentionDays}
                onChange={(value) => onChange('retentionDays', parseInt(value, 10))}
                min={1}
                max={365}
                className="w-full"
              />
            </ConfigItem>

            <ConfigItem
              label="备份存储路径"
              description="备份文件的存储位置（绝对路径）"
              required
            >
              <ConfigInput
                type="text"
                value={data.backupPath}
                onChange={(value) => onChange('backupPath', value)}
                placeholder="/data/backups"
                className="w-full"
              />
            </ConfigItem>
          </div>
        </div>

        {/* 备份内容：两个开关并排 */}
        <div className="pt-4 border-t space-y-3">
          <div className="text-sm font-medium text-foreground/90">备份内容</div>

          <div className="bg-muted/40 border border-border rounded-md p-3">
            <p className="text-xs text-muted-foreground">
              系统配置（settings）始终包含在备份中。可按需选择是否额外包含数据库快照；文件备份当前版本暂不支持。
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ConfigItem
              label="包含数据库"
            >
              <ConfigSwitch
                checked={data.includeDatabase}
                onCheckedChange={(checked) => onChange('includeDatabase', checked)}
              />
            </ConfigItem>

            <ConfigItem
              label="包含文件（暂不支持）"
              description="当前版本暂不支持文件备份与恢复"
            >
              <ConfigSwitch
                checked={data.includeFiles}
                onCheckedChange={(checked) => onChange('includeFiles', checked)}
                disabled={true}
              />
            </ConfigItem>
          </div>
        </div>

        {/* 压缩备份文件 */}
        <div className="pt-4 border-t">
          <ConfigItem
            label="压缩备份文件"
          >
            <ConfigSwitch
              checked={data.compressBackup}
              onCheckedChange={(checked) => onChange('compressBackup', checked)}
            />
          </ConfigItem>
        </div>
      </div>
    </section>
  )
}
