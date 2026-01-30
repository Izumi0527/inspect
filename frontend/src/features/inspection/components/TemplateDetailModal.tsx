import React from 'react'
import { motion } from 'framer-motion'
import { X, FileText, Monitor, Settings, Shield, Edit, Calendar, Tag } from 'lucide-react'
import {
  Button,
  Badge,
  Card,
  CardContent
} from '@/components/atoms'
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-blue-50 to-purple-50">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              {getCategoryIcon(template.category)}
              <h2 className="text-2xl font-semibold text-gray-900">{template.name}</h2>
              {template.isBuiltIn && (
                <Badge variant="success" size="sm">内置模板</Badge>
              )}
            </div>
            <p className="text-sm text-gray-600 ml-8">
              {template.description || '暂无描述'}
            </p>
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

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* 基本信息卡片 */}
            <Card>
              <CardContent className="p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  基本信息
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">
                      模板类别
                    </label>
                    <div className="flex items-center gap-2">
                      <Badge variant={getCategoryBadgeVariant(template.category)}>
                        {getCategoryLabel(template.category)}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">
                      检查项数量
                    </label>
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-900 font-medium">{template.checkItems?.length || 0} 项</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">
                      创建时间
                    </label>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-700">
                        {template.createdAt ? new Date(template.createdAt).toLocaleString('zh-CN') : '-'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">
                      更新时间
                    </label>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-700">
                        {template.updatedAt ? new Date(template.updatedAt).toLocaleString('zh-CN') : '-'}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 支持设备类型卡片 */}
            <Card>
              <CardContent className="p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-purple-600" />
                  支持设备类型 ({template.deviceTypes?.length || 0} 种)
                </h3>
                {template.deviceTypes && template.deviceTypes.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {template.deviceTypes.map((type) => (
                      <Badge key={type} variant="secondary" size="sm" className="px-3 py-1">
                        {type}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">暂未配置支持的设备类型</p>
                )}
              </CardContent>
            </Card>

            {/* 检查项配置卡片 */}
            <Card>
              <CardContent className="p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Settings className="w-5 h-5 text-green-600" />
                  检查项配置 ({template.checkItems?.length || 0} 项)
                </h3>
                {template.checkItems && template.checkItems.length > 0 ? (
                  <div className="space-y-3">
                    {template.checkItems.map((checkItem, index) => (
                      <motion.div
                        key={checkItem.id || index}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="border border-gray-200 rounded-lg p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm font-medium text-gray-500">#{index + 1}</span>
                              <h4 className="text-base font-semibold text-gray-900">
                                {checkItem.name}
                              </h4>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={getCheckTypeBadgeVariant(checkItem.type)} size="sm">
                                {getCheckTypeLabel(checkItem.type)}
                              </Badge>
                              <span className="text-sm text-gray-500">
                                权重: {checkItem.weight || 1}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 检查项配置详情 */}
                        {checkItem.config && Object.keys(checkItem.config).length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <p className="text-xs font-medium text-gray-500 mb-2">配置参数:</p>
                            <div className="bg-white rounded-md p-3 border border-gray-200">
                              <pre className="text-xs text-gray-700 font-mono whitespace-pre-wrap break-all">
                                {JSON.stringify(checkItem.config, null, 2)}
                              </pre>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">暂无检查项配置</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* 底部操作按钮 */}
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
          {onEdit && !template.isBuiltIn && (
            <Button onClick={onEdit}>
              <Edit className="w-4 h-4 mr-2" />
              编辑模板
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  )
}
