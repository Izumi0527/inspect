import React from 'react'
import { motion } from 'framer-motion'
import { X, FileText, Monitor, Settings, Shield, Edit, Calendar, Tag } from 'lucide-react'
import {
  Button,
  Badge,
  Card,
  CardContent
} from '@/components/atoms'
import { isCheckItemTypeSupported } from '../utils/check-item-support'
import { formatDateTimeYMDHMS } from '@/utils/formatters'
import type { InspectionTemplate } from '../types'

interface Props {
  template: InspectionTemplate
  onClose: () => void
  onEdit?: () => void
}

export const TemplateDetailModal: React.FC<Props> = ({ template, onClose, onEdit }) => {
  const getCategoryIcon = (category?: string) => {
    switch (category) {
      case 'network':
        return <Monitor className="w-5 h-5 text-blue-600" />
      case 'system':
        return <Settings className="w-5 h-5 text-green-600" />
      case 'security':
        return <Shield className="w-5 h-5 text-red-600" />
      default:
        return <FileText className="w-5 h-5 text-purple-600" />
    }
  }

  const getCategoryLabel = (category?: string) => {
    const labels: Record<string, string> = {
      network: '网络监控',
      system: '系统检查',
      security: '安全检测',
      custom: '自定义'
    }
    return labels[category || ''] || category || '未分类'
  }

  const getCategoryBadgeVariant = (category?: string) => {
    switch (category) {
      case 'network':
        return 'primary' as const
      case 'system':
        return 'secondary' as const
      case 'security':
        return 'warning' as const
      default:
        return 'outline' as const
    }
  }

  const getCheckTypeLabel = (type?: string) => {
    const labels: Record<string, string> = {
      snmp: 'SNMP检查',
      ssh: 'SSH命令',
      http: 'HTTP请求',
      ping: 'Ping测试',
      script: '脚本执行'
    }
    return labels[type || ''] || type || '未知'
  }

  const getCheckTypeBadgeVariant = (type?: string) => {
    switch (type) {
      case 'snmp':
        return 'primary' as const
      case 'ssh':
        return 'secondary' as const
      case 'http':
        return 'success' as const
      case 'ping':
        return 'warning' as const
      default:
        return 'outline' as const
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-900/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card rounded-xl shadow-2xl w-full max-w-6xl max-h-[85vh] overflow-hidden flex flex-col"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-gray-800 dark:to-gray-800">
          <div className="flex items-center gap-3">
            {getCategoryIcon(template.category)}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-foreground">{template.name}</h2>
                {template.isBuiltIn && (
                  <Badge variant="success" size="sm">内置模板</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {template.description || '暂无描述'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onEdit && !template.isBuiltIn && (
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Edit className="w-4 h-4 mr-1" />
                编辑
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* 内容区 - 横向两栏布局 */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:flex-1 lg:min-h-0 lg:grid-rows-[minmax(0,1fr)]">
            {/* 左侧：基本信息 + 设备类型 */}
            <div className="space-y-4 lg:min-h-0 lg:overflow-y-auto">
              {/* 基本信息卡片 */}
              <Card className="border border-border">
                <CardContent className="p-4">
                  <h3 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    基本信息
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-muted/40 dark:bg-gray-700/50 rounded-lg p-3">
                      <label className="block text-xs font-medium text-muted-foreground mb-1">
                        模板类别
                      </label>
                      <Badge variant={getCategoryBadgeVariant(template.category)} size="sm">
                        {getCategoryLabel(template.category)}
                      </Badge>
                    </div>
                    <div className="bg-muted/40 dark:bg-gray-700/50 rounded-lg p-3">
                      <label className="block text-xs font-medium text-muted-foreground mb-1">
                        检查项数量
                      </label>
                      <div className="flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground">{template.checkItems?.length || 0} 项</span>
                      </div>
                    </div>
                    <div className="bg-muted/40 dark:bg-gray-700/50 rounded-lg p-3">
                      <label className="block text-xs font-medium text-muted-foreground mb-1">
                        创建时间
                      </label>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs text-foreground/90">
                          {template.createdAt ? formatDateTimeYMDHMS(template.createdAt) : '-'}
                        </span>
                      </div>
                    </div>
                    <div className="bg-muted/40 dark:bg-gray-700/50 rounded-lg p-3">
                      <label className="block text-xs font-medium text-muted-foreground mb-1">
                        更新时间
                      </label>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs text-foreground/90">
                          {template.updatedAt ? formatDateTimeYMDHMS(template.updatedAt) : '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 支持设备类型卡片 */}
              <Card className="border border-border">
                <CardContent className="p-4">
                  <h3 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-purple-600" />
                    支持设备类型
                    <span className="text-xs font-normal text-muted-foreground">({template.deviceTypes?.length || 0} 种)</span>
                  </h3>
                  {template.deviceTypes && template.deviceTypes.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {template.deviceTypes.map((type) => (
                        <Badge key={type} variant="secondary" size="sm" className="px-2.5 py-1">
                          {type}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">暂未配置支持的设备类型</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* 右侧：检查项配置 */}
            <Card className="border border-border flex flex-col overflow-hidden">
              <CardContent className="p-4 flex flex-col flex-1 min-h-0">
                <h3 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2 flex-shrink-0">
                  <Settings className="w-4 h-4 text-green-600" />
                  检查项配置
                  <span className="text-xs font-normal text-muted-foreground">({template.checkItems?.length || 0} 项)</span>
                </h3>
                {template.checkItems && template.checkItems.length > 0 ? (
                  <div className="space-y-2 overflow-y-auto flex-1 min-h-0 pr-1">
                    {template.checkItems.map((checkItem, index) => (
                      <motion.div
                        key={checkItem.id || index}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        className="border border-border rounded-lg p-3 bg-muted/40 dark:bg-gray-700/50 hover:bg-muted dark:hover:bg-gray-700 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-xs font-medium text-muted-foreground flex-shrink-0">#{index + 1}</span>
                            <h4 className="text-sm font-medium text-foreground truncate">
                              {checkItem.name}
                            </h4>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant={getCheckTypeBadgeVariant(checkItem.type)} size="sm">
                              {getCheckTypeLabel(checkItem.type)}
                            </Badge>
                            {!isCheckItemTypeSupported(checkItem.type) && (
                              <Badge variant="outline" size="sm">
                                未支持执行
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">权重: {checkItem.weight || 1}</span>
                          </div>
                        </div>

                        {/* 检查项配置详情 - 折叠显示 */}
                        {checkItem.config && Object.keys(checkItem.config).length > 0 && (
                          <details className="group">
                            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground/90 dark:hover:text-gray-300 select-none">
                              查看配置参数
                            </summary>
                            <div className="mt-2 bg-card rounded p-2 border border-border">
                              <pre className="text-xs text-muted-foreground dark:text-gray-300 font-mono whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                                {JSON.stringify(checkItem.config, null, 2)}
                              </pre>
                            </div>
                          </details>
                        )}
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <FileText className="w-10 h-10 text-gray-300 dark:text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground text-sm">暂无检查项配置</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* 底部操作按钮 */}
        <div className="flex items-center justify-end gap-3 px-6 py-3 border-t border-border bg-muted/40">
          <Button variant="outline" size="sm" onClick={onClose}>
            关闭
          </Button>
          {onEdit && !template.isBuiltIn && (
            <Button size="sm" onClick={onEdit}>
              <Edit className="w-4 h-4 mr-1" />
              编辑模板
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  )
}

