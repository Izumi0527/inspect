/**
 * 快速创建模板组件
 * 提供简化的模板创建流程，适用于快速创建简单模板
 */

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  X,
  Monitor,
  Settings,
  Shield,
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
import { useCreateTemplate } from '../hooks/useInspection'
import type { TemplateCategory } from '../types'

interface Props {
  onClose: () => void
  onSuccess: () => void
  onAdvanced?: () => void // 切换到高级模式
}

// Tailwind 动态拼接 class 在生产构建可能被裁剪，这里用静态映射确保样式稳定
const TEMPLATE_COLOR_CLASS = {
  blue: { bg: 'bg-blue-100 dark:bg-blue-900/30', text600: 'text-blue-600' },
  green: { bg: 'bg-green-100 dark:bg-green-900/30', text600: 'text-green-600' },
  red: { bg: 'bg-red-100 dark:bg-red-900/30', text600: 'text-red-600' },
  gray: { bg: 'bg-gray-100 dark:bg-gray-900/30', text600: 'text-gray-600' }
} as const

type TemplateColor = keyof typeof TEMPLATE_COLOR_CLASS

const getTemplateColorClass = (color?: string) => {
  if (!color) return TEMPLATE_COLOR_CLASS.gray
  return TEMPLATE_COLOR_CLASS[color as TemplateColor] ?? TEMPLATE_COLOR_CLASS.gray
}

// 预设模板配置
const QUICK_TEMPLATES = [
  {
    id: 'connectivity',
    name: '连通性巡检',
    category: 'network' as TemplateCategory,
    description: '仅核对设备在线状态：ICMP 连通性 + SNMP 服务可达',
    deviceTypes: ['router', 'switch', 'firewall', 'server'],
    checkItems: [
      { id: '1', name: '设备连通性', type: 'ping' as const, metric: '', weight: 8, config: {} },
      { id: '2', name: 'SNMP 服务可达', type: 'snmp' as const, metric: 'reachable', weight: 6, config: {} }
    ],
    icon: Monitor,
    color: 'gray'
  },
  {
    id: 'basic-health',
    name: '基础健康巡检',
    category: 'network' as TemplateCategory,
    description: '连通性 + CPU + 内存，覆盖设备核心健康指标',
    deviceTypes: ['router', 'switch', 'firewall', 'server'],
    checkItems: [
      { id: '1', name: '设备连通性', type: 'ping' as const, metric: '', weight: 8, config: {} },
      { id: '2', name: 'SNMP 服务可达', type: 'snmp' as const, metric: 'reachable', weight: 6, config: {} },
      { id: '3', name: 'CPU 使用率', type: 'snmp' as const, metric: 'cpu', weight: 10, config: { threshold: { warning: 70, critical: 85 } } },
      { id: '4', name: '内存使用率', type: 'snmp' as const, metric: 'memory', weight: 10, config: { threshold: { warning: 75, critical: 90 } } }
    ],
    icon: Settings,
    color: 'blue'
  },
  {
    id: 'standard',
    name: '标准巡检',
    category: 'network' as TemplateCategory,
    description: '基础健康 + 温度 + 运行时间 + 接口状态与利用率，适合日常例行巡检',
    deviceTypes: ['router', 'switch', 'firewall', 'server'],
    checkItems: [
      { id: '1', name: '设备连通性', type: 'ping' as const, metric: '', weight: 8, config: {} },
      { id: '2', name: 'SNMP 服务可达', type: 'snmp' as const, metric: 'reachable', weight: 6, config: {} },
      { id: '3', name: 'CPU 使用率', type: 'snmp' as const, metric: 'cpu', weight: 10, config: { threshold: { warning: 70, critical: 85 } } },
      { id: '4', name: '内存使用率', type: 'snmp' as const, metric: 'memory', weight: 10, config: { threshold: { warning: 75, critical: 90 } } },
      { id: '5', name: '设备温度', type: 'snmp' as const, metric: 'temperature', weight: 7, config: { threshold: { warning: 60, critical: 75 } } },
      { id: '6', name: '系统运行时间', type: 'snmp' as const, metric: 'uptime', weight: 4, config: {} },
      { id: '7', name: '接口状态', type: 'snmp' as const, metric: 'interface', weight: 9, config: {} },
      { id: '8', name: '接口利用率', type: 'snmp' as const, metric: 'interface_utilization', weight: 8, config: { threshold: { warning: 70, critical: 90 } } }
    ],
    icon: Shield,
    color: 'green'
  },
  {
    id: 'full',
    name: '全面巡检',
    category: 'network' as TemplateCategory,
    description: '标准巡检 + 带宽吞吐量，覆盖全部可采集维度',
    deviceTypes: ['router', 'switch', 'firewall', 'server'],
    checkItems: [
      { id: '1', name: '设备连通性', type: 'ping' as const, metric: '', weight: 8, config: {} },
      { id: '2', name: 'SNMP 服务可达', type: 'snmp' as const, metric: 'reachable', weight: 6, config: {} },
      { id: '3', name: 'CPU 使用率', type: 'snmp' as const, metric: 'cpu', weight: 10, config: { threshold: { warning: 70, critical: 85 } } },
      { id: '4', name: '内存使用率', type: 'snmp' as const, metric: 'memory', weight: 10, config: { threshold: { warning: 75, critical: 90 } } },
      { id: '5', name: '设备温度', type: 'snmp' as const, metric: 'temperature', weight: 7, config: { threshold: { warning: 60, critical: 75 } } },
      { id: '6', name: '系统运行时间', type: 'snmp' as const, metric: 'uptime', weight: 4, config: {} },
      { id: '7', name: '接口状态', type: 'snmp' as const, metric: 'interface', weight: 9, config: {} },
      { id: '8', name: '接口利用率', type: 'snmp' as const, metric: 'interface_utilization', weight: 8, config: { threshold: { warning: 70, critical: 90 } } },
      { id: '9', name: '带宽吞吐量', type: 'snmp' as const, metric: 'bandwidth', weight: 7, config: {} }
    ],
    icon: Zap,
    color: 'red'
  }
]

export const QuickTemplateCreate: React.FC<Props> = ({ onClose, onSuccess, onAdvanced }) => {
  const [selectedTemplate, setSelectedTemplate] = useState<typeof QUICK_TEMPLATES[0] | null>(null)
  const [customName, setCustomName] = useState('')
  const [step, setStep] = useState<'select' | 'customize'>('select')
  const selectedColorClass = getTemplateColorClass(selectedTemplate?.color)

  const createTemplate = useCreateTemplate()

  const handleSelectTemplate = (template: typeof QUICK_TEMPLATES[0]) => {
    setSelectedTemplate(template)
    setCustomName(template.name)
    setStep('customize')
  }

  const handleCreate = async () => {
    if (!selectedTemplate) return

    try {
      await createTemplate.mutateAsync({
        name: customName || selectedTemplate.name,
        description: selectedTemplate.description,
        category: selectedTemplate.category,
        deviceTypes: selectedTemplate.deviceTypes,
        checkItems: selectedTemplate.checkItems.map((item, index) => ({
          ...item,
          id: `item-${Date.now()}-${index}`
        })),
        isActive: true
      })
      onSuccess()
    } catch (error) {
      console.error('Create template failed:', error)
    }
  }

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
                选择预设模板快速开始
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
                选择一个预设模板，或点击下方按钮创建自定义模板
              </p>

              <div className="grid gap-3">
                {QUICK_TEMPLATES.map((template) => {
                  const Icon = template.icon
                  const colorClass = getTemplateColorClass(template.color)
                  return (
                    <button
                      key={template.id}
                      onClick={() => handleSelectTemplate(template)}
                      className="flex items-center gap-4 p-4 border border-border rounded-xl hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all text-left group"
                    >
                      <div className={`p-3 rounded-xl ${colorClass.bg}`}>
                        <Icon className={`w-6 h-6 ${colorClass.text600}`} />
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
                              {type}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
                    </button>
                  )
                })}
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
                      <div className={`p-3 rounded-xl ${selectedColorClass.bg}`}>
                        {React.createElement(selectedTemplate.icon, {
                          className: `w-6 h-6 ${selectedColorClass.text600}`
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
                  您可以自定义模板名称，或使用默认名称
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
              disabled={createTemplate.isPending || !customName.trim()}
            >
              {createTemplate.isPending ? '创建中...' : '创建模板'}
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  )
}
