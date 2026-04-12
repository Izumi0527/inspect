import { render, screen } from '@testing-library/react'

import { BackupConfigSection } from '@/features/settings/components/backup/BackupConfigSection'
import { BackupHistorySection } from '@/features/settings/components/backup/BackupHistorySection'
import { BackupOverviewCard } from '@/features/settings/components/backup/BackupOverviewCard'
import type { BackupConfig } from '@/features/settings/types/backup.types'

const config: BackupConfig = {
  autoBackupEnabled: true,
  backupFrequency: 'daily',
  backupTime: '02:00',
  retentionDays: 30,
  backupPath: '/data/backups',
  includeDatabase: true,
  includeFiles: false,
  compressBackup: true,
}

const diskUsage = {
  used: 1024,
  total: 10240,
  percentage: 10,
}

const removedExplanatoryCopies = [
  '当前页面用于管理备份策略、历史资产与恢复操作',
  '设置自动备份的频率、时间和保留策略',
  '保存整页更改会提交当前备份策略配置',
  '定期自动创建系统备份，保障数据安全',
  '选择自动备份的执行频率',
  '备份所有数据库数据（推荐启用）',
  '使用压缩减少存储空间占用（推荐启用）',
  '备份策略建议',
  '建议定期验证恢复流程',
  '查看历史备份、磁盘占用和恢复/删除等资产操作',
  '点击上方"手动备份"按钮创建第一个备份',
]

const retainedFunctionalCopies = [
  '备份管理',
  '当前备份健康度',
  '备份总数',
  '磁盘使用率',
  '自动备份',
  '保留天数',
  '最近备份状态',
  '备份策略配置',
  '启用自动备份',
  '备份频率',
  '备份时间',
  '备份保留天数',
  '备份存储路径',
  '备份内容',
  '系统配置（settings）始终包含在备份中',
  '包含数据库',
  '包含文件（暂不支持）',
  '当前版本暂不支持文件备份与恢复',
  '压缩备份文件',
  '备份历史记录',
  '磁盘使用情况',
  '暂无备份记录',
  '手动备份',
  '保存整页更改',
  '重置整页更改',
]

describe('BackupManagement 备份管理页说明文案', () => {
  it('不展示页面导览、推荐建议和保存语义说明文案', () => {
    render(
      <div>
        <BackupOverviewCard
          totalCount={0}
          diskUsage={diskUsage}
          autoBackupEnabled={config.autoBackupEnabled}
          retentionDays={config.retentionDays}
        />
        <BackupConfigSection
          data={config}
          onChange={jest.fn()}
          actions={{
            isDirty: true,
            isSaving: false,
            onSave: jest.fn(),
            onReset: jest.fn(),
          }}
        />
        <BackupHistorySection
          backups={[]}
          totalCount={0}
          diskUsage={diskUsage}
          isCreating={false}
          isRestoring={false}
          isDeleting={false}
          onCreateBackup={jest.fn()}
          onRestoreBackup={jest.fn()}
          onDeleteBackup={jest.fn()}
          onDownloadBackup={jest.fn()}
        />
      </div>
    )

    for (const copy of removedExplanatoryCopies) {
      expect(screen.queryByText(copy, { exact: false })).not.toBeInTheDocument()
    }

    for (const copy of retainedFunctionalCopies) {
      expect(screen.getAllByText(copy, { exact: false }).length).toBeGreaterThan(0)
    }
  })
})
