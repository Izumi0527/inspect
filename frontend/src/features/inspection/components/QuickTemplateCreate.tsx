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

// 预设模板配置
const QUICK_TEMPLATES = [
  {
    id: 'network-basic',
    name: '网络设备基础巡检',
    category: 'network' as TemplateCategory,
    description: '包含 CPU、内存、接口状态等基础检查项',
    deviceTypes: ['router', 'switch'],
    checkItems: [
      { id: '1', name: 'CPU 使用率', type: 'snmp' as const, weight: 3, config: { oid: '1.3.6.1.4.1.9.9.109.1.1.1.1.3.1', threshold: { warning: 70, critical: 90 } } },
      { id: '2', name: '内存使用率', type: 'snmp' as const, weight: 3, config: { oid: '1.3.6.1.4.1.9.9.48.1.1.1.6.1', threshold: { warning: 80, critical: 95 } } },
      { id: '3', name: '系统运行时间', type: 'snmp' as const, weight: 1, config: { oid: '1.3.6.1.2.1.1.3.0' } },
      { id: '4', name: '接口状态', type: 'snmp' as const, weight: 2, config: { oid: '1.3.6.1.2.1.2.2.1.8' } }
    ],
    icon: Monitor,
    color: 'blue'
  },
  {
    id: 'firewall-security',
    name: '防火墙安全巡检',
    category: 'security' as TemplateCategory,
    description: '检查防火墙状态、ACL 配置、登录尝试等',
    deviceTypes: ['firewall'],
    checkItems: [
      { id: '1', name: '防火墙状态', type: 'ssh' as const, weight: 3, config: { command: 'show firewall status' } },
      { id: '2', name: 'ACL 配置', type: 'ssh' as const, weight: 2, config: { command: 'show access-lists' } },
      { id: '3', name: '登录尝试', type: 'ssh' as const, weight: 2, config: { command: 'show login failures' } },
      { id: '4', name: '会话统计', type: 'ssh' as const, weight: 1, config: { command: 'show session info' } }
    ],
    icon: Shield,
    color: 'red'
  },
  {
    id: 'server-system',
    name: '服务器系统巡检',
    category: 'system' as TemplateCategory,
    description: '检查服务器 CPU、内存、磁盘使用情况',
    deviceTypes: ['server'],
    checkItems: [
      { id: '1', name: 'CPU 负载', type: 'ssh' as const, weight: 3, config: { command: 'top -bn1 | grep "Cpu(s)"', threshold: { warning: 70, critical: 90 } } },
      { id: '2', name: '内存使用', type: 'ssh' as const, weight: 3, config: { command: 'free -m', threshold: { warning: 80, critical: 95 } } },
      { id: '3', name: '磁盘使用', type: 'ssh' as const, weight: 2, config: { command: 'df -h', threshold: { warning: 80, critical: 90 } } },
      { id: '4', name: '进程状态', type: 'ssh' as const, weight: 1, config: { command: 'ps aux | head -20' } }
    ],
    icon: Settings,
    color: 'green'
  }
]

export const QuickTemplateCreate: React.FC<Props> = ({ onClose, onSuccess, onAdvanced }) => {
  const [selectedTemplate, setSelectedTemplate] = useState<typeof QUICK_TEMPLATES[0] | null>(null)
  const [customName, setCustomName] = useState('')
  const [step, setStep] = useState<'select' | 'customize'>('select')

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
                  return (
                    <button
                      key={template.id}
                      onClick={() => handleSelectTemplate(template)}
                      className="flex items-center gap-4 p-4 border border-border rounded-xl hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all text-left group"
                    >
                      <div className={`p-3 rounded-xl bg-${template.color}-100 dark:bg-${template.color}-900/30`}>
                        <Icon className={`w-6 h-6 text-${template.color}-600`} />
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
                      <div className={`p-3 rounded-xl bg-${selectedTemplate.color}-100 dark:bg-${selectedTemplate.color}-900/30`}>
                        {React.createElement(selectedTemplate.icon, {
                          className: `w-6 h-6 text-${selectedTemplate.color}-600`
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
