/**
 * 快速创建模板组件
 *
 * 预设即后端内置模板（交换机 / 路由器 / 防火墙 / 服务器巡检）：选一个、改个名，
 * 经复制接口生成自建模板。前端不再硬编码预设检查项，内置模板新增检查项时这里无需同步。
 */

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  X,
  Network,
  Router,
  Shield,
  Server,
  FileText,
  Plus,
  Zap,
  ChevronRight
} from 'lucide-react'
import {
  Button,
  SimpleInput as Input,
  Badge,
  Card,
  CardContent
} from '@/components/atoms'
import { getDeviceTypeLabel } from '@/utils/deviceTypes'
import { useCloneTemplate, useInspectionTemplates } from '../hooks/useInspection'
import type { InspectionTemplate } from '../types'

interface Props {
  onClose: () => void
  onSuccess: () => void
  onAdvanced?: () => void // 切换到高级模式
}

// Tailwind 动态拼接 class 在生产构建可能被裁剪，这里用静态映射确保样式稳定
const DEVICE_TYPE_VISUAL: Record<string, { icon: React.ComponentType<{ className?: string }>; bg: string; text: string }> = {
  switch: { icon: Network, bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-600' },
  router: { icon: Router, bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-600' },
  firewall: { icon: Shield, bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-600' },
  server: { icon: Server, bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-600' },
}
const FALLBACK_VISUAL = { icon: FileText, bg: 'bg-gray-100 dark:bg-gray-900/30', text: 'text-gray-600' }

const visualOf = (template: InspectionTemplate) => DEVICE_TYPE_VISUAL[template.deviceTypes[0] ?? ''] ?? FALLBACK_VISUAL

export const QuickTemplateCreate: React.FC<Props> = ({ onClose, onSuccess, onAdvanced }) => {
  const [selectedTemplate, setSelectedTemplate] = useState<InspectionTemplate | null>(null)
  const [customName, setCustomName] = useState('')
  const [step, setStep] = useState<'select' | 'customize'>('select')

  const { data: builtInData, isLoading } = useInspectionTemplates({ isBuiltIn: true, pageSize: 100 })
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
      await cloneTemplate.mutateAsync({ id: selectedTemplate.id, name: customName.trim() })
      onSuccess()
    } catch (error) {
      console.error('Create template failed:', error)
    }
  }

  const selectedVisual = selectedTemplate ? visualOf(selectedTemplate) : FALLBACK_VISUAL

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Zap className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                快速创建模板
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                基于内置模板复制一份，再按需调整
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* 内容 */}
        <div className="p-6">
          {step === 'select' ? (
            <div className="space-y-4">
              <p className="text-muted-foreground mb-4">
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
                        onClick={() => handleSelectTemplate(template)}
                        className="flex items-center gap-4 p-4 border border-border rounded-xl hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all text-left group"
                      >
                        <div className={`p-3 rounded-xl ${visual.bg}`}>
                          <Icon className={`w-6 h-6 ${visual.text}`} />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-foreground">
                            {template.name}
                          </h4>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                            {template.description}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline" size="sm">
                              {template.checkItems.length} 个检查项
                            </Badge>
                            {template.deviceTypes.map(type => (
                              <Badge key={type} variant="secondary" size="sm">
                                {getDeviceTypeLabel(type)}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
                      </button>
                    )
                  })
                )}
              </div>

              {/* 高级模式入口 */}
              {onAdvanced && (
                <div className="pt-4 border-t dark:border-gray-700">
                  <button
                    onClick={onAdvanced}
                    className="w-full flex items-center justify-center gap-2 p-3 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>创建自定义模板（高级模式）</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* 返回按钮 */}
              <button
                onClick={() => setStep('select')}
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                ← 返回选择
              </button>

              {/* 预览选中的模板 */}
              {selectedTemplate && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-xl ${selectedVisual.bg}`}>
                        {React.createElement(selectedVisual.icon, {
                          className: `w-6 h-6 ${selectedVisual.text}`
                        })}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {selectedTemplate.description}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
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

              {/* 自定义名称 */}
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  模板名称
                </label>
                <Input
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="输入模板名称"
                />
                <p className="text-xs text-gray-500 mt-1">
                  创建后可在模板列表中编辑检查项与阈值；适用设备类型与所选内置模板一致
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t dark:border-gray-700 bg-muted/40/50">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          {step === 'customize' && (
            <Button
              onClick={handleCreate}
              disabled={cloneTemplate.isPending || !customName.trim()}
            >
              {cloneTemplate.isPending ? '创建中...' : '创建模板'}
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  )
}
