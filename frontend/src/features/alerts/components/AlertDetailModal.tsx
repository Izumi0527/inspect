'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Server,
  User,
  Calendar,
  FileText,
  MessageSquare,
  Trash2,
  XCircle
} from 'lucide-react'
import { SimpleModal, Badge, Button } from '@/components/atoms'
import { cn } from '@/utils/cn'
import { Alert, AlertSeverity, AlertStatus } from '../types'
import { useAlertStyles } from '../hooks/useAlerts'

interface AlertDetailModalProps {
  open: boolean
  onClose: () => void
  alert: Alert | null
  onAcknowledge?: (id: string) => void
  onResolve?: (id: string) => void
  onDelete?: (id: string) => void
}

export const AlertDetailModal: React.FC<AlertDetailModalProps> = ({
  open,
  onClose,
  alert,
  onAcknowledge,
  onResolve,
  onDelete,
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'timeline' | 'comments'>('details')
  const [comment, setComment] = useState('')
  const { getSeverityColor, getStatusColor } = useAlertStyles()

  if (!alert) return null

  // 严重级别配置
  const severityConfig: Record<AlertSeverity, { icon: React.ReactNode; label: string }> = {
    critical: { icon: <XCircle className="w-5 h-5" />, label: '严重' },
    warning: { icon: <AlertTriangle className="w-5 h-5" />, label: '警告' },
    info: { icon: <CheckCircle2 className="w-5 h-5" />, label: '信息' },
  }

  // 状态配置
  const statusConfig: Record<AlertStatus, { icon: React.ReactNode; label: string }> = {
    active: { icon: <AlertTriangle className="w-5 h-5" />, label: '活跃' },
    acknowledged: { icon: <CheckCircle2 className="w-5 h-5" />, label: '已确认' },
    resolved: { icon: <CheckCircle2 className="w-5 h-5" />, label: '已解决' },
  }

  const severityInfo = severityConfig[alert.severity]
  const statusInfo = statusConfig[alert.status]

  // 格式化时间
  const formatDate = (dateStr: string | Date | undefined) => {
    if (!dateStr) return '-'
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  // 处理操作
  const handleAcknowledge = () => {
    if (onAcknowledge) {
      onAcknowledge(alert.id)
      onClose()
    }
  }

  const handleResolve = () => {
    if (onResolve) {
      onResolve(alert.id)
      onClose()
    }
  }

  const handleDelete = () => {
    if (onDelete && confirm('确定要删除此告警吗？')) {
      onDelete(alert.id)
      onClose()
    }
  }

  return (
    <SimpleModal open={open} onClose={onClose} size="3xl">
      <div className="flex flex-col max-h-[85vh]">
        {/* 头部 */}
        <div className="flex items-start justify-between pb-4 border-b border-gray-200">
          <div className="flex items-start gap-3 flex-1">
            <div className={cn(
              'p-2 rounded-lg',
              getSeverityColor(alert.severity).replace('text-', 'bg-').replace('-600', '-100')
            )}>
              <div className={getSeverityColor(alert.severity)}>
                {severityInfo.icon}
              </div>
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-gray-900 mb-1">{alert.title}</h2>
              <p className="text-sm text-gray-500">ID: {alert.id}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 items-end">
            <Badge className={cn('text-sm', getSeverityColor(alert.severity))}>
              {severityInfo.label}
            </Badge>
            <Badge className={cn('text-sm', getStatusColor(alert.status))}>
              {statusInfo.label}
            </Badge>
          </div>
        </div>

        {/* 标签页 */}
        <div className="flex gap-4 mt-4 border-b border-gray-200">
          {[
            { key: 'details', label: '详情', icon: <FileText className="w-4 h-4" /> },
            { key: 'timeline', label: '时间线', icon: <Clock className="w-4 h-4" /> },
            { key: 'comments', label: '备注', icon: <MessageSquare className="w-4 h-4" /> },
          ].map((tab) => (
            <motion.button
              key={tab.key}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setActiveTab(tab.key as any)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2',
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              )}
            >
              {tab.icon}
              {tab.label}
            </motion.button>
          ))}
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto mt-4 space-y-4">
          {/* 详情标签 */}
          {activeTab === 'details' && (
            <div className="space-y-4">
              {/* 告警描述 */}
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  告警描述
                </h3>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{alert.description}</p>
              </div>

              {/* 基本信息 */}
              <div className="p-4 bg-white rounded-lg border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">基本信息</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-gray-400" />
                    <div>
                      <span className="text-xs text-gray-500 block">设备</span>
                      <p className="text-sm font-medium text-gray-900">{alert.device}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <div>
                      <span className="text-xs text-gray-500 block">分类</span>
                      <p className="text-sm font-medium text-gray-900">{alert.category || '未分类'}</p>
                    </div>
                  </div>
                  {alert.assignee && (
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <div>
                        <span className="text-xs text-gray-500 block">负责人</span>
                        <p className="text-sm font-medium text-gray-900">{alert.assignee}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <div>
                      <span className="text-xs text-gray-500 block">创建时间</span>
                      <p className="text-sm font-medium text-gray-900">{formatDate(alert.timestamp)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 解决方案（如果已解决） */}
              {alert.resolution && (
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <h3 className="text-sm font-semibold text-green-700 mb-2 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    解决方案
                  </h3>
                  <p className="text-sm text-green-700">{alert.resolution}</p>
                </div>
              )}

              {/* 标签（如果有） */}
              {alert.tags && alert.tags.length > 0 && (
                <div className="p-4 bg-white rounded-lg border border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">标签</h3>
                  <div className="flex flex-wrap gap-2">
                    {alert.tags.map((tag, index) => (
                      <Badge key={index} className="bg-blue-100 text-blue-700">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* 元数据（如果有） */}
              {alert.metadata && Object.keys(alert.metadata).length > 0 && (
                <div className="p-4 bg-white rounded-lg border border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">附加信息</h3>
                  <div className="space-y-2">
                    {Object.entries(alert.metadata).map(([key, value]) => (
                      <div key={key} className="flex items-start gap-2 text-sm">
                        <span className="text-gray-500 min-w-24">{key}:</span>
                        <span className="text-gray-700 font-medium break-all">
                          {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 时间线标签 */}
          {activeTab === 'timeline' && (
            <div className="space-y-4">
              <div className="relative pl-8">
                {/* 创建时间 */}
                <div className="pb-6">
                  <div className="absolute left-0 top-1.5 w-4 h-4 rounded-full bg-blue-500 border-2 border-white" />
                  <div className="absolute left-2 top-6 bottom-0 w-0.5 bg-gray-200" />
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-blue-500" />
                        告警创建
                      </h4>
                      <span className="text-xs text-gray-500">{formatDate(alert.timestamp)}</span>
                    </div>
                    <p className="text-sm text-gray-600">告警已创建并进入活跃状态</p>
                  </div>
                </div>

                {/* 确认时间 */}
                {alert.acknowledgedAt && (
                  <div className="pb-6">
                    <div className="absolute left-0 top-1.5 w-4 h-4 rounded-full bg-yellow-500 border-2 border-white" />
                    {alert.resolvedAt && <div className="absolute left-2 top-6 bottom-0 w-0.5 bg-gray-200" />}
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-yellow-500" />
                          告警确认
                        </h4>
                        <span className="text-xs text-gray-500">{formatDate(alert.acknowledgedAt)}</span>
                      </div>
                      <p className="text-sm text-gray-600">
                        {alert.assignee ? `由 ${alert.assignee} 确认` : '告警已被确认'}
                      </p>
                    </div>
                  </div>
                )}

                {/* 解决时间 */}
                {alert.resolvedAt && (
                  <div className="pb-0">
                    <div className="absolute left-0 top-1.5 w-4 h-4 rounded-full bg-green-500 border-2 border-white" />
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          告警解决
                        </h4>
                        <span className="text-xs text-gray-500">{formatDate(alert.resolvedAt)}</span>
                      </div>
                      <p className="text-sm text-gray-600">
                        {alert.resolution || '告警已被解决'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* 如果没有操作历史 */}
              {!alert.acknowledgedAt && !alert.resolvedAt && (
                <div className="text-center py-8 text-gray-500">
                  <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">暂无操作记录</p>
                </div>
              )}
            </div>
          )}

          {/* 备注标签 */}
          {activeTab === 'comments' && (
            <div className="space-y-4">
              {/* 添加备注 */}
              <div className="p-4 bg-white rounded-lg border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">添加备注</h3>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="输入您的备注..."
                  rows={4}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
                <div className="flex justify-end mt-3">
                  <Button
                    size="sm"
                    disabled={!comment.trim()}
                    onClick={() => {
                      if (comment.trim()) {
                        // TODO: 实现备注提交逻辑
                        console.log('提交备注:', comment)
                        setComment('')
                      }
                    }}
                  >
                    提交备注
                  </Button>
                </div>
              </div>

              {/* 备注历史 */}
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">备注历史</h3>
                <div className="text-center py-8 text-gray-500">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">暂无备注</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200 mt-4">
          <div className="flex gap-2">
            {alert.status === 'active' && onAcknowledge && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleAcknowledge}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-yellow-700 bg-yellow-50 rounded-lg hover:bg-yellow-100 border border-yellow-200 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                确认告警
              </motion.button>
            )}
            {(alert.status === 'active' || alert.status === 'acknowledged') && onResolve && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleResolve}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 border border-green-200 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                解决告警
              </motion.button>
            )}
            {onDelete && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleDelete}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 border border-red-200 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                删除
              </motion.button>
            )}
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClose}
            className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            关闭
          </motion.button>
        </div>
      </div>
    </SimpleModal>
  )
}
