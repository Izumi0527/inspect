'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { formatDateTimeYMDHMS } from '@/utils/formatters'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  MinusCircle,
  Server,
  Activity,
  ChevronDown,
  ChevronRight,
  FileText,
  Download,
  FileSpreadsheet,
  File,
  Loader2,
} from 'lucide-react'
import { SimpleModal } from '@/components/atoms/modal'
import { Badge } from '@/components/atoms/badge'
import { cn } from '@/utils/cn'
import { useGenerateReport, useExecutionDetail } from '../hooks/useInspection'
import {
  clampProgress,
  formatDeviceScore,
  formatExecutionDuration,
  getDeviceStatusMeta,
  getExecutionScoreMeta,
  getExecutionStatusMeta,
  getTriggerMeta,
  normalizeExecutionSummary,
} from '../utils/executionPresentation'
import { InterfaceUtilizationTable } from './InterfaceUtilizationTable'
import { CheckDetailTables } from './CheckDetailTables'
import type { CheckResult, DeviceInspectionResult, InspectionExecution, ReportFormat } from '../types'

interface ExecutionDetailModalProps {
  open: boolean
  onClose: () => void
  execution: InspectionExecution | null
}

type CheckFilterType = 'all' | 'abnormal' | 'pass'

// 报告格式配置
const reportFormats: { value: ReportFormat; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'pdf', label: 'PDF', icon: <FileText className="w-4 h-4" />, description: '适合打印和分享' },
  { value: 'excel', label: 'Excel', icon: <FileSpreadsheet className="w-4 h-4" />, description: '适合数据分析' },
  { value: 'word', label: 'Word', icon: <File className="w-4 h-4" />, description: '适合编辑修改' },
]

/**
 * 根据检查项名称推断"实际值"该用什么标签展示。
 * 注意匹配顺序：「利用率」必须先于「接口」判断，否则"接口利用率"会命中接口分支、
 * 被错标成"接口状态: 92.3%"。
 */
const getActualValueLabel = (checkName: string): string => {
  const name = checkName.toLowerCase()
  if (name.includes('cpu') || name.includes('处理器')) return '实际值'
  if (name.includes('内存') || name.includes('memory')) return '实际值'
  if (name.includes('运行时间') || name.includes('uptime')) return '运行时间'
  if (name.includes('利用率') || name.includes('utilization')) return '利用率'
  if (name.includes('接口') || name.includes('interface') || name.includes('端口')) return '接口状态'
  if (name.includes('温度') || name.includes('temperature')) return '温度'
  if (name.includes('带宽') || name.includes('吞吐') || name.includes('bandwidth')) return '带宽'
  if (name.includes('icmp') || name.includes('ping')) return '响应时间'
  return '实际值'
}

const getStatusHeaderIcon = (status: string) => {
  switch (status) {
    case 'running':
      return <Activity className="w-4 h-4 animate-pulse" />
    case 'completed':
      return <CheckCircle2 className="w-4 h-4" />
    case 'failed':
    case 'cancelled':
      return <XCircle className="w-4 h-4" />
    default:
      return <Clock className="w-4 h-4" />
  }
}

export const ExecutionDetailModal: React.FC<ExecutionDetailModalProps> = ({
  open,
  onClose,
  execution: initialExecution,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'devices' | 'checks'>('overview')
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null)
  const [checkFilter, setCheckFilter] = useState<CheckFilterType>('all')
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [exportCompleted, setExportCompleted] = useState(false)
  const exportResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isActiveModalRef = useRef(open)

  useEffect(() => {
    isActiveModalRef.current = open
    return () => {
      isActiveModalRef.current = false
    }
  }, [open])

  // 获取完整的执行详情（包含设备结果和检查项）
  const {
    data: detailedExecution,
    isLoading: isLoadingDetail,
    error: detailError,
    refetch: refetchDetail,
  } = useExecutionDetail(
    open && initialExecution ? initialExecution.id : null
  )

  // 使用详情数据，如果没有则使用初始数据
  const execution = detailedExecution || initialExecution

  // 报告生成 hook
  const generateReport = useGenerateReport()

  // 弹窗打开时重置标签页与筛选状态
  useEffect(() => {
    if (open) {
      setActiveTab('overview')
      setExpandedDevice(null)
      setCheckFilter('all')
      setShowExportMenu(false)
      setExportCompleted(false)
    }
    return () => {
      if (exportResetTimerRef.current) {
        clearTimeout(exportResetTimerRef.current)
      }
    }
  }, [open])

  // Escape 键关闭导出菜单
  useEffect(() => {
    if (!showExportMenu) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowExportMenu(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showExportMenu])

  // 处理导出报告
  const handleExportReport = useCallback(async (format: ReportFormat) => {
    if (!execution) return

    setShowExportMenu(false)
    setExportCompleted(false)
    if (exportResetTimerRef.current) {
      clearTimeout(exportResetTimerRef.current)
    }

    try {
      await generateReport.mutateAsync({
        executionId: execution.id,
        type: 'detailed',
        format,
      })
      if (!isActiveModalRef.current) return
      setExportCompleted(true)
      exportResetTimerRef.current = setTimeout(() => {
        if (isActiveModalRef.current) {
          setExportCompleted(false)
        }
      }, 3000)
    } catch (error) {
      console.error('导出报告失败:', error)
    }
  }, [execution, generateReport])

  if (!execution) return null

  const summary = normalizeExecutionSummary<DeviceInspectionResult>(execution.summary)

  // 检查项状态样式：color 用于图标着色，variant 决定语义徽标底色+文字
  const checkStatusConfig: Record<
    string,
    { color: string; variant: 'success' | 'warning' | 'error' | 'neutral'; icon: React.ReactNode; label: string }
  > = {
    pass: { color: 'text-success', variant: 'success', icon: <CheckCircle2 className="w-4 h-4" />, label: '通过' },
    warning: { color: 'text-warning', variant: 'warning', icon: <AlertTriangle className="w-4 h-4" />, label: '警告' },
    fail: { color: 'text-danger', variant: 'error', icon: <XCircle className="w-4 h-4" />, label: '失败' },
    skip: { color: 'text-muted-foreground', variant: 'neutral', icon: <Clock className="w-4 h-4" />, label: '跳过' },
    // 不适用与跳过分开呈现：前者设备天然没这个特性、无需处理，
    // 后者是该查却没查成、要跟进。用同一个标签会让运维分不清要不要动手。
    not_applicable: {
      color: 'text-muted-foreground/60',
      variant: 'neutral',
      icon: <MinusCircle className="w-4 h-4" />,
      label: '不适用',
    },
  }

  const statusMeta = getExecutionStatusMeta(execution.status)
  const triggerMeta = getTriggerMeta(execution.triggerType)
  const progressValue = clampProgress(execution.progress)
  const scoreMeta = getExecutionScoreMeta(
    summary.score,
    execution.status,
    summary.totalChecks
  )
  const clampedScore = Number.isFinite(summary.score)
    ? Math.max(0, Math.min(100, summary.score))
    : 0
  const circumference = 2 * Math.PI * 56

  // 是否可以导出报告（只有已完成的巡检才能导出）
  const canExport = execution.status === 'completed'

  // 是否正在加载详情
  const isLoading = isLoadingDetail && !detailedExecution
  const shouldShowDetailError = Boolean(detailError) && !detailedExecution
  const detailErrorMessage = detailError instanceof Error ? detailError.message : '执行详情加载失败'

  // 将字节数组字符串转换为可读文本
  const convertByteArrayToString = (byteArrayStr: string): string | null => {
    try {
      const byteStr = byteArrayStr.replace(/^\[|\]$/g, '').trim()
      if (!byteStr) return null

      const bytes = byteStr.split(/\s+/).map(b => parseInt(b, 10)).filter(b => !isNaN(b))
      if (bytes.length === 0) return null

      const chars: string[] = []
      for (const b of bytes) {
        if (b >= 32 && b < 127) {
          chars.push(String.fromCharCode(b))
        } else if (b === 10 || b === 13) {
          if (chars.length > 0 && chars[chars.length - 1] !== ' ') {
            chars.push(' ')
          }
        } else if (b === 9) {
          chars.push(' ')
        }
      }

      const result = chars.join('').trim()
      return result.length > 0 ? result : null
    } catch {
      return null
    }
  }

  // 格式化检查值（处理字节数组格式的字符串）
  const formatCheckValue = (value: string | undefined): string | null => {
    if (!value) return null

    if (value.startsWith('[') && /^\[\d+(\s+\d+)*/.test(value)) {
      const converted = convertByteArrayToString(value)
      if (converted) {
        return converted.length > 50 ? converted.slice(0, 50) + '...' : converted
      }
    }

    if (/^\d+(\.\d+)?ms$/i.test(value.trim())) {
      return value.trim()
    }

    return value.length > 100 ? value.slice(0, 100) + '...' : value
  }

  // 格式化消息字段（处理包含字节数组的消息）
  const formatMessage = (message: string | undefined): string | null => {
    if (!message) return null

    const byteArrayMatch = message.match(/\[(\d+(?:\s+\d+)+)\]?/)
    if (byteArrayMatch) {
      const converted = convertByteArrayToString(byteArrayMatch[0])
      if (converted) {
        const readableInfo = converted.length > 60 ? converted.slice(0, 60) + '...' : converted
        const newMessage = message.replace(byteArrayMatch[0], readableInfo)
        return newMessage.length > 150 ? newMessage.slice(0, 150) + '...' : newMessage
      }
    }

    return message.length > 150 ? message.slice(0, 150) + '...' : message
  }

  // 切换设备展开状态
  const toggleDevice = (deviceId: string) => {
    setExpandedDevice(expandedDevice === deviceId ? null : deviceId)
  }

  // 统计分布条比例
  const totalChecksForBar = summary.totalChecks > 0 ? summary.totalChecks : 0
  const passRatio = totalChecksForBar > 0 ? (summary.passedChecks / totalChecksForBar) * 100 : 0
  const warningRatio = totalChecksForBar > 0 ? (summary.warningChecks / totalChecksForBar) * 100 : 0
  const failRatio = totalChecksForBar > 0 ? (summary.failedChecks / totalChecksForBar) * 100 : 0

  // 扁平化检查项并按状态筛选
  const deviceResults: DeviceInspectionResult[] = summary.deviceResults
  const allChecks: Array<{ device: DeviceInspectionResult; check: CheckResult; key: string }> =
    deviceResults.flatMap((device) =>
      (device.checkResults ?? []).map((check, index) => ({
        device,
        check,
        key: `${device.deviceId}-${check.checkItemId || index}`,
      }))
    )

  const abnormalChecksCount = allChecks.filter(
    ({ check }) => check.status === 'warning' || check.status === 'fail'
  ).length
  const passChecksCount = allChecks.filter(({ check }) => check.status === 'pass').length

  const filteredChecks = allChecks.filter(({ check }) => {
    if (checkFilter === 'abnormal') {
      return check.status === 'warning' || check.status === 'fail'
    }
    if (checkFilter === 'pass') {
      return check.status === 'pass'
    }
    return true
  })

  return (
    <SimpleModal open={open} onClose={onClose} size="5xl" ariaLabel={`执行详情 - ${execution.strategyName}`}>
      <div className="flex flex-col h-[80vh]">
        {/* 头部 */}
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn('p-2 rounded-lg shrink-0', statusMeta.iconSurfaceClass)}>
              {getStatusHeaderIcon(execution.status)}
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-foreground truncate">{execution.strategyName}</h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
                <span>{triggerMeta.label}</span>
                {execution.triggerUser && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{execution.triggerUser}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span>开始于 {formatDateTimeYMDHMS(execution.startTime)}</span>
              </div>
            </div>
          </div>
          <Badge variant={statusMeta.badgeVariant}>{statusMeta.label}</Badge>
        </div>

        {/* 标签页（保持精确标签文案以兼容可访问性查询） */}
        <div className="flex gap-4 mt-4 border-b border-border">
          {([
            { key: 'overview', label: '概览', icon: <FileText className="w-4 h-4" /> },
            { key: 'devices', label: '设备详情', icon: <Server className="w-4 h-4" /> },
            { key: 'checks', label: '检查项', icon: <Activity className="w-4 h-4" /> },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium cursor-pointer transition-colors border-b-2',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto mt-4 space-y-4">
          {shouldShowDetailError && (
            <div className="p-6 bg-danger-soft/60 rounded-lg border border-danger/30 text-danger-soft-foreground">
              <div className="text-sm font-medium">{detailErrorMessage}</div>
              <button
                type="button"
                className="mt-3 px-3 py-1.5 text-sm font-medium rounded-md bg-danger text-danger-foreground hover:bg-danger/90 transition-colors cursor-pointer"
                onClick={() => {
                  void refetchDetail()
                }}
              >
                重试加载详情
              </button>
            </div>
          )}

          {/* 概览标签 */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 基本信息卡片 */}
              <div className="md:col-span-2 p-4 bg-surface-2/60 rounded-lg border border-border">
                <h3 className="text-sm font-semibold text-foreground mb-3">基本信息</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <span className="text-xs text-muted-foreground">触发方式</span>
                    <p className="text-sm font-medium text-foreground mt-1">{triggerMeta.label}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">触发用户</span>
                    <p className="text-sm font-medium text-foreground mt-1">{execution.triggerUser || '-'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">执行进度</span>
                    <p className="text-sm font-medium text-foreground tabular-nums mt-1">{progressValue}%</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">开始时间</span>
                    <p className="text-sm font-medium text-foreground tabular-nums mt-1">
                      {formatDateTimeYMDHMS(execution.startTime)}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">结束时间</span>
                    <p className="text-sm font-medium text-foreground tabular-nums mt-1">
                      {execution.endTime ? formatDateTimeYMDHMS(execution.endTime) : '-'}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">执行时长</span>
                    <p className="text-sm font-medium text-foreground tabular-nums mt-1">
                      {formatExecutionDuration(execution.duration)}
                    </p>
                  </div>
                </div>
              </div>

              {/* 统计卡片 */}
              <div className="p-4 bg-card rounded-lg border border-border flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3">检查统计</h3>
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">总检查项</span>
                      <span className="text-lg font-bold text-foreground tabular-nums">
                        {summary.totalChecks}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-success flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        通过
                      </span>
                      <span className="text-lg font-bold text-success tabular-nums">
                        {summary.passedChecks}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-warning flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" />
                        警告
                      </span>
                      <span className="text-lg font-bold text-warning tabular-nums">
                        {summary.warningChecks}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-danger flex items-center gap-1.5">
                        <XCircle className="w-4 h-4" />
                        失败
                      </span>
                      <span className="text-lg font-bold text-danger tabular-nums">
                        {summary.failedChecks}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 检查项结果分布占比条 */}
                <div className="mt-4 h-1.5 w-full rounded-full bg-surface-3 overflow-hidden flex">
                  {passRatio > 0 && (
                    <div className="h-full bg-success" style={{ width: `${passRatio}%` }} />
                  )}
                  {warningRatio > 0 && (
                    <div className="h-full bg-warning" style={{ width: `${warningRatio}%` }} />
                  )}
                  {failRatio > 0 && (
                    <div className="h-full bg-danger" style={{ width: `${failRatio}%` }} />
                  )}
                </div>
              </div>

              {/* 评分卡片 */}
              <div className="p-4 bg-card rounded-lg border border-border">
                <h3 className="text-sm font-semibold text-foreground mb-3">巡检评分</h3>
                <div className="flex items-center justify-center">
                  <div className="relative w-32 h-32">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle
                        cx="64"
                        cy="64"
                        r="56"
                        stroke="currentColor"
                        strokeWidth="8"
                        fill="none"
                        className="text-border"
                      />
                      <circle
                        cx="64"
                        cy="64"
                        r="56"
                        stroke="currentColor"
                        strokeWidth="8"
                        fill="none"
                        strokeDasharray={`${circumference}`}
                        strokeDashoffset={`${circumference * (1 - (scoreMeta.hasScore ? clampedScore / 100 : 0))}`}
                        className={scoreMeta.colorClass}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className={cn('text-3xl font-bold tabular-nums', scoreMeta.hasScore ? 'text-foreground' : 'text-muted-foreground')}>
                        {scoreMeta.hasScore ? Math.round(clampedScore) : '—'}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-center text-sm text-muted-foreground mt-2">{scoreMeta.gradeLabel}</p>
              </div>

              {/* 设备信息 */}
              <div className="md:col-span-2 p-4 bg-card rounded-lg border border-border">
                <h3 className="text-sm font-semibold text-foreground mb-3">设备信息</h3>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="w-5 h-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">巡检设备数</span>
                  </div>
                  <div className="flex items-center gap-2 tabular-nums">
                    <span className="text-lg font-bold text-primary">{execution.completedDevices}</span>
                    <span className="text-sm text-muted-foreground">/ {execution.totalDevices}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 设备详情标签 */}
          {activeTab === 'devices' && (
            <div className="space-y-3">
              {isLoading ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Loader2 className="w-10 h-10 mx-auto mb-3 animate-spin text-primary" />
                  <p>加载设备详情中...</p>
                </div>
              ) : shouldShowDetailError ? null : (
                deviceResults.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Server className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p>暂无设备巡检结果</p>
                  </div>
                ) : (
                  deviceResults.map((device) => {
                    const deviceStatus = getDeviceStatusMeta(device.status)
                    const isExpanded = expandedDevice === device.deviceId
                    return (
                      <div key={device.deviceId} className="bg-card rounded-lg border border-border overflow-hidden">
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          onClick={() => toggleDevice(device.deviceId)}
                          className="w-full px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-surface-2/70 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {isExpanded ? (
                              <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />
                            ) : (
                              <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                            )}
                            <Server className="w-5 h-5 text-primary shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium text-foreground truncate">{device.deviceName}</p>
                              <p className="text-sm text-muted-foreground tabular-nums truncate">
                                {device.deviceIp || `设备ID: ${device.deviceId}`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right tabular-nums">
                              <p className="text-sm font-medium text-foreground">评分: {formatDeviceScore(device.score)}</p>
                              <p className="text-xs text-muted-foreground">
                                {device.passedChecks ?? 0}/{device.totalChecks ?? 0} 通过
                              </p>
                            </div>
                            <Badge variant={deviceStatus.badgeVariant} size="sm">
                              {deviceStatus.label}
                            </Badge>
                          </div>
                        </button>

                        {/* 展开的检查项列表 */}
                        {isExpanded && device.checkResults && (
                          <div className="border-t border-border bg-surface-2/40">
                            <div className="p-4 space-y-2">
                              {device.checkResults.map((check, index) => {
                                const checkStatus = checkStatusConfig[check.status] || checkStatusConfig.skip
                                const formattedActual = formatCheckValue(check.actualValue)
                                const formattedExpected = formatCheckValue(check.expectedValue)
                                return (
                                  <div
                                    key={check.checkItemId || index}
                                    className="bg-card rounded-lg p-3 border border-border hover:border-primary/40 transition-colors"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex items-start gap-2 flex-1 min-w-0">
                                        <div className={cn('mt-0.5 shrink-0', checkStatus.color)}>{checkStatus.icon}</div>
                                        <div className="flex-1 min-w-0">
                                          <p className="font-medium text-foreground text-sm">{check.checkItemName}</p>
                                          {check.message && (
                                            <p className="text-xs text-muted-foreground mt-1">{formatMessage(check.message)}</p>
                                          )}
                                          {(formattedExpected || formattedActual) && (
                                            <div className="flex flex-wrap gap-4 mt-2 text-xs">
                                              {formattedActual && (
                                                <div>
                                                  <span className="text-muted-foreground">
                                                    {getActualValueLabel(check.checkItemName)}:{' '}
                                                  </span>
                                                  <span className="text-foreground font-medium">{formattedActual}</span>
                                                </div>
                                              )}
                                              {formattedExpected && (
                                                <div>
                                                  <span className="text-muted-foreground">参考标准: </span>
                                                  <span className="text-muted-foreground">{formattedExpected}</span>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                          {check.details?.kind === 'interface_utilization' ? (
                                            <InterfaceUtilizationTable details={check.details} />
                                          ) : (
                                            check.details && <CheckDetailTables details={check.details} />
                                          )}
                                        </div>
                                      </div>
                                      <Badge variant={checkStatus.variant} size="sm" className="shrink-0">
                                        {checkStatus.label}
                                      </Badge>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })
                )
              )}
            </div>
          )}

          {/* 检查项标签 */}
          {activeTab === 'checks' && (
            <div className="space-y-3">
              {isLoading ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Loader2 className="w-10 h-10 mx-auto mb-3 animate-spin text-primary" />
                  <p>加载检查项结果中...</p>
                </div>
              ) : shouldShowDetailError ? null : (
                deviceResults.length === 0 || allChecks.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Activity className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p>暂无检查项结果</p>
                  </div>
                ) : (
                  <>
                    {/* 检查项状态快捷筛选条 */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                      <div
                        role="group"
                        aria-label="检查项状态筛选"
                        className="inline-flex h-8 items-center rounded-lg border border-border/70 bg-surface-2 p-[3px]"
                      >
                        {([
                          { key: 'all', label: `全部 (${allChecks.length})` },
                          { key: 'abnormal', label: `仅异常 (${abnormalChecksCount})` },
                          { key: 'pass', label: `通过 (${passChecksCount})` },
                        ] as const).map((item) => {
                          const isActive = checkFilter === item.key
                          return (
                            <button
                              key={item.key}
                              type="button"
                              aria-pressed={isActive}
                              onClick={() => setCheckFilter(item.key)}
                              className={cn(
                                'inline-flex h-6 items-center cursor-pointer rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors duration-150',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                                isActive
                                  ? 'bg-card text-foreground shadow-xs'
                                  : 'text-muted-foreground hover:text-foreground'
                              )}
                            >
                              {item.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {filteredChecks.length === 0 ? (
                      <div className="text-center py-10 rounded-lg border border-border bg-surface-2/40 text-sm text-muted-foreground">
                        {checkFilter === 'abnormal'
                          ? '当前无警告或失败检查项'
                          : '暂无符合条件的检查项'}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {filteredChecks.map(({ device, check, key }) => {
                          const checkStatus = checkStatusConfig[check.status] || checkStatusConfig.skip
                          const formattedActual = formatCheckValue(check.actualValue)
                          const formattedExpected = formatCheckValue(check.expectedValue)
                          return (
                            <div
                              key={key}
                              className="bg-card rounded-lg p-4 border border-border hover:border-primary/40 transition-colors"
                            >
                              <div className="flex items-center justify-between mb-2 gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className={cn('shrink-0', checkStatus.color)}>{checkStatus.icon}</div>
                                  <span className="font-medium text-foreground truncate">{check.checkItemName}</span>
                                </div>
                                <Badge variant={checkStatus.variant} size="sm" className="shrink-0">
                                  {checkStatus.label}
                                </Badge>
                              </div>
                              <div className="text-sm text-muted-foreground space-y-1">
                                <p>
                                  <span>设备: </span>
                                  <span className="text-foreground">{device.deviceName}</span>
                                </p>
                                {check.message && (
                                  <p>
                                    <span>消息: </span>
                                    {formatMessage(check.message)}
                                  </p>
                                )}
                                {(formattedActual || formattedExpected) && (
                                  <div className="flex flex-wrap gap-4 pt-2 border-t border-border/60">
                                    {formattedActual && (
                                      <div>
                                        <span>{getActualValueLabel(check.checkItemName)}: </span>
                                        <span className="font-medium text-foreground">{formattedActual}</span>
                                      </div>
                                    )}
                                    {formattedExpected && (
                                      <div>
                                        <span>参考标准: </span>
                                        <span className="text-muted-foreground">{formattedExpected}</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                                {check.details?.kind === 'interface_utilization' ? (
                                  <InterfaceUtilizationTable details={check.details} />
                                ) : (
                                  check.details && <CheckDetailTables details={check.details} />
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )
              )}
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
          {/* 导出报告按钮组 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => canExport && setShowExportMenu(!showExportMenu)}
              disabled={!canExport || generateReport.isPending}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                canExport
                  ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 cursor-pointer'
                  : 'border-border bg-surface-2 text-muted-foreground cursor-not-allowed opacity-70'
              )}
              title={!canExport ? '只有已完成的巡检才能导出报告' : '导出巡检报告'}
            >
              {generateReport.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : exportCompleted ? (
                <CheckCircle2 className="w-4 h-4 text-success" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {generateReport.isPending ? '正在导出...' : exportCompleted ? '导出完成' : '导出报告'}
              {canExport && !generateReport.isPending && (
                <ChevronDown className={cn('w-4 h-4 transition-transform', showExportMenu && 'rotate-180')} />
              )}
            </button>

            {/* 导出格式下拉菜单 */}
            <AnimatePresence>
              {showExportMenu && canExport && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-full left-0 mb-2 w-56 bg-card rounded-lg shadow-lg border border-border overflow-hidden z-50"
                >
                  <div className="p-2">
                    <p className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      选择导出格式
                    </p>
                    {reportFormats.map((format) => (
                      <button
                        key={format.value}
                        type="button"
                        onClick={() => handleExportReport(format.value)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-md cursor-pointer transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-primary/10 text-primary rounded-lg">
                          {format.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{format.label}</p>
                          <p className="text-xs text-muted-foreground truncate">{format.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 点击外部关闭菜单 */}
            {showExportMenu && (
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowExportMenu(false)}
              />
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            关闭
          </button>
        </div>
      </div>
    </SimpleModal>
  )
}
