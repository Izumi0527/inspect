'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  X,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Server,
  Activity,
  ChevronDown,
  ChevronRight,
  FileText,
  Download,
} from 'lucide-react'
import { SimpleModal } from '@/components/atoms/modal'
import { Badge } from '@/components/atoms/badge'
import { cn } from '@/utils/cn'
import type { InspectionExecution, DeviceInspectionResult, CheckResult } from '../types'

interface ExecutionDetailModalProps {
  open: boolean
  onClose: () => void
  execution: InspectionExecution | null
}

export const ExecutionDetailModal: React.FC<ExecutionDetailModalProps> = ({
  open,
  onClose,
  execution,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'devices' | 'checks'>('overview')
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null)

  if (!execution) return null

  // 状态样式映射
  const statusConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    pending: { color: 'text-gray-500 bg-gray-100', icon: <Clock className="w-4 h-4" />, label: '待执行' },
    running: { color: 'text-blue-500 bg-blue-100', icon: <Activity className="w-4 h-4 animate-pulse" />, label: '执行中' },
    completed: { color: 'text-green-500 bg-green-100', icon: <CheckCircle2 className="w-4 h-4" />, label: '已完成' },
    failed: { color: 'text-red-500 bg-red-100', icon: <XCircle className="w-4 h-4" />, label: '失败' },
    cancelled: { color: 'text-orange-500 bg-orange-100', icon: <XCircle className="w-4 h-4" />, label: '已取消' },
  }

  // 检查项状态样式
  const checkStatusConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    pass: { color: 'text-green-600', icon: <CheckCircle2 className="w-4 h-4" />, label: '通过' },
    warning: { color: 'text-yellow-600', icon: <AlertTriangle className="w-4 h-4" />, label: '警告' },
    fail: { color: 'text-red-600', icon: <XCircle className="w-4 h-4" />, label: '失败' },
    skip: { color: 'text-gray-400', icon: <Clock className="w-4 h-4" />, label: '跳过' },
  }

  const currentStatus = statusConfig[execution.status] || statusConfig.pending

  // 格式化时长
  const formatDuration = (seconds: number | undefined) => {
    if (!seconds) return '-'
    if (seconds < 60) return `${seconds}秒`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分${seconds % 60}秒`
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours}小时${minutes}分`
  }

  // 切换设备展开状态
  const toggleDevice = (deviceId: string) => {
    setExpandedDevice(expandedDevice === deviceId ? null : deviceId)
  }

  return (
    <SimpleModal open={open} onClose={onClose} size="5xl">
      <div className="flex flex-col h-[80vh]">
        {/* 头部 */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', currentStatus.color)}>
              {currentStatus.icon}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{execution.strategyName}</h2>
              <p className="text-sm text-gray-500">执行ID: {execution.id}</p>
            </div>
          </div>
          <Badge className={currentStatus.color}>{currentStatus.label}</Badge>
        </div>

        {/* 标签页 */}
        <div className="flex gap-4 mt-4 border-b border-gray-200">
          {[
            { key: 'overview', label: '概览', icon: <FileText className="w-4 h-4" /> },
            { key: 'devices', label: '设备详情', icon: <Server className="w-4 h-4" /> },
            { key: 'checks', label: '检查项', icon: <Activity className="w-4 h-4" /> },
          ].map((tab) => (
            <motion.button
              key={tab.key}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setActiveTab(tab.key as any)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2',
                activeTab === tab.key
                  ? 'border-purple-600 text-purple-600'
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
          {/* 概览标签 */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-2 gap-4">
              {/* 基本信息卡片 */}
              <div className="col-span-2 p-4 bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg border border-purple-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">基本信息</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-xs text-gray-500">触发方式</span>
                    <p className="text-sm font-medium text-gray-900 mt-1">
                      {execution.triggerType === 'manual' ? '手动触发' : '定时触发'}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">触发用户</span>
                    <p className="text-sm font-medium text-gray-900 mt-1">{execution.triggerUser || '-'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">开始时间</span>
                    <p className="text-sm font-medium text-gray-900 mt-1">
                      {new Date(execution.startTime).toLocaleString('zh-CN')}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">结束时间</span>
                    <p className="text-sm font-medium text-gray-900 mt-1">
                      {execution.endTime ? new Date(execution.endTime).toLocaleString('zh-CN') : '-'}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">执行时长</span>
                    <p className="text-sm font-medium text-gray-900 mt-1">{formatDuration(execution.duration)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">执行进度</span>
                    <p className="text-sm font-medium text-gray-900 mt-1">{execution.progress}%</p>
                  </div>
                </div>
              </div>

              {/* 统计卡片 */}
              <div className="p-4 bg-white rounded-lg border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">检查统计</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">总检查项</span>
                    <span className="text-lg font-bold text-gray-900">{execution.summary.totalChecks}</span>
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
              <div className="p-4 bg-white rounded-lg border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">巡检评分</h3>
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
                      <span className="text-3xl font-bold text-gray-900">
                        {Math.round(execution.summary.score)}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-center text-sm text-gray-600 mt-2">
                  {execution.summary.score >= 80 ? '优秀' : execution.summary.score >= 60 ? '良好' : '需要改进'}
                </p>
              </div>

              {/* 设备信息 */}
              <div className="col-span-2 p-4 bg-white rounded-lg border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">设备信息</h3>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="w-5 h-5 text-gray-400" />
                    <span className="text-sm text-gray-600">巡检设备数</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-purple-600">{execution.completedDevices}</span>
                    <span className="text-sm text-gray-500">/ {execution.totalDevices}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 设备详情标签 */}
          {activeTab === 'devices' && (
            <div className="space-y-3">
              {execution.summary.deviceResults.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Server className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>暂无设备巡检结果</p>
                </div>
              ) : (
                execution.summary.deviceResults.map((device) => (
                  <div key={device.deviceId} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <motion.button
                      onClick={() => toggleDevice(device.deviceId)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {expandedDevice === device.deviceId ? (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-400" />
                        )}
                        <Server className="w-5 h-5 text-purple-500" />
                        <div className="text-left">
                          <p className="font-medium text-gray-900">{device.deviceName}</p>
                          <p className="text-sm text-gray-500">{device.deviceIp || device.deviceId}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-900">评分: {device.score.toFixed(1)}</p>
                          <p className="text-xs text-gray-500">
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
                        className="border-t border-gray-200 bg-gray-50"
                      >
                        <div className="p-4 space-y-2">
                          {device.checkResults.map((check, index) => {
                            const checkStatus = checkStatusConfig[check.status] || checkStatusConfig.skip
                            return (
                              <div
                                key={index}
                                className="bg-white rounded-lg p-3 border border-gray-200 hover:border-purple-200 transition-colors"
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex items-start gap-2 flex-1">
                                    <div className={cn('mt-0.5', checkStatus.color)}>{checkStatus.icon}</div>
                                    <div className="flex-1">
                                      <p className="font-medium text-gray-900 text-sm">{check.checkItemName}</p>
                                      {check.message && (
                                        <p className="text-xs text-gray-600 mt-1">{check.message}</p>
                                      )}
                                      {(check.expectedValue || check.actualValue) && (
                                        <div className="flex gap-4 mt-2 text-xs">
                                          {check.expectedValue && (
                                            <div>
                                              <span className="text-gray-500">期望值: </span>
                                              <span className="text-gray-700 font-medium">{check.expectedValue}</span>
                                            </div>
                                          )}
                                          {check.actualValue && (
                                            <div>
                                              <span className="text-gray-500">实际值: </span>
                                              <span className="text-gray-700 font-medium">{check.actualValue}</span>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <Badge className={cn('ml-2', checkStatus.color)}>{checkStatus.label}</Badge>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </motion.div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* 检查项标签 */}
          {activeTab === 'checks' && (
            <div className="space-y-2">
              {execution.summary.deviceResults.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
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
                        className="bg-white rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className={checkStatus.color}>{checkStatus.icon}</div>
                            <span className="font-medium text-gray-900">{check.checkItemName}</span>
                          </div>
                          <Badge className={checkStatus.color}>{checkStatus.label}</Badge>
                        </div>
                        <div className="text-sm text-gray-600 space-y-1">
                          <p>
                            <span className="text-gray-500">设备: </span>
                            {device.deviceName}
                          </p>
                          {check.message && (
                            <p>
                              <span className="text-gray-500">消息: </span>
                              {check.message}
                            </p>
                          )}
                          {(check.expectedValue || check.actualValue) && (
                            <div className="flex gap-4 pt-2 border-t border-gray-100">
                              {check.expectedValue && (
                                <div>
                                  <span className="text-gray-500">期望值: </span>
                                  <span className="font-medium text-gray-700">{check.expectedValue}</span>
                                </div>
                              )}
                              {check.actualValue && (
                                <div>
                                  <span className="text-gray-500">实际值: </span>
                                  <span className="font-medium text-gray-700">{check.actualValue}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )
                  })
                )
              )}
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200 mt-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
          >
            <Download className="w-4 h-4" />
            导出报告
          </motion.button>
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
