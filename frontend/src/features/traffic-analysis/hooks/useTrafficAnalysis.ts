import { useState, useEffect } from 'react'
import { TokenManager } from '@/lib/api-client'
import { 
  TrafficMetrics, 
  TrafficAnomaly, 
  TrafficTrend, 
  TrafficSummary,
  TrafficCollectionResponse,
  TrafficAnomaliesResponse,
  TrafficTrendsResponse,
  TrafficAnalysisRequest,
  TrafficFilter
} from '../types'

const API_BASE = '/api/traffic'

export const useTrafficAnalysis = () => {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const collectTrafficData = async (deviceIp: string): Promise<TrafficMetrics[]> => {
    setIsLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`${API_BASE}/collect?device_ip=${deviceIp}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TokenManager.getAccessToken() || ''}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to collect traffic data')
      }

      const data: TrafficCollectionResponse = await response.json()
      return data.metrics
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '采集流量数据失败'
      setError(errorMsg)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const getTrafficAnomalies = async (
    deviceIp?: string,
    severity?: string,
    hours: number = 24
  ): Promise<TrafficAnomaly[]> => {
    setIsLoading(true)
    setError(null)
    
    try {
      const params = new URLSearchParams({
        hours: hours.toString()
      })
      
      if (deviceIp) params.append('device_ip', deviceIp)
      if (severity) params.append('severity', severity)

      const response = await fetch(`${API_BASE}/anomalies?${params}`, {
        headers: {
          'Authorization': `Bearer ${TokenManager.getAccessToken() || ''}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to get traffic anomalies')
      }

      const data: TrafficAnomaliesResponse = await response.json()
      return data.anomalies
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '获取流量异常失败'
      setError(errorMsg)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const getTrafficTrends = async (
    deviceIp: string,
    hours: number = 24
  ): Promise<TrafficTrend[]> => {
    setIsLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`${API_BASE}/trends/${deviceIp}?hours=${hours}`, {
        headers: {
          'Authorization': `Bearer ${TokenManager.getAccessToken() || ''}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to get traffic trends')
      }

      const data: TrafficTrendsResponse = await response.json()
      return data.interface_trends
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '获取流量趋势失败'
      setError(errorMsg)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const getTrafficSummary = async (deviceIps?: string[]): Promise<TrafficSummary> => {
    setIsLoading(true)
    setError(null)
    
    try {
      const params = new URLSearchParams()
      if (deviceIps) {
        deviceIps.forEach(ip => params.append('device_ips', ip))
      }

      const response = await fetch(`${API_BASE}/summary?${params}`, {
        headers: {
          'Authorization': `Bearer ${TokenManager.getAccessToken() || ''}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to get traffic summary')
      }

      const data = await response.json()
      return data.summary
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '获取流量汇总失败'
      setError(errorMsg)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const calculateBaseline = async (deviceIp: string, interfaceName: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        device_ip: deviceIp,
        interface: interfaceName  // 修复：使用新的参数名
      })

      const response = await fetch(`${API_BASE}/baseline/calculate?${params}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TokenManager.getAccessToken() || ''}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to calculate baseline')
      }

      return await response.json()
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '计算基线失败'
      setError(errorMsg)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const startMonitoring = async (config: TrafficAnalysisRequest) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`${API_BASE}/monitoring/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TokenManager.getAccessToken() || ''}`
        },
        body: JSON.stringify(config)
      })

      if (!response.ok) {
        throw new Error('Failed to start monitoring')
      }

      return await response.json()
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '启动监控失败'
      setError(errorMsg)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const cleanupData = async (olderThanHours: number = 168) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`${API_BASE}/data/cleanup?older_than_hours=${olderThanHours}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${TokenManager.getAccessToken() || ''}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to cleanup data')
      }

      return await response.json()
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '清理数据失败'
      setError(errorMsg)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  return {
    isLoading,
    error,
    collectTrafficData,
    getTrafficAnomalies,
    getTrafficTrends,
    getTrafficSummary,
    calculateBaseline,
    startMonitoring,
    cleanupData
  }
}

export const useTrafficRealtime = (deviceIps: string[], intervalMs: number = 30000) => {
  const [trafficData, setTrafficData] = useState<Record<string, TrafficMetrics[]>>({})
  const [isActive, setIsActive] = useState(false)
  const { collectTrafficData } = useTrafficAnalysis()

  useEffect(() => {
    if (!isActive || deviceIps.length === 0) {
      return
    }

    const collectData = async () => {
      const newData: Record<string, TrafficMetrics[]> = {}
      
      for (const deviceIp of deviceIps) {
        try {
          const metrics = await collectTrafficData(deviceIp)
          newData[deviceIp] = metrics
        } catch (error) {
          console.error(`Failed to collect data for ${deviceIp}:`, error)
        }
      }
      
      setTrafficData(newData)
    }

    // 立即执行一次
    collectData()

    // 设置定时器
    const interval = setInterval(collectData, intervalMs)

    return () => clearInterval(interval)
  }, [deviceIps, intervalMs, isActive, collectTrafficData])

  const startRealtime = () => setIsActive(true)
  const stopRealtime = () => setIsActive(false)

  return {
    trafficData,
    isActive,
    startRealtime,
    stopRealtime
  }
}

export const useTrafficFilter = () => {
  const [filter, setFilter] = useState<TrafficFilter>({
    time_range: {
      start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      end: new Date().toISOString()
    }
  })

  const updateFilter = (updates: Partial<TrafficFilter>) => {
    setFilter(prev => ({ ...prev, ...updates }))
  }

  const resetFilter = () => {
    setFilter({
      time_range: {
        start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        end: new Date().toISOString()
      }
    })
  }

  return {
    filter,
    updateFilter,
    resetFilter
  }
}