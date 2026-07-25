import React, { useEffect, useMemo, useState } from 'react'
import { Settings, Plus, Edit, Copy, AlertCircle, Eye, Trash2, RefreshCw, Wand2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardTitle, CardContent, Button, Badge, ConfirmModal, Loading, SimpleInput as Input, SimpleModal, TextArea } from '@/components/atoms'
import { usePermission } from '@/lib/contexts/auth-context'
import { Permission } from '@/lib/types/auth.types'
import { useCreateCustomReportConfig, useCustomReportConfigs, useDeleteCustomReportConfig, useGenerateFromConfig, useReportTemplates } from '../hooks/useReports'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfigPreviewModal } from './ConfigPreviewModal'
import { CustomReportConfigModal } from './CustomReportConfigModal'
import { downloadWithAuth } from '@/utils/download'
import { downloadReport as fetchDownloadUrl } from '../api/reports.api'
import { formatDateYMD } from '@/utils/formatters'
import type { ChartConfig, CustomReportConfig, ReportStyles, ReportTemplate, TableConfig, TemplateSection } from '../types'
import { ReportsToolbar } from './shared/ReportsToolbar'

interface Props {
  searchText: string
  onSearchTextChange?: (value: string) => void
}

const defaultLayout = {
  columns: 2,
  sections: [],
}

const defaultReportStyles: ReportStyles = {
  theme: 'light',
  colors: {
    primary: '#000000',
    secondary: '#666666',
    accent: '#333333',
    background: '#ffffff',
    text: '#000000',
  },
  fonts: {
    heading: 'Arial',
    body: 'Arial',
    code: 'monospace',
  },
  spacing: {
    small: 4,
    medium: 8,
    large: 16,
  },
}

const createTemplateTables = (template: ReportTemplate): TableConfig[] => {
  const visibleSections = template.sections
    .filter((section) => section.visible !== false)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))

  if (visibleSections.length === 0) {
    return []
  }

  return [
    {
      id: `table-${template.id}`,
      title: `${template.name}结构清单`,
      dataSource: 'template_sections',
      columns: [
        { key: 'title', title: '区块名称', type: 'text' },
        { key: 'type', title: '区块类型', type: 'text' },
        { key: 'order', title: '排序', type: 'number' },
      ],
      pagination: false,
      exportable: true,
    },
  ]
}

const buildConfigPayloadFromTemplate = (template: ReportTemplate) => ({
  name: `${template.name}（导入）`,
  description: `从模板库导入：${template.name}`,
  template: {
    id: template.id,
    name: template.name,
    type: template.type,
    sections: template.sections,
    styles: template.styles,
  },
  parameters: {
    dateRange: { startDate: '', endDate: '' },
    includeCharts: true,
    includeDetailData: false,
    includeRecommendations: true,
  },
  charts: [] as ChartConfig[],
  tables: createTemplateTables(template),
  filters: [],
  layout: defaultLayout,
})

const defaultBuilderCharts: ChartConfig[] = [
  {
    id: 'inspection-trend',
    title: '巡检趋势',
    type: 'line',
    dataSource: 'inspection_statistics',
    xAxis: 'date',
    yAxis: 'successRate',
    series: ['successRate'],
  },
]

const defaultBuilderTables: TableConfig[] = [
  {
    id: 'device-summary',
    title: '设备巡检摘要',
    dataSource: 'inspection_devices',
    columns: [
      { key: 'deviceName', title: '设备名称', type: 'text' },
      { key: 'status', title: '状态', type: 'status' },
      { key: 'score', title: '健康分', type: 'number' },
    ],
    pagination: true,
    exportable: true,
  },
]

interface TemplateImportModalProps {
  open: boolean
  onClose: () => void
  templates: ReportTemplate[]
  isLoading: boolean
  error: unknown
  isSubmitting: boolean
  onImport: (template: ReportTemplate) => void
}

const TemplateImportModal: React.FC<TemplateImportModalProps> = ({
  open,
  onClose,
  templates,
  isLoading,
  error,
  isSubmitting,
  onImport,
}) => (
  <SimpleModal open={open} onClose={onClose} title="从模板库导入" size="3xl">
    <div className="space-y-4 p-6">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
        选择已有报表模板后，系统会自动转换为自定义报表配置，后续可继续编辑、预览并生成文件。
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loading />
          <span className="ml-2 text-muted-foreground">加载模板库中...</span>
        </div>
      )}

      {!isLoading && !!error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
          模板库加载失败，请稍后重试。
        </div>
      )}

      {!isLoading && !error && templates.length === 0 && (
        <div className="rounded-lg bg-muted/40 p-8 text-center text-muted-foreground">
          暂无可导入模板，请先在报表模板接口中创建模板。
        </div>
      )}

      {!isLoading && !error && templates.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {templates.map((template) => (
            <div key={template.id} className="rounded-lg border border-border bg-card p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="font-medium text-foreground">{template.name}</div>
                <Badge variant={template.type === 'standard' ? 'primary' : 'secondary'}>
                  {template.type === 'standard' ? '标准模板' : '自定义模板'}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                包含 {template.sections.length} 个区块，可导入为可编辑配置。
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  size="sm"
                  onClick={() => onImport(template)}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? '导入中...' : '导入此模板'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
          取消
        </Button>
      </div>
    </div>
  </SimpleModal>
)

interface BuilderModalProps {
  open: boolean
  onClose: () => void
  isSubmitting: boolean
  onSave: (payload: Omit<CustomReportConfig, 'id'>) => void
}

const BuilderModal: React.FC<BuilderModalProps> = ({
  open,
  onClose,
  isSubmitting,
  onSave,
}) => {
  const [name, setName] = useState('月度巡检自定义报表')
  const [description, setDescription] = useState('通过向导生成的自定义报表配置')
  const [includeTrendChart, setIncludeTrendChart] = useState(true)
  const [includeDeviceTable, setIncludeDeviceTable] = useState(true)

  useEffect(() => {
    if (!open) return
    setName('月度巡检自定义报表')
    setDescription('通过向导生成的自定义报表配置')
    setIncludeTrendChart(true)
    setIncludeDeviceTable(true)
  }, [open])

  const payloadPreview = useMemo(() => {
    const charts = includeTrendChart ? defaultBuilderCharts : []
    const tables = includeDeviceTable ? defaultBuilderTables : []

    const sections: TemplateSection[] = [
      {
        id: 'summary',
        type: 'summary',
        title: '巡检摘要',
        content: {},
        order: 1,
        visible: true,
      },
      ...charts.map((chart, index): TemplateSection => ({
        id: chart.id,
        type: 'chart',
        title: chart.title,
        content: { dataSource: chart.dataSource },
        order: index + 2,
        visible: true,
      })),
      ...tables.map((table, index): TemplateSection => ({
        id: table.id,
        type: 'table',
        title: table.title,
        content: { dataSource: table.dataSource },
        order: charts.length + index + 2,
        visible: true,
      })),
    ]

    const payload: Omit<CustomReportConfig, 'id'> = {
      name: name.trim(),
      description: description.trim(),
      template: {
        id: 'builder-template',
        name: name.trim() || '自定义模板',
        type: 'custom',
        sections,
        styles: defaultReportStyles,
      },
      parameters: {
        dateRange: { startDate: '', endDate: '' },
        includeCharts: includeTrendChart,
        includeDetailData: includeDeviceTable,
        includeRecommendations: true,
      },
      charts,
      tables,
      filters: [
        {
          id: 'date-range',
          type: 'date' as const,
          field: 'dateRange',
          label: '统计周期',
        },
      ],
      layout: defaultLayout,
    }

    return payload
  }, [description, includeDeviceTable, includeTrendChart, name])

  const handleSave = () => {
    if (!payloadPreview.name) {
      toast.error('请填写报表名称')
      return
    }
    if (payloadPreview.charts.length === 0 && payloadPreview.tables.length === 0) {
      toast.error('请至少选择一个图表或表格模块')
      return
    }
    onSave(payloadPreview)
  }

  return (
    <SimpleModal open={open} onClose={onClose} title="自定义报表生成器" size="4xl">
      <div className="space-y-5 p-6">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-200">
          当前提供向导式生成器：先选择常用模块生成配置，保存后可在列表中继续编辑 JSON 细节。
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="custom-builder-name" className="text-sm font-medium text-foreground">
              报表名称 *
            </label>
            <Input
              id="custom-builder-name"
              name="builderName"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：月度巡检自定义报表"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="custom-builder-description" className="text-sm font-medium text-foreground">
              报表描述
            </label>
            <Input
              id="custom-builder-description"
              name="builderDescription"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="说明该报表用途"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-4">
            <input
              type="checkbox"
              name="includeTrendChart"
              checked={includeTrendChart}
              onChange={(event) => setIncludeTrendChart(event.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="block font-medium text-foreground">巡检趋势图</span>
              <span className="text-sm text-muted-foreground">
                生成成功率/趋势类图表配置。
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-4">
            <input
              type="checkbox"
              name="includeDeviceTable"
              checked={includeDeviceTable}
              onChange={(event) => setIncludeDeviceTable(event.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="block font-medium text-foreground">设备摘要表</span>
              <span className="text-sm text-muted-foreground">
                生成设备状态、健康分等明细表格配置。
              </span>
            </span>
          </label>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium text-foreground">配置预览</div>
          <TextArea
            readOnly
            value={JSON.stringify(payloadPreview, null, 2)}
            className="min-h-[220px] font-mono text-xs"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={isSubmitting}>
            {isSubmitting ? '保存中...' : '保存配置'}
          </Button>
        </div>
      </div>
    </SimpleModal>
  )
}

export const CustomReports: React.FC<Props> = ({
  searchText,
  onSearchTextChange = () => undefined,
}) => {
  const canCreate = usePermission(Permission.REPORTS_CREATE)
  const canUpdate = usePermission(Permission.REPORTS_UPDATE)
  const canDelete = usePermission(Permission.REPORTS_DELETE)

  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [previewConfigId, setPreviewConfigId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [configModalMode, setConfigModalMode] = useState<'create' | 'edit' | 'copy' | 'import'>('create')
  const [activeConfig, setActiveConfig] = useState<CustomReportConfig | null>(null)
  const [templateImportOpen, setTemplateImportOpen] = useState(false)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState<'all' | 'template' | 'custom'>('all')

  // 使用真实 API 获取配置列表
  const {
    data: configsData,
    isLoading,
    error,
    refetch: refetchConfigs,
  } = useCustomReportConfigs()
  const {
    data: templatesData,
    isLoading: templatesLoading,
    error: templatesError,
    refetch: refetchTemplates,
  } = useReportTemplates()
  const createConfig = useCreateCustomReportConfig()
  const generateReport = useGenerateFromConfig()
  const deleteConfig = useDeleteCustomReportConfig()

  // 提取配置列表
  const customConfigs = configsData || []
  const reportTemplates = templatesData || []

  // 搜索过滤
  const normalizedKeyword = searchText.trim().toLowerCase()
  const filteredConfigs = customConfigs.filter((config) => {
    const keywordMatched =
      normalizedKeyword.length === 0 ||
      config.name.toLowerCase().includes(normalizedKeyword) ||
      config.description?.toLowerCase().includes(normalizedKeyword)

    const typeMatched = typeFilter === 'all' || config.type === typeFilter

    return keywordMatched && typeMatched
  })

  // 处理生成报表
  const handleGenerate = async (configId: string) => {
    if (!canCreate) {
      toast.error('暂无权限生成报表')
      return
    }
    try {
      setGeneratingId(configId)
      const result = await generateReport.mutateAsync({
        configId,
        parameters: {
          dateRange: {
            startDate: formatDateYMD(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
            endDate: formatDateYMD(new Date())
          },
          includeCharts: true,
          includeDetailData: false,
          includeRecommendations: true,
        },
        format: 'pdf'
      })

      try {
        const url = result?.downloadUrl || (await fetchDownloadUrl(result.id))
        if (!url) {
          toast.error('暂无可用的下载链接')
          return
        }

        const format = String(result.format || 'pdf').toLowerCase()
        const ext = format === 'excel' ? 'xlsx' : format === 'word' ? 'docx' : format
        const filename = `${result.title || 'custom-report'}.${ext}`
        await downloadWithAuth(url, filename)
        toast.success('自定义报表已生成并开始下载')
      } catch (err) {
        console.error('下载自定义报表失败:', err)
        toast.error('自定义报表生成成功，但下载失败')
      }
    } catch (error) {
      console.error('生成自定义报表失败:', error)
      // toast 由 mutation hook onError 统一处理
    } finally {
      setGeneratingId(null)
    }
  }

  // 处理编辑配置
  const handleEdit = (config: CustomReportConfig) => {
    if (!canUpdate) {
      toast.error('暂无权限编辑配置')
      return
    }
    setActiveConfig(config)
    setConfigModalMode('edit')
    setConfigModalOpen(true)
  }

  // 处理复制配置
  const handleCopy = (config: CustomReportConfig) => {
    if (!canCreate) {
      toast.error('暂无权限复制配置')
      return
    }
    setActiveConfig(config)
    setConfigModalMode('copy')
    setConfigModalOpen(true)
  }

  // 处理创建新配置
  const handleCreate = () => {
    if (!canCreate) {
      toast.error('暂无权限创建配置')
      return
    }
    setActiveConfig(null)
    setConfigModalMode('create')
    setConfigModalOpen(true)
  }

  // 处理导入模板
  const handleImport = () => {
    if (!canCreate) {
      toast.error('暂无权限导入模板')
      return
    }
    setTemplateImportOpen(true)
  }

  // 处理预览配置
  const handlePreview = (configId: string) => {
    setPreviewConfigId(configId)
  }

  const handleImportTemplate = async (template: ReportTemplate) => {
    try {
      await createConfig.mutateAsync(buildConfigPayloadFromTemplate(template) as Omit<CustomReportConfig, 'id'>)
      setTemplateImportOpen(false)
    } catch (error) {
      console.error('导入报表模板失败:', error)
    }
  }

  const handleSaveBuilderConfig = async (payload: Omit<CustomReportConfig, 'id'>) => {
    try {
      await createConfig.mutateAsync(payload)
      setBuilderOpen(false)
    } catch (error) {
      console.error('保存生成器配置失败:', error)
    }
  }

  const handleOpenBuilder = () => {
    if (!canCreate) {
      toast.error('暂无权限创建配置')
      return
    }
    setBuilderOpen(true)
  }

  const handleRefresh = () => {
    void refetchConfigs()
    void refetchTemplates()
    toast.success('配置列表已刷新')
  }

  const toolbar = (
    <ReportsToolbar
      search={{
        value: searchText,
        placeholder: '搜索配置名称、描述...',
        ariaLabel: '搜索自定义报表',
        onChange: onSearchTextChange,
      }}
      filters={(
        <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as typeof typeFilter)}>
          <SelectTrigger className="h-9 w-[110px] text-sm" aria-label="筛选配置类型">
            <SelectValue placeholder="配置类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            <SelectItem value="custom">自定义</SelectItem>
            <SelectItem value="template">模板</SelectItem>
          </SelectContent>
        </Select>
      )}
      secondaryActions={[
        {
          key: 'refresh-configs',
          label: '刷新',
          icon: <RefreshCw className="mr-2 h-4 w-4" />,
          onClick: handleRefresh,
        },
      ]}
      primaryActions={
        canCreate
          ? [
              {
                key: 'import-template',
                label: '导入模板',
                icon: <Copy className="mr-2 h-4 w-4" />,
                variant: 'outline',
                onClick: handleImport,
              },
              {
                key: 'open-builder',
                label: '进入生成器',
                icon: <Wand2 className="mr-2 h-4 w-4" />,
                variant: 'outline',
                onClick: handleOpenBuilder,
              },
              {
                key: 'create-config',
                label: '创建自定义报表',
                icon: <Plus className="mr-2 h-4 w-4" />,
                onClick: handleCreate,
              },
            ]
          : []
      }
    />
  )

  const modals = (
    <>
      {/* 报表预览模态框 */}
      {previewConfigId !== null && (
        <ConfigPreviewModal
          configId={previewConfigId}
          parameters={{
            dateRange: {
              startDate: formatDateYMD(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
              endDate: formatDateYMD(new Date())
            },
            includeCharts: true,
            includeDetailData: false,
            includeRecommendations: true,
          }}
          onClose={() => setPreviewConfigId(null)}
          onGenerate={canCreate ? () => {
            if (previewConfigId) handleGenerate(previewConfigId)
            setPreviewConfigId(null)
          } : undefined}
        />
      )}

      {/* 配置管理模态框 */}
      <CustomReportConfigModal
        isOpen={configModalOpen}
        mode={configModalMode}
        initialConfig={activeConfig}
        onClose={() => {
          setConfigModalOpen(false)
          setActiveConfig(null)
        }}
      />

      <TemplateImportModal
        open={templateImportOpen}
        onClose={() => setTemplateImportOpen(false)}
        templates={reportTemplates}
        isLoading={templatesLoading}
        error={templatesError}
        isSubmitting={createConfig.isPending}
        onImport={handleImportTemplate}
      />

      <BuilderModal
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        isSubmitting={createConfig.isPending}
        onSave={handleSaveBuilderConfig}
      />

      {/* 删除确认 */}
      <ConfirmModal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={async () => {
          if (!canDelete) {
            toast.error('暂无权限删除配置')
            return
          }
          if (!deleteConfirmId) return
          await deleteConfig.mutateAsync(deleteConfirmId)
          setDeleteConfirmId(null)
        }}
        title="删除自定义配置"
        description="确定要删除该自定义报表配置吗？此操作无法撤销。"
        confirmText="删除"
        cancelText="取消"
        variant="destructive"
        confirmDisabled={!canDelete}
      />
    </>
  )

  // 加载状态
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loading />
        <span className="ml-2 text-muted-foreground">加载配置中...</span>
      </div>
    )
  }

  // 错误状态
  if (error) {
    const message = error instanceof Error ? error.message : String(error || '未知错误')
    return (
      <div className="flex items-center justify-center py-12">
        <AlertCircle className="w-6 h-6 text-red-500 dark:text-red-400 mr-2" />
        <span className="text-red-600 dark:text-red-400">加载配置失败: {message}</span>
      </div>
    )
  }

  // 空状态
  if (customConfigs.length === 0) {
    return (
      <div className="space-y-6">
        {toolbar}
        {!canCreate && (
          <div className="text-sm text-muted-foreground">
            当前账号暂无创建/导入自定义报表配置权限，请联系管理员开通。
          </div>
        )}
        <div className="bg-muted/40 rounded-lg p-8 text-center">
          <Settings className="w-12 h-12 text-muted-foreground/80 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">暂无报表配置</h3>
          <p className="text-muted-foreground mb-4">
            创建您的第一个自定义报表配置，或从模板库导入。
          </p>
        </div>
        {modals}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {toolbar}
      {!canCreate && (
        <div className="text-sm text-muted-foreground">
          当前账号暂无创建/导入自定义报表配置权限，请联系管理员开通。
        </div>
      )}

      {/* 自定义报表配置列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredConfigs.map((config) => (
          <Card key={config.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    {config.name}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{config.description}</p>
                </div>
                <Badge variant={config.type === 'template' ? 'primary' : 'secondary'}>
                  {config.type === 'template' ? '模板' : '自定义'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">最后使用：</span>
                  <span>{config.lastUsed || '从未使用'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">使用次数：</span>
                  <span>{config.usageCount || 0} 次</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handlePreview(config.id)}
                    title="预览报表数据"
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  {canCreate && (
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => handleGenerate(config.id)}
                      disabled={generatingId === config.id}
                    >
                      {generatingId === config.id ? (
                        <>
                          <Loading size="sm" className="mr-2" />
                          生成中...
                        </>
                      ) : (
                        '生成报表'
                      )}
                    </Button>
                  )}
                  {canUpdate && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(config)}
                      disabled={config.isDefault}
                      title={config.isDefault ? '默认模板不可编辑' : '编辑配置'}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                  )}
                  {canCreate && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopy(config)}
                      title="复制配置"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDeleteConfirmId(config.id)}
                      disabled={config.isDefault}
                      title={config.isDefault ? '默认模板不可删除' : '删除配置'}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 无搜索结果 */}
      {filteredConfigs.length === 0 && customConfigs.length > 0 && (
        <div className="bg-muted/40 rounded-lg p-8 text-center">
          <p className="text-muted-foreground">
            当前筛选条件下没有匹配的配置
          </p>
        </div>
      )}

      {/* 报表生成器 */}
      <Card>
        <CardHeader>
          <CardTitle>报表生成器入口</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/40 rounded-lg p-8 text-center">
            <Settings className="w-12 h-12 text-muted-foreground/80 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">报表生成器</h3>
            <p className="text-muted-foreground mb-4">
              使用向导快速生成常用自定义报表配置，保存后可继续编辑 JSON 细节。
            </p>
            <Button onClick={handleOpenBuilder}>进入生成器</Button>
          </div>
        </CardContent>
      </Card>

      {modals}
    </div>
  )
}
