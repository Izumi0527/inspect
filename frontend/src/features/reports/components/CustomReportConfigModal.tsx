import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Button, SimpleInput as Input, SimpleModal, TextArea } from '@/components/atoms'
import { useCreateCustomReportConfig, useUpdateCustomReportConfig } from '../hooks/useReports'
import type { CustomReportConfig } from '../types'

type ConfigModalMode = 'create' | 'edit' | 'copy' | 'import'

interface Props {
  isOpen: boolean
  mode: ConfigModalMode
  initialConfig?: unknown
  onClose: () => void
}

const buildDefaultConfigText = () =>
  JSON.stringify(
    {
      template: {
        name: '自定义模板',
        type: 'custom',
        sections: [],
        styles: {},
      },
      parameters: {
        dateRange: { startDate: '', endDate: '' },
        includeCharts: true,
        includeDetailData: false,
        includeRecommendations: true,
      },
      charts: [],
      tables: [],
      filters: [],
      layout: {
        columns: 2,
        sections: [],
      },
    },
    null,
    2
  )

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

const buildConfigTextFromInitial = (initial: unknown) => {
  const rec = toRecord(initial)
  return JSON.stringify(
    {
      template: rec.template ?? {},
      parameters: rec.parameters ?? {},
      charts: rec.charts ?? [],
      tables: rec.tables ?? [],
      filters: rec.filters ?? [],
      layout: rec.layout ?? { columns: 2, sections: [] },
    },
    null,
    2
  )
}

export const CustomReportConfigModal: React.FC<Props> = ({
  isOpen,
  mode,
  initialConfig,
  onClose,
}) => {
  const createMutation = useCreateCustomReportConfig()
  const updateMutation = useUpdateCustomReportConfig()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [configText, setConfigText] = useState(buildDefaultConfigText())
  const [configError, setConfigError] = useState<string | null>(null)

  const title = useMemo(() => {
    switch (mode) {
      case 'create':
        return '创建自定义报表配置'
      case 'edit':
        return '编辑自定义报表配置'
      case 'copy':
        return '复制自定义报表配置'
      case 'import':
        return '导入自定义报表配置'
      default:
        return '自定义报表配置'
    }
  }, [mode])

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  useEffect(() => {
    if (!isOpen) return

    setConfigError(null)

    if (mode === 'edit' || mode === 'copy') {
      const initialRec = toRecord(initialConfig)
      const nextName =
        mode === 'copy' ? `${String(initialRec.name || '未命名配置')}（副本）` : String(initialRec.name || '')
      setName(nextName)
      setDescription(String(initialRec.description || ''))
      setConfigText(buildConfigTextFromInitial(initialConfig))
      return
    }

    // create / import
    setName('')
    setDescription('')
    setConfigText(buildDefaultConfigText())
  }, [initialConfig, isOpen, mode])

  const handleSubmit = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error('请填写配置名称')
      return
    }

    let parsedConfig: Record<string, unknown> = {}
    const rawText = String(configText || '').trim()
    if (rawText) {
      try {
        parsedConfig = toRecord(JSON.parse(rawText))
      } catch {
        setConfigError('配置 JSON 解析失败，请检查格式是否正确')
        return
      }
    }

    // 用户编辑的宽松 JSON 结构按约定形状提交，统一断言为配置类型（后端做最终校验）
    const payload = {
      name: trimmedName,
      description: description.trim(),
      template: parsedConfig.template ?? {},
      parameters: parsedConfig.parameters ?? {},
      charts: Array.isArray(parsedConfig.charts) ? parsedConfig.charts : [],
      tables: Array.isArray(parsedConfig.tables) ? parsedConfig.tables : [],
      filters: Array.isArray(parsedConfig.filters) ? parsedConfig.filters : [],
      layout: parsedConfig.layout ?? { columns: 2, sections: [] },
    } as Omit<CustomReportConfig, 'id'>

    try {
      if (mode === 'edit') {
        const configId = String(toRecord(initialConfig).id || '').trim()
        if (!configId) {
          toast.error('缺少配置 ID，无法更新')
          return
        }

        await updateMutation.mutateAsync({ id: configId, updates: payload })
      } else {
        // create / copy / import
        await createMutation.mutateAsync(payload)
      }

      onClose()
    } catch (e) {
      // toast 已在 hook 内统一处理，这里不重复提示
      console.error('保存配置失败:', e)
    }
  }

  return (
    <SimpleModal open={isOpen} onClose={onClose} title={title} size="4xl">
      <div className="space-y-4 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label
              htmlFor="custom-report-config-name"
              className="text-sm font-medium text-foreground"
            >
              名称 *
            </label>
            <Input
              id="custom-report-config-name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：月度运营摘要"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="custom-report-config-description"
              className="text-sm font-medium text-foreground"
            >
              描述
            </label>
            <Input
              id="custom-report-config-description"
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="可选：用于说明该配置的用途"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="custom-report-config-json"
            className="text-sm font-medium text-foreground"
          >
            配置 JSON
          </label>
          <TextArea
            id="custom-report-config-json"
            name="configText"
            value={configText}
            onChange={(e) => {
              setConfigText(e.target.value)
              if (configError) setConfigError(null)
            }}
            className="font-mono text-xs min-h-[260px]"
            placeholder="请填写/粘贴 JSON（template/parameters/charts/tables/filters/layout）"
          />
          {configError && (
            <div className="text-sm text-red-600 dark:text-red-400">
              {configError}
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            提示：当前预览/生成主要用于“配置摘要版”闭环；后续可扩展为按配置动态取数渲染。
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>
    </SimpleModal>
  )
}
