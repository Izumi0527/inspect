/**
 * 快速创建模板组件
 *
 * 预设即后端内置模板（交换机 / 路由器 / 防火墙 / 服务器巡检）：选一个、改个名，
 * 经复制接口生成自建模板。
 */

import React, { useState } from 'react'
import {
  Network,
  Router,
  Shield,
  Server,
  FileText,
  Plus,
  Zap,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react'
import {
  Button,
  SimpleInput as Input,
  Badge,
  Card,
  CardContent,
} from '@/components/atoms'
import { SimpleModal } from '@/components/atoms/modal'
import { cn } from '@/utils/cn'
import { getDeviceTypeLabel } from '@/utils/deviceTypes'
import { useCloneTemplate, useInspectionTemplates } from '../hooks/useInspection'
import type { InspectionTemplate } from '../types'

interface Props {
  onClose: () => void
  onSuccess: () => void
  onAdvanced?: () => void
}

const DEVICE_TYPE_VISUAL: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; chipClass: string }
> = {
  switch: { icon: Network, chipClass: 'bg-info-soft text-info-soft-foreground' },
  router: { icon: Router, chipClass: 'bg-success-soft text-success-soft-foreground' },
  firewall: { icon: Shield, chipClass: 'bg-warning-soft text-warning-soft-foreground' },
  server: { icon: Server, chipClass: 'bg-primary/10 text-primary' },
}

const FALLBACK_VISUAL = {
  icon: FileText,
  chipClass: 'bg-surface-2 text-muted-foreground',
}

const visualOf = (template: InspectionTemplate) =>
  DEVICE_TYPE_VISUAL[template.deviceTypes[0] ?? ''] ?? FALLBACK_VISUAL

export const QuickTemplateCreate: React.FC<Props> = ({
  onClose,
  onSuccess,
  onAdvanced,
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<InspectionTemplate | null>(null)
  const [customName, setCustomName] = useState('')
  const [step, setStep] = useState<'select' | 'customize'>('select')

  const { data: builtInData, isLoading } = useInspectionTemplates({
    isBuiltIn: true,
    pageSize: 100,
  })
  const builtInTemplates = builtInData?.templates ?? []
  const cloneTemplate = useCloneTemplate()

  const handleSelectTemplate = (template: InspectionTemplate) => {
    setSelectedTemplate(template)
    setCustomName(`${template.name}（副本）`)
    setStep('customize')
  }

  const handleCreate = async () => {
    if (!selectedTemplate) return

    try {
      await cloneTemplate.mutateAsync({
        id: selectedTemplate.id,
        name: customName.trim(),
      })
      onSuccess()
    } catch (cloneError) {
      console.error('Create template failed:', cloneError)
    }
  }

  const selectedVisual = selectedTemplate ? visualOf(selectedTemplate) : FALLBACK_VISUAL

  return (
    <SimpleModal
      open
      onClose={() => {
        if (!cloneTemplate.isPending) {
          onClose()
        }
      }}
      ariaLabel="快速创建模板"
      size="2xl"
    >
      <div className="flex flex-col gap-5">
        {/* 头部 */}
        <div className="flex items-center gap-3 border-b border-border pb-4 pr-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info-soft-foreground">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">快速创建模板</h2>
            <p className="text-sm text-muted-foreground">
              基于内置模板复制一份，再按需调整
            </p>
          </div>
        </div>

        {/* 内容 */}
        <div className="max-h-[calc(100vh-18rem)] overflow-y-auto pr-1">
          {step === 'select' ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                选择一个内置模板作为起点，或点击下方按钮从空白开始创建
              </p>

              <div className="grid gap-3">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground">加载中...</p>
                ) : builtInTemplates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无内置模板</p>
                ) : (
                  builtInTemplates.map((template) => {
                    const visual = visualOf(template)
                    const Icon = visual.icon
                    return (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => handleSelectTemplate(template)}
                        className="flex items-center gap-4 p-4 border border-border rounded-lg bg-card hover:border-primary/60 hover:bg-surface-2/70 transition-colors text-left group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        <div className={cn('p-3 rounded-lg shrink-0', visual.chipClass)}>
                          <Icon className="w-6 h-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-foreground">{template.name}</h4>
                          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                            {template.description}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <Badge variant="outline" size="sm">
                              {template.checkItems.length} 个检查项
                            </Badge>
                            {template.deviceTypes.map((type) => (
                              <Badge key={type} variant="secondary" size="sm">
                                {getDeviceTypeLabel(type)}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                      </button>
                    )
                  })
                )}
              </div>

              {onAdvanced && (
                <div className="pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={onAdvanced}
                    className="w-full flex items-center justify-center gap-2 p-2.5 text-sm font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>创建自定义模板（高级模式）</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <button
                type="button"
                onClick={() => setStep('select')}
                disabled={cloneTemplate.isPending}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>返回选择</span>
              </button>

              {selectedTemplate && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className={cn('p-3 rounded-lg shrink-0', selectedVisual.chipClass)}>
                        {React.createElement(selectedVisual.icon, {
                          className: 'w-6 h-6',
                        })}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-foreground">{selectedTemplate.name}</h4>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {selectedTemplate.description}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {selectedTemplate.checkItems.map((item) => (
                            <Badge key={item.id} variant="outline" size="sm">
                              {item.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div>
                <label
                  htmlFor="quick-template-name"
                  className="block text-sm font-medium text-foreground mb-1.5"
                >
                  模板名称
                </label>
                <Input
                  id="quick-template-name"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="输入模板名称"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  创建后可在模板列表中编辑检查项与阈值；适用设备类型与所选内置模板一致
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={cloneTemplate.isPending}
            className="cursor-pointer"
          >
            取消
          </Button>
          {step === 'customize' && (
            <Button
              type="button"
              onClick={handleCreate}
              disabled={cloneTemplate.isPending || !customName.trim()}
              className="cursor-pointer"
            >
              {cloneTemplate.isPending ? '创建中...' : '创建模板'}
            </Button>
          )}
        </div>
      </div>
    </SimpleModal>
  )
}
