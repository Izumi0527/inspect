'use client'

import React, { useEffect, useMemo, useState } from 'react'
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
import { PlainLanguageCard, RawInfoDisclosure } from '@/components/shared'
import { humanizeAlertCategory, translateToPlainLanguage } from '@/lib/plain-language'
import { cn } from '@/utils/cn'
import { Alert, AlertSeverity, AlertStatus } from '../types'
import { useAlertStyles } from '../hooks/useAlerts'
import { addAlertComment, fetchAlert, fetchAlertOperations } from '../api/alerts.api'
import type { AlertOperation } from '../api/alerts.api'
import { formatDateTimeYMDHMS } from '@/utils/formatters'

interface AlertDetailModalProps {
  open: boolean
  onClose: () => void
  alert: Alert | null
  /**
   * 告警 ID（深链/通知跳转场景）。当 `alert` 为空但 `alertId` 存在时，组件将自动从后端拉取详情。
   */
  alertId?: string | null
  onAcknowledge?: (id: string) => void
  onResolve?: (id: string) => void
  onDelete?: (id: string) => void
}

export const AlertDetailModal: React.FC<AlertDetailModalProps> = ({
  open,
  onClose,
  alert: propAlert,
  alertId,
  onAcknowledge,
  onResolve,
  onDelete,
}) => {
  const [alert, setAlert] = useState<Alert | null>(propAlert)
  const [alertLoading, setAlertLoading] = useState(false)
  const [alertLoadError, setAlertLoadError] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [activeTab, setActiveTab] = useState<'details' | 'timeline' | 'comments'>('details')
  const [comment, setComment] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)
  const [commentSuccess, setCommentSuccess] = useState(false)
  const [operations, setOperations] = useState<AlertOperation[] | null>(null)
  const [operationsLoading, setOperationsLoading] = useState(false)
  const [operationsError, setOperationsError] = useState<string | null>(null)
  const [operationsReloadNonce, setOperationsReloadNonce] = useState(0)
  const { getSeverityColor, getStatusColor } = useAlertStyles()

  const normalizedAlertId = typeof alertId === 'string' ? alertId.trim() : ''
  const canUpdate = Boolean(onAcknowledge || onResolve)
  const effectiveAlertId = (alert?.id ?? normalizedAlertId).trim()

  useEffect(() => {
    if (!open) return

    if (propAlert) {
      setAlert(propAlert)
      setAlertLoading(false)
      setAlertLoadError(null)
      return
    }

    if (!normalizedAlertId) {
      setAlert(null)
      setAlertLoading(false)
      setAlertLoadError('缺少告警 ID，无法加载详情')
      return
    }

    let cancelled = false
    setAlertLoading(true)
    setAlertLoadError(null)

    fetchAlert(normalizedAlertId)
      .then((result) => {
        if (cancelled) return
        if (!result) {
          setAlert(null)
          setAlertLoadError('未找到该告警或无权限访问')
          return
        }
        setAlert(result)
        setAlertLoadError(null)
      })
      .catch((error) => {
        if (cancelled) return
        console.error('加载告警详情失败:', error)
        setAlert(null)
        setAlertLoadError('加载告警详情失败，请稍后重试')
      })
      .finally(() => {
        if (cancelled) return
        setAlertLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, propAlert, normalizedAlertId, reloadNonce])

  useEffect(() => {
    if (!open) return
    setActiveTab('details')
    setComment('')
    setCommentError(null)
    setCommentSuccess(false)
    setOperations(null)
    setOperationsLoading(false)
    setOperationsError(null)
  }, [open, alert?.id])

  const handleRetryLoad = () => setReloadNonce((prev) => prev + 1)
  const handleRetryLoadOperations = () => setOperationsReloadNonce((prev) => prev + 1)

  useEffect(() => {
    if (!open) return
    if (activeTab !== 'timeline' && activeTab !== 'comments') return
    if (!effectiveAlertId) return

    let cancelled = false
    setOperationsLoading(true)
    setOperationsError(null)

    fetchAlertOperations(effectiveAlertId, 100)
      .then((items) => {
        if (cancelled) return
        setOperations(items)
      })
      .catch((error) => {
        if (cancelled) return
        console.error('加载告警操作历史失败:', error)
        setOperations([])
        setOperationsError('操作历史加载失败，请稍后重试')
      })
      .finally(() => {
        if (cancelled) return
        setOperationsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeTab, effectiveAlertId, open, operationsReloadNonce])

  // 必须在 `if (!alert)` 之前调用，否则违反 React hooks 的调用顺序约束
  const plain = useMemo(
    () => (alert
      ? translateToPlainLanguage({
          message: alert.description,
          level: alert.severity,
          facility: alert.category,
          deviceName: alert.device,
        })
      : null),
    [alert],
  )

  const ariaLabel = alert?.title
    ? `告警详情 - ${alert.title}`
    : normalizedAlertId
      ? `告警详情 - ${normalizedAlertId}`
      : '告警详情'

  // plain 与 alert 同生共死：alert 非空时 plain 必非空，此处并列判断只为满足类型收窄
  if (!alert || !plain) {
    return (
      <SimpleModal open={open} onClose={onClose} size="3xl" ariaLabel={ariaLabel}>
        <div className="p-6">
          {alertLoading ? (
            <div className="text-sm text-muted-foreground">正在加载告警详情...</div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm text-red-600">{alertLoadError || '无法加载告警详情'}</div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleRetryLoad}>
                  重试
                </Button>
                <Button size="sm" onClick={onClose}>
                  关闭
                </Button>
              </div>
            </div>
          )}
        </div>
      </SimpleModal>
    )
  }

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

  // 格式化时间（统一走中央工具，空值占位 '-'）
  const formatDate = (dateStr: string | Date | undefined) => {
    if (!dateStr) return '-'
    return formatDateTimeYMDHMS(dateStr)
  }

  const safeParseTimeMs = (value: string): number => {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  const normalizedOperations = Array.isArray(operations) ? operations : []
  const operationsChronological = normalizedOperations
    .slice()
    .sort((a, b) => safeParseTimeMs(a.operationTime) - safeParseTimeMs(b.operationTime))

  const readMetaString = (metadata: Record<string, unknown>, key: string): string => {
    const value = metadata[key]
    return typeof value === 'string' ? value.trim() : ''
  }

  type TimelineEntry = {
    key: string
    title: string
    time?: string | Date
    dotClassName: string
    icon: React.ReactNode
    description: string
  }

  const buildTimelineEntryFromOperation = (op: AlertOperation): TimelineEntry => {
    const operatorName = op.operatorName || op.operatorId || '系统'
    const metadata = op.metadata ?? {}
    const operationType = (op.operationType || '').toLowerCase()

    const metaComment = readMetaString(metadata, 'comment')
    const metaAssignee = readMetaString(metadata, 'assignee')
    const metaResolution = readMetaString(metadata, 'resolution')
    const metaReason = readMetaString(metadata, 'reason')

    const commentContent = metaComment || (op.note || '')
    const isComment = operationType === 'update' && commentContent.trim() !== ''
    const isAssign = operationType === 'update' && metaAssignee !== '' && !isComment

    if (operationType === 'acknowledge') {
      const noteText = op.note ? `，备注：${op.note}` : ''
      return {
        key: `op-${op.id}`,
        title: '告警确认',
        time: op.operationTime,
        dotClassName: 'bg-yellow-500',
        icon: <CheckCircle2 className="w-4 h-4 text-yellow-500" />,
        description: `由 ${operatorName} 确认${noteText}`,
      }
    }

    if (operationType === 'resolve') {
      const content = metaResolution || op.note || '告警已解决'
      return {
        key: `op-${op.id}`,
        title: '告警解决',
        time: op.operationTime,
        dotClassName: 'bg-green-500',
        icon: <CheckCircle2 className="w-4 h-4 text-green-500" />,
        description: `由 ${operatorName} 解决：${content}`,
      }
    }

    if (operationType === 'reactivate') {
      const content = metaReason || op.note || '告警已重新激活'
      return {
        key: `op-${op.id}`,
        title: '重新激活',
        time: op.operationTime,
        dotClassName: 'bg-purple-500',
        icon: <XCircle className="w-4 h-4 text-purple-500" />,
        description: `由 ${operatorName} 重新激活：${content}`,
      }
    }

    if (isAssign) {
      return {
        key: `op-${op.id}`,
        title: '指派处理人',
        time: op.operationTime,
        dotClassName: 'bg-indigo-500',
        icon: <User className="w-4 h-4 text-indigo-500" />,
        description: `由 ${operatorName} 指派给 ${metaAssignee}`,
      }
    }

    if (isComment) {
      return {
        key: `op-${op.id}`,
        title: '添加备注',
        time: op.operationTime,
        dotClassName: 'bg-blue-500',
        icon: <MessageSquare className="w-4 h-4 text-blue-500" />,
        description: `由 ${operatorName} 添加备注：${commentContent.trim()}`,
      }
    }

    const fallbackTitle = operationType ? `操作：${operationType}` : '告警操作'
    const fallbackDesc = op.note
      ? `由 ${operatorName} 执行：${op.note}`
      : `由 ${operatorName} 执行`

    return {
      key: `op-${op.id}`,
      title: fallbackTitle,
      time: op.operationTime,
      dotClassName: 'bg-gray-400',
      icon: <Clock className="w-4 h-4 text-gray-500" />,
      description: fallbackDesc,
    }
  }

  const buildFallbackTimelineEntries = (): TimelineEntry[] => {
    const entries: TimelineEntry[] = [
      {
        key: 'created',
        title: '告警创建',
        time: alert.timestamp,
        dotClassName: 'bg-blue-500',
        icon: <AlertTriangle className="w-4 h-4 text-blue-500" />,
        description: '告警已创建并进入活跃状态',
      },
    ]

    if (alert.acknowledgedAt) {
      entries.push({
        key: 'ack',
        title: '告警确认',
        time: alert.acknowledgedAt,
        dotClassName: 'bg-yellow-500',
        icon: <CheckCircle2 className="w-4 h-4 text-yellow-500" />,
        description: alert.assignee ? `由 ${alert.assignee} 确认` : '告警已被确认',
      })
    }

    if (alert.resolvedAt) {
      entries.push({
        key: 'resolve',
        title: '告警解决',
        time: alert.resolvedAt,
        dotClassName: 'bg-green-500',
        icon: <CheckCircle2 className="w-4 h-4 text-green-500" />,
        description: alert.resolution || '告警已被解决',
      })
    }

    return entries
  }

  const timelineEntries: TimelineEntry[] =
    normalizedOperations.length > 0
      ? [
          {
            key: 'created',
            title: '告警创建',
            time: alert.timestamp,
            dotClassName: 'bg-blue-500',
            icon: <AlertTriangle className="w-4 h-4 text-blue-500" />,
            description: '告警已创建并进入活跃状态',
          },
          ...operationsChronological.map(buildTimelineEntryFromOperation),
        ]
      : buildFallbackTimelineEntries()

  const commentOperations = normalizedOperations.filter((op) => {
    if ((op.operationType || '').toLowerCase() !== 'update') return false
    const metaComment = readMetaString(op.metadata ?? {}, 'comment')
    const note = typeof op.note === 'string' ? op.note.trim() : ''
    return metaComment !== '' || note !== ''
  })

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

  const handleSubmitComment = async () => {
    if (!canUpdate) return
    if (!comment.trim()) return
    setSubmittingComment(true)
    setCommentError(null)
    setCommentSuccess(false)
    try {
      await addAlertComment(alert.id, comment.trim())
      setComment('')
      setCommentSuccess(true)
      setOperationsReloadNonce((prev) => prev + 1)
      setTimeout(() => setCommentSuccess(false), 3000)
    } catch {
      setCommentError('备注提交失败，请重试')
    } finally {
      setSubmittingComment(false)
    }
  }

  return (
    <SimpleModal open={open} onClose={onClose} size="3xl" ariaLabel={ariaLabel}>
      <div className="flex flex-col max-h-[85vh]">
        {/* 头部 */}
        <div className="flex items-start justify-between pb-4 border-b border-border">
          <div className="flex items-start gap-3 flex-1">
            <div className={cn(
              'p-2 rounded-lg',
              getSeverityColor(alert.severity).split(' ').find((cls) => cls.startsWith('bg-')) ?? 'bg-muted'
            )}>
              <div className={getSeverityColor(alert.severity).split(' ').find((cls) => cls.startsWith('text-')) ?? 'text-foreground'}>
                {severityInfo.icon}
              </div>
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-foreground mb-1">{alert.title}</h2>
              <p className="text-sm text-muted-foreground">ID: {alert.id}</p>
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
        <div className="flex gap-4 mt-4 border-b border-border">
          {([
            { key: 'details', label: '详情', icon: <FileText className="w-4 h-4" /> },
            { key: 'timeline', label: '时间线', icon: <Clock className="w-4 h-4" /> },
            { key: 'comments', label: '备注', icon: <MessageSquare className="w-4 h-4" /> },
          ] as const).map((tab) => (
            <motion.button
              key={tab.key}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2',
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
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
              {/* 人话解读：置于最前，用户最关心「发生了什么、该怎么办」 */}
              <PlainLanguageCard result={plain} />

              {/* 原始告警信息：默认折叠，翻译未命中时自动展开 */}
              <div className="p-4 bg-muted/40 rounded-lg border border-border">
                <RawInfoDisclosure label="查看原始告警信息" defaultOpen={!plain.matched}>
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap font-mono break-all">
                    {alert.description}
                  </p>
                </RawInfoDisclosure>
              </div>

              {/* 基本信息 */}
              <div className="p-4 bg-card rounded-lg border border-border">
                <h3 className="text-sm font-semibold text-foreground/90 mb-3">基本信息</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <span className="text-xs text-muted-foreground block">设备</span>
                      <p className="text-sm font-medium text-foreground">{alert.device}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <span className="text-xs text-muted-foreground block">分类</span>
                      <p className="text-sm font-medium text-foreground">{humanizeAlertCategory(alert.category)}</p>
                    </div>
                  </div>
                  {alert.assignee && (
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <span className="text-xs text-muted-foreground block">负责人</span>
                        <p className="text-sm font-medium text-foreground">{alert.assignee}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <span className="text-xs text-muted-foreground block">发生时间</span>
                      <p className="text-sm font-medium text-foreground">{formatDate(alert.timestamp)}</p>
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
                <div className="p-4 bg-card rounded-lg border border-border">
                  <h3 className="text-sm font-semibold text-foreground/90 mb-2">标签</h3>
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
                <div className="p-4 bg-card rounded-lg border border-border">
                  <h3 className="text-sm font-semibold text-foreground/90 mb-2">附加信息</h3>
                  <div className="space-y-2">
                    {Object.entries(alert.metadata).map(([key, value]) => (
                      <div key={key} className="flex items-start gap-2 text-sm">
                        <span className="text-muted-foreground min-w-24">{key}:</span>
                        <span className="text-foreground/90 font-medium break-all">
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
              {operationsLoading ? (
                <div className="text-sm text-muted-foreground">正在加载操作历史...</div>
              ) : operationsError ? (
                <div className="space-y-3">
                  <div className="text-sm text-red-600">{operationsError}</div>
                  <Button size="sm" variant="outline" onClick={handleRetryLoadOperations}>
                    重试
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative pl-8">
                    {timelineEntries.map((entry, index) => (
                      <div
                        key={entry.key}
                        className={cn('pb-6 relative', index === timelineEntries.length - 1 && 'pb-0')}
                      >
                        <div
                          className={cn(
                            'absolute left-0 top-1.5 w-4 h-4 rounded-full border-2 border-white dark:border-gray-900',
                            entry.dotClassName,
                          )}
                        />
                        {index !== timelineEntries.length - 1 && (
                          <div className="absolute left-2 top-6 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />
                        )}
                        <div className="bg-card rounded-lg border border-border p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                              {entry.icon}
                              {entry.title}
                            </h4>
                            <span className="text-xs text-muted-foreground">{formatDate(entry.time)}</span>
                          </div>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                            {entry.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {timelineEntries.length <= 1 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">暂无更多操作记录</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 备注标签 */}
          {activeTab === 'comments' && (
            <div className="space-y-4">
              {/* 添加备注 */}
              <div className="p-4 bg-card rounded-lg border border-border">
                <h3 className="text-sm font-semibold text-foreground/90 mb-3">添加备注</h3>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  disabled={!canUpdate}
                  placeholder={canUpdate ? '输入您的备注...' : '当前账号缺少告警操作权限，无法提交备注'}
                  rows={4}
                  className="w-full px-3 py-2 text-sm border border-border/70 bg-card text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
                <div className="flex justify-end mt-3 items-center gap-3">
                  {commentError && (
                    <span className="text-sm text-red-600">{commentError}</span>
                  )}
                  {commentSuccess && (
                    <span className="text-sm text-green-600">备注已提交</span>
                  )}
                  <Button
                    size="sm"
                    disabled={!canUpdate || !comment.trim() || submittingComment}
                    onClick={handleSubmitComment}
                  >
                    {submittingComment ? '提交中...' : '提交备注'}
                  </Button>
                </div>
              </div>

              {/* 备注历史 */}
              <div className="p-4 bg-muted/40 rounded-lg border border-border">
                <h3 className="text-sm font-semibold text-foreground/90 mb-3">备注历史</h3>
                {operationsLoading ? (
                  <div className="text-sm text-muted-foreground">正在加载备注历史...</div>
                ) : operationsError ? (
                  <div className="space-y-3">
                    <div className="text-sm text-red-600">{operationsError}</div>
                    <Button size="sm" variant="outline" onClick={handleRetryLoadOperations}>
                      重试
                    </Button>
                  </div>
                ) : commentOperations.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">暂无备注</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {commentOperations.map((op) => {
                      const content =
                        readMetaString(op.metadata ?? {}, 'comment') ||
                        (typeof op.note === 'string' ? op.note.trim() : '')
                      const operatorName = op.operatorName || op.operatorId || '系统'

                      return (
                        <div key={op.id} className="bg-card rounded-lg border border-border p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-semibold text-foreground/90">{operatorName}</div>
                            <div className="text-xs text-muted-foreground">{formatDate(op.operationTime)}</div>
                          </div>
                          <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">{content}</p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
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

