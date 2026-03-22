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
  onChange: (field: keyof BackupConfig, value: any) => void
  actions?: BackupActionProps
}

const frequencyOptions = [
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
]

export function BackupConfigSection({ data, onChange, actions }: Props) {
  return (
    <div className="p-4">
      <SectionHeader
        title="备份策略配置"
        description="设置自动备份的频率、时间和保留策略"
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
                重置
              </Button>
              <Button
                type="button"
                onClick={actions.onSave}
                disabled={!actions.isDirty || actions.isSaving}
              >
                <Save className="w-4 h-4 mr-2" />
                {actions.isSaving ? '保存中...' : '保存'}
              </Button>
            </div>
          ) : null
        }
      />

      <div className="mt-6 space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <p className="text-sm text-blue-800">
            提示：自动备份将在指定时间运行。建议在系统使用低峰期（如凌晨）执行备份操作。
          </p>
        </div>

        {/* 启用自动备份 */}
        <ConfigItem
          label="启用自动备份"
          description="定期自动创建系统备份，保障数据安全"
        >
          <ConfigSwitch
            checked={data.autoBackupEnabled}
            onCheckedChange={(checked) => onChange('autoBackupEnabled', checked)}
          />
        </ConfigItem>

        {data.autoBackupEnabled && (
          <>
            {/* 备份频率 */}
            <ConfigItem
              label="备份频率"
              description="选择自动备份的执行频率"
              required
            >
              <ConfigSelect
                value={data.backupFrequency}
                onChange={(value) => onChange('backupFrequency', value)}
                options={frequencyOptions}
                disabled={!data.autoBackupEnabled}
              />
            </ConfigItem>

            {/* 备份时间 */}
            <ConfigItem
              label="备份时间"
              description="每日备份的执行时间（24小时制，HH:mm格式）"
              required
            >
              <ConfigInput
                type="time"
                value={data.backupTime}
                onChange={(value) => onChange('backupTime', value)}
                disabled={!data.autoBackupEnabled}
              />
            </ConfigItem>
          </>
        )}

        {/* 备份保留天数 */}
        <div className="pt-4 border-t">
          <ConfigItem
            label="备份保留天数"
            description="自动删除超过指定天数的旧备份（1-365天）"
            required
          >
            <ConfigInput
              type="number"
              value={data.retentionDays}
              onChange={(value) => onChange('retentionDays', parseInt(value, 10))}
              min={1}
              max={365}
            />
          </ConfigItem>
        </div>

        {/* 备份存储路径 */}
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
          />
        </ConfigItem>

        {/* 备份内容选项 */}
        <div className="pt-4 border-t space-y-4">
          <div className="text-sm font-medium text-foreground/90 mb-2">备份内容</div>

          <div className="bg-muted/40 border border-border rounded-md p-4">
            <p className="text-sm text-foreground/90 mb-2">
              <strong>系统配置（必选）</strong>：备份文件始终包含系统配置项（settings）。
            </p>
            <p className="text-sm text-muted-foreground">
              你可以按需选择是否额外包含数据库快照；文件备份/恢复当前版本暂不支持。
            </p>
          </div>

          <ConfigItem
            label="包含数据库"
            description="备份所有数据库数据（推荐启用）"
          >
            <ConfigSwitch
              checked={data.includeDatabase}
              onCheckedChange={(checked) => onChange('includeDatabase', checked)}
            />
          </ConfigItem>

          <ConfigItem
            label="包含文件（暂不支持）"
            description="当前版本暂不支持文件备份与恢复，该选项已禁用"
          >
            <ConfigSwitch
              checked={data.includeFiles}
              onCheckedChange={(checked) => onChange('includeFiles', checked)}
              disabled={true}
            />
          </ConfigItem>
        </div>

        {/* 压缩选项 */}
        <div className="pt-4 border-t">
          <ConfigItem
            label="压缩备份文件"
            description="使用压缩减少存储空间占用（推荐启用）"
          >
            <ConfigSwitch
              checked={data.compressBackup}
              onCheckedChange={(checked) => onChange('compressBackup', checked)}
            />
          </ConfigItem>
        </div>

        {/* 提示信息 */}
        <div className="pt-4 border-t">
          <div className="bg-muted/40 border border-border rounded-md p-4">
            <p className="text-sm text-foreground/90 mb-2">
              <strong>备份建议：</strong>
            </p>
            <ul className="text-sm text-muted-foreground space-y-1 ml-4 list-disc">
              <li>定期测试备份恢复流程，确保备份文件可用</li>
              <li>将重要备份文件复制到异地存储，防止灾难性损失</li>
              <li>监控备份存储空间，避免磁盘满导致备份失败</li>
              <li>生产环境建议每天备份，保留至少30天历史数据</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
