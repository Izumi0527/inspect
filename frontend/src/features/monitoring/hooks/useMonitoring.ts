import { useState, useEffect, useCallback, useMemo } from 'react'
import { MonitoringData, MonitoringConfig, DeviceMonitoringStatus, DeviceHealthStatus } from '../types'
import { 
  fetchMonitoringData, 
  fetchNetworkStats, 
  exportMonitoringReport 
} from '../api/monitoring.api'

// 监控数据管理hook
export function useMonitoringData() {
  const [data, setData] = useState<MonitoringData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const monitoringData = await fetchMonitoringData()
      setData(monitoringData)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载监控数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  // 刷新网络统计数据
  const refreshNetworkStats = useCallback(async () => {
    if (!data) return
    
    try {
      const networkStats = await fetchNetworkStats()
      setData(prev => prev ? { ...prev, networkStats, lastUpdate: new Date() } : null)
    } catch (err) {
      console.error('刷新网络统计失败:', err)
    }
  }, [data])

  // 初始加载
  useEffect(() => {
    loadData()
  }, [loadData])

  return {
    data,
    loading,
    error,
    loadData,
    refreshNetworkStats
  }
}

// 监控配置管理hook
export function useMonitoringConfig() {
  const [config, setConfig] = useState<MonitoringConfig>({
    autoRefresh: true,
    refreshInterval: 5000
  })

  const toggleAutoRefresh = useCallback(() => {
    setConfig(prev => ({ ...prev, autoRefresh: !prev.autoRefresh }))
  }, [])

  const setRefreshInterval = useCallback((interval: number) => {
    setConfig(prev => ({ ...prev, refreshInterval: interval }))
  }, [])

  return {
    config,
    toggleAutoRefresh,
    setRefreshInterval
  }
}

// 自动刷新hook
export function useAutoRefresh(callback: () => void, enabled: boolean, interval: number) {
  useEffect(() => {
    if (!enabled) return

    const intervalId = setInterval(callback, interval)
    return () => clearInterval(intervalId)
  }, [callback, enabled, interval])
}

// 设备状态分析hook
export function useDeviceStatusAnalysis(deviceStatus: DeviceMonitoringStatus[]) {
  return useMemo(() => {
    const total = deviceStatus.length
    const healthy = deviceStatus.filter(d => d.status === 'healthy').length
    const warning = deviceStatus.filter(d => d.status === 'warning').length
    const critical = deviceStatus.filter(d => d.status === 'critical').length

    const avgCpu = Math.round(
      deviceStatus.reduce((sum, d) => sum + d.cpu, 0) / total
    )
    const avgMemory = Math.round(
      deviceStatus.reduce((sum, d) => sum + d.memory, 0) / total
    )

    return {
      total,
      healthy,
      warning,
      critical,
      avgCpu,
      avgMemory,
      healthPercentage: Math.round((healthy / total) * 100)
    }
  }, [deviceStatus])
}

// 监控报告导出hook
export function useMonitoringExport() {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const exportReport = useCallback(async () => {
    try {
      setExporting(true)
      setError(null)
      await exportMonitoringReport({
        format: 'pdf',
        timeRange: '24h',
        includeCharts: true
      })
      // 这里可以添加成功提示
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出报告失败')
    } finally {
      setExporting(false)
    }
  }, [])

  return {
    exporting,
    error,
    exportReport
  }
}

// 状态颜色工具hook
export function useStatusColors() {
  const getStatusColor = useCallback((status: DeviceHealthStatus) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-100 text-green-800'
      case 'warning':
        return 'bg-yellow-100 text-yellow-800'
      case 'critical':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }, [])

  const getStatusText = useCallback((status: DeviceHealthStatus) => {
    switch (status) {
      case 'healthy':
        return '正常'
      case 'warning':
        return '警告'
      case 'critical':
        return '严重'
      default:
        return '未知'
    }
  }, [])

  const getPerformanceColor = useCallback((value: number) => {
    if (value > 80) return 'bg-red-500'
    if (value > 60) return 'bg-yellow-500'
    return 'bg-green-500'
  }, [])

  return {
    getStatusColor,
    getStatusText,
    getPerformanceColor
  }
}