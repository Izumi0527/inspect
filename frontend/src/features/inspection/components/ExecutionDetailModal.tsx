'use client'

import React, { useState, useCallback, useEffect } from 'react'
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
import { InterfaceUtilizationTable } from './InterfaceUtilizationTable'
import { CheckDetailTables } from './CheckDetailTables'
import type { InspectionExecution, ReportFormat } from '../types'

interface ExecutionDetailModalProps {
  open: boolean
  onClose: () => void
  execution: InspectionExecution | null
}

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

export const ExecutionDetailModal: React.FC<ExecutionDetailModalProps> = ({
  open,
  onClose,
  execution: initialExecution,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'devices' | 'checks'>('overview')
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null)
  const [showExportMenu, setShowExportMenu] = useState(false)
  
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

  // 重置标签页当弹窗打开时
  useEffect(() => {
    if (open) {
      setActiveTab('overview')
      setExpandedDevice(null)
    }
  }, [open])

  // 处理导出报告
  const handleExportReport = useCallback(async (format: ReportFormat) => {
    if (!execution) return
    
    setShowExportMenu(false)
    
    try {
      await generateReport.mutateAsync({
        executionId: execution.id,
        type: 'detailed',
        format,
      })
    } catch (error) {
      console.error('导出报告失败:', error)
    }
  }, [execution, generateReport])

  if (!execution) return null

  // 状态样式映射
  const statusConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    pending: { color: 'text-muted-foreground bg-gray-100 dark:bg-gray-800', icon: <Clock className="w-4 h-4" />, label: '待执行' },
    running: { color: 'text-blue-500 bg-blue-100', icon: <Activity className="w-4 h-4 animate-pulse" />, label: '执行中' },
    completed: { color: 'text-green-500 bg-green-100', icon: <CheckCircle2 className="w-4 h-4" />, label: '已完成' },
    failed: { color: 'text-red-500 bg-red-100', icon: <XCircle className="w-4 h-4" />, label: '失败' },
    cancelled: { color: 'text-orange-500 bg-orange-100', icon: <XCircle className="w-4 h-4" />, label: '已取消' },
  }

  // 检查项状态样式：color 用于图标着色，variant 决定徽标的底色+文字（保证对比度可读）
  const checkStatusConfig: Record<string, { color: string; variant: 'success' | 'warning' | 'error' | 'secondary'; icon: React.ReactNode; label: string }> = {
    pass: { color: 'text-green-600', variant: 'success', icon: <CheckCircle2 className="w-4 h-4" />, label: '通过' },
    warning: { color: 'text-yellow-600', variant: 'warning', icon: <AlertTriangle className="w-4 h-4" />, label: '警告' },
    fail: { color: 'text-red-600', variant: 'error', icon: <XCircle className="w-4 h-4" />, label: '失败' },
    skip: { color: 'text-gray-400', variant: 'secondary', icon: <Clock className="w-4 h-4" />, label: '跳过' },
    // 不适用与跳过分开呈现：前者设备天然没这个特性、无需处理，
    // 后者是该查却没查成、要跟进。用同一个标签会让运维分不清要不要动手。
    not_applicable: { color: 'text-gray-300', variant: 'secondary', icon: <MinusCircle className="w-4 h-4" />, label: '不适用' },
  }

  const currentStatus = statusConfig[execution.status] || statusConfig.pending
  
  // 是否可以导出报告（只有已完成的巡检才能导出）
  const canExport = execution.status === 'completed'
  
  // 是否正在加载详情
  const isLoading = isLoadingDetail && !detailedExecution
  const shouldShowDetailError = Boolean(detailError) && !detailedExecution
  const detailErrorMessage = detailError instanceof Error ? detailError.message : '执行详情加载失败'

  // 格式化时长
  const formatDuration = (seconds: number | undefined) => {
    if (!seconds) return '-'
    if (seconds < 60) return `${seconds}秒`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分${seconds % 60}秒`
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours}小时${minutes}分`
  }

  // 将字节数组字符串转换为可读文本
  const convertByteArrayToString = (byteArrayStr: string): string | null => {
    try {
      // 移除方括号，获取数字部分
      const byteStr = byteArrayStr.replace(/^\[|\]$/g, '').trim()
      if (!byteStr) return null
      
      // 解析数字
      const bytes = byteStr.split(/\s+/).map(b => parseInt(b, 10)).filter(b => !isNaN(b))
      if (bytes.length === 0) return null
      
      // 将字节转换为字符，过滤不可打印字符
      const chars: string[] = []
      for (const b of bytes) {
        if (b >= 32 && b < 127) {
          // 可打印 ASCII 字符
          chars.push(String.fromCharCode(b))
        } else if (b === 10 || b === 13) {
          // 换行符转为空格
          if (chars.length > 0 && chars[chars.length - 1] !== ' ') {
            chars.push(' ')
          }
        } else if (b === 9) {
          // Tab 转为空格
          chars.push(' ')
        }
        // 其他不可打印字符忽略
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
    
    // 检查是否是字节数组格式 [83 53 55 50...] 或 [83 53 55 50...（未闭合）
    if (value.startsWith('[') && /^\[\d+(\s+\d+)*/.test(value)) {
      const converted = convertByteArrayToString(value)
      if (converted) {
        return converted.length > 50 ? converted.slice(0, 50) + '...' : converted
      }
    }
    
    // 检查是否是响应时间格式（如 "12.34ms"）
    if (/^\d+(\.\d+)?ms$/i.test(value.trim())) {
      return value.trim()
    }
    
    // 普通字符串，直接返回（截断过长的内容）
    return value.length > 100 ? value.slice(0, 100) + '...' : value
  }

  // 格式化消息字段（处理包含字节数组的消息）
  const formatMessage = (message: string | undefined): string | null => {
    if (!message) return null
    
    // 检查消息中是否包含字节数组格式 [83 53 55 50...]
    // 支持未闭合的字节数组（如被截断的情况）
    const byteArrayMatch = message.match(/\[(\d+(?:\s+\d+)+)\]?/)
    if (byteArrayMatch) {
      const converted = convertByteArrayToString(byteArrayMatch[0])
      if (converted) {
        // 替换消息中的字节数组为可读字符串
        const readableInfo = converted.length > 60 ? converted.slice(0, 60) + '...' : converted
        const newMessage = message.replace(byteArrayMatch[0], readableInfo)
        return newMessage.length > 150 ? newMessage.slice(0, 150) + '...' : newMessage
      }
    }
    
    // 返回原始消息（截断过长的内容）
    return message.length > 150 ? message.slice(0, 150) + '...' : message
  }

  // 切换设备展开状态
  const toggleDevice = (deviceId: string) => {
    setExpandedDevice(expandedDevice === deviceId ? null : deviceId)
  }

  return (
    <SimpleModal open={open} onClose={onClose} size="5xl" ariaLabel={`执行详情 - ${execution.strategyName}`}>
      <div className="flex flex-col h-[80vh]">
        {/* 头部 */}
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', currentStatus.color)}>
              {currentStatus.icon}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">{execution.strategyName}</h2>
              <p className="text-sm text-muted-foreground">执行ID: {execution.id}</p>
            </div>
          </div>
          <Badge className={currentStatus.color}>{currentStatus.label}</Badge>
        </div>

        {/* 标签页 */}
        <div className="flex gap-4 mt-4 border-b border-border">
          {([
            { key: 'overview', label: '概览', icon: <FileText className="w-4 h-4" /> },
            { key: 'devices', label: '设备详情', icon: <Server className="w-4 h-4" /> },
            { key: 'checks', label: '检查项', icon: <Activity className="w-4 h-4" /> },
          ] as const).map((tab) => (
            <motion.button
              key={tab.key}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2',
                activeTab === tab.key
                  ? 'border-purple-600 text-purple-600'
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
          {shouldShowDetailError && (
            <div className="p-6 bg-red-50 rounded-lg border border-red-200">
              <div className="text-sm text-red-700">{detailErrorMessage}</div>
              <button
                type="button"
                className="mt-3 px-3 py-1.5 text-sm rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
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
            <div className="grid grid-cols-2 gap-4">
              {/* 基本信息卡片 */}
              <div className="col-span-2 p-4 bg-gradient-to-br from-teal-50 to-cyan-50 rounded-lg border border-teal-200">
                <h3 className="text-sm font-semibold text-foreground/90 mb-3">基本信息</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-xs text-muted-foreground">触发方式</span>
                    <p className="text-sm font-medium text-foreground mt-1">
                      {execution.triggerType === 'manual' ? '手动触发' : '定时触发'}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">触发用户</span>
                    <p className="text-sm font-medium text-foreground mt-1">{execution.triggerUser || '-'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">开始时间</span>
                    <p className="text-sm font-medium text-foreground mt-1">
                      {formatDateTimeYMDHMS(execution.startTime)}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">结束时间</span>
                    <p className="text-sm font-medium text-foreground mt-1">
                      {execution.endTime ? formatDateTimeYMDHMS(execution.endTime) : '-'}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">执行时长</span>
                    <p className="text-sm font-medium text-foreground mt-1">{formatDuration(execution.duration)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">执行进度</span>
                    <p className="text-sm font-medium text-foreground mt-1">{execution.progress}%</p>
                  </div>
                </div>
              </div>

              {/* 统计卡片 */}
              <div className="p-4 bg-card rounded-lg border border-border">
                <h3 className="text-sm font-semibold text-foreground/90 mb-3">检查统计</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">总检查项</span>
                    <span className="text-lg font-bold text-foreground">{execution.summary.totalChecks}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" />
                      通过
                    </span>
                    <span className="text-lg font-bold text-green-600">{execution.summary.passedChecks}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-yellow-600 flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" />
                      警告
                    </span>
                    <span className="text-lg font-bold text-yellow-600">{execution.summary.warningChecks}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-red-600 flex items-center gap-1">
                      <XCircle className="w-4 h-4" />
                      失败
                    </span>
                    <span className="text-lg font-bold text-red-600">{execution.summary.failedChecks}</span>
                  </div>
                </div>
              </div>

              {/* 评分卡片 */}
              <div className="p-4 bg-card rounded-lg border border-border">
                <h3 className="text-sm font-semibold text-foreground/90 mb-3">巡检评分</h3>
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
                        className="text-gray-200"
                      />
                      <circle
                        cx="64"
                        cy="64"
                        r="56"
                        stroke="currentColor"
                        strokeWidth="8"
                        fill="none"
                        strokeDasharray={`${2 * Math.PI * 56}`}
                        strokeDashoffset={`${2 * Math.PI * 56 * (1 - execution.summary.score / 100)}`}
                        className={cn(
                          execution.summary.score >= 80
                            ? 'text-green-500'
                            : execution.summary.score >= 60
                            ? 'text-yellow-500'
                            : 'text-red-500'
                        )}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-3xl font-bold text-foreground">
                        {Math.round(execution.summary.score)}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-center text-sm text-muted-foreground mt-2">
                  {execution.summary.score >= 80 ? '优秀' : execution.summary.score >= 60 ? '良好' : '需要改进'}
                </p>
              </div>

              {/* 设备信息 */}
              <div className="col-span-2 p-4 bg-card rounded-lg border border-border">
                <h3 className="text-sm font-semibold text-foreground/90 mb-3">设备信息</h3>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="w-5 h-5 text-gray-400" />
                    <span className="text-sm text-muted-foreground">巡检设备数</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-purple-600">{execution.completedDevices}</span>
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
                  <Loader2 className="w-12 h-12 mx-auto mb-3 animate-spin text-purple-500" />
                  <p>加载设备详情中...</p>
                </div>
              ) : shouldShowDetailError ? null : (
                execution.summary.deviceResults.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Server className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>暂无设备巡检结果</p>
                  </div>
                ) : (
                  execution.summary.deviceResults.map((device) => (
                    <div key={device.deviceId} className="bg-card rounded-lg border border-border overflow-hidden">
                      <motion.button
                        onClick={() => toggleDevice(device.deviceId)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/40/50 dark:bg-gray-800/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {expandedDevice === device.deviceId ? (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-gray-400" />
                          )}
                          <Server className="w-5 h-5 text-purple-500" />
                          <div className="text-left">
                            <p className="font-medium text-foreground">{device.deviceName}</p>
                            <p className="text-sm text-muted-foreground">{device.deviceIp || `设备ID: ${device.deviceId}`}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm font-medium text-foreground">评分: {device.score.toFixed(1)}</p>
                            <p className="text-xs text-muted-foreground">
                              {device.passedChecks}/{device.totalChecks} 通过
                            </p>
                          </div>
                          <Badge
                            className={
                              device.status === 'success'
                                ? 'bg-green-100 text-green-600'
                                : device.status === 'warning'
                                ? 'bg-yellow-100 text-yellow-600'
                                : 'bg-red-100 text-red-600'
                            }
                          >
                            {device.status}
                          </Badge>
                        </div>
                      </motion.button>

                      {/* 展开的检查项列表 */}
                      {expandedDevice === device.deviceId && device.checkResults && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="border-t border-border bg-muted/40"
                        >
                          <div className="p-4 space-y-2">
                            {device.checkResults.map((check, index) => {
                              const checkStatus = checkStatusConfig[check.status] || checkStatusConfig.skip
                              return (
                                <div
                                  key={index}
                                  className="bg-card rounded-lg p-3 border border-border hover:border-purple-200 transition-colors"
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex items-start gap-2 flex-1">
                                      <div className={cn('mt-0.5', checkStatus.color)}>{checkStatus.icon}</div>
                                      <div className="flex-1">
                                        <p className="font-medium text-foreground text-sm">{check.checkItemName}</p>
                                        {check.message && (
                                          <p className="text-xs text-muted-foreground mt-1">{formatMessage(check.message)}</p>
                                        )}
                                        {(formatCheckValue(check.expectedValue) || formatCheckValue(check.actualValue)) && (
                                          <div className="flex flex-wrap gap-4 mt-2 text-xs">
                                            {formatCheckValue(check.actualValue) && (
                                              <div>
                                                <span className="text-muted-foreground">{getActualValueLabel(check.checkItemName)}: </span>
                                                <span className="text-foreground/90 font-medium">{formatCheckValue(check.actualValue)}</span>
                                              </div>
                                            )}
                                            {formatCheckValue(check.expectedValue) && (
                                              <div>
                                                <span className="text-muted-foreground">参考标准: </span>
                                                <span className="text-foreground/70">{formatCheckValue(check.expectedValue)}</span>
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
                                    <Badge variant={checkStatus.variant} className="ml-2">{checkStatus.label}</Badge>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </motion.div>
                      )}
                    </div>
                  ))
                )
              )}
            </div>
          )}

          {/* 检查项标签 */}
          {activeTab === 'checks' && (
            <div className="space-y-2">
              {isLoading ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Loader2 className="w-12 h-12 mx-auto mb-3 animate-spin text-purple-500" />
                  <p>加载检查项结果中...</p>
                </div>
              ) : shouldShowDetailError ? null : (
                execution.summary.deviceResults.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>暂无检查项结果</p>
                  </div>
                ) : (
                  execution.summary.deviceResults.flatMap((device) =>
                    device.checkResults?.map((check, index) => {
                      const checkStatus = checkStatusConfig[check.status] || checkStatusConfig.skip
                      return (
                        <motion.div
                          key={`${device.deviceId}-${index}`}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="bg-card rounded-lg p-4 border border-border hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className={checkStatus.color}>{checkStatus.icon}</div>
                              <span className="font-medium text-foreground">{check.checkItemName}</span>
                            </div>
                            <Badge variant={checkStatus.variant}>{checkStatus.label}</Badge>
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <p>
                              <span className="text-muted-foreground">设备: </span>
                              {device.deviceName}
                            </p>
                            {check.message && (
                              <p>
                                <span className="text-muted-foreground">消息: </span>
                                {formatMessage(check.message)}
                              </p>
                            )}
                            {(formatCheckValue(check.actualValue) || formatCheckValue(check.expectedValue)) && (
                              <div className="flex flex-wrap gap-4 pt-2 border-t border-border/40">
                                {formatCheckValue(check.actualValue) && (
                                  <div>
                                    <span className="text-muted-foreground">{getActualValueLabel(check.checkItemName)}: </span>
                                    <span className="font-medium text-foreground/90">{formatCheckValue(check.actualValue)}</span>
                                  </div>
                                )}
                                {formatCheckValue(check.expectedValue) && (
                                  <div>
                                    <span className="text-muted-foreground">参考标准: </span>
                                    <span className="text-foreground/70">{formatCheckValue(check.expectedValue)}</span>
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
                        </motion.div>
                      )
                    })
                  )
                )
              )}
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
          {/* 导出报告按钮组 */}
          <div className="relative">
            <motion.button
              whileHover={{ scale: canExport ? 1.02 : 1 }}
              whileTap={{ scale: canExport ? 0.98 : 1 }}
              onClick={() => canExport && setShowExportMenu(!showExportMenu)}
              disabled={!canExport || generateReport.isPending}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                canExport
                  ? 'text-purple-600 bg-purple-50 hover:bg-purple-100'
                  : 'text-gray-400 bg-gray-100 dark:bg-gray-800 cursor-not-allowed'
              )}
              title={!canExport ? '只有已完成的巡检才能导出报告' : '导出巡检报告'}
            >
              {generateReport.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {generateReport.isPending ? '生成中...' : '导出报告'}
              {canExport && !generateReport.isPending && (
                <ChevronDown className={cn('w-4 h-4 transition-transform', showExportMenu && 'rotate-180')} />
              )}
            </motion.button>

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
                      <motion.button
                        key={format.value}
                        whileHover={{ backgroundColor: 'rgba(147, 51, 234, 0.05)' }}
                        onClick={() => handleExportReport(format.value)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-md transition-colors hover:bg-purple-50"
                      >
                        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-purple-100 text-purple-600 rounded-lg">
                          {format.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{format.label}</p>
                          <p className="text-xs text-muted-foreground truncate">{format.description}</p>
                        </div>
                      </motion.button>
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

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClose}
            className="px-6 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors"
          >
            关闭
          </motion.button>
        </div>
      </div>
    </SimpleModal>
  )
}


