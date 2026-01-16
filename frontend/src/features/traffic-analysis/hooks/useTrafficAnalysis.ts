import { useState, useEffect } from 'react'
import { api } from '@/lib/api-client'
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

export const useTrafficAnalysis = () => {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 获取流量摘要
  const getTrafficSummary = async (
    deviceIPs?: string[], 
    hours: number = 24
  ): Promise<TrafficSummary> => {
    setIsLoading(true)
    setError(null)
    
    try {
      const params: Record<string, string | number> = { hours }
      if (deviceIPs && deviceIPs.length > 0) {
        params.device_ips = deviceIPs.join(',')
      }
      
      const data = await api.traffic.summary(params)
      return data as TrafficSummary
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '获取流量摘要失败'
      setError(errorMsg)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  // 获取设备流量
  const getDeviceTraffic = async (deviceId: number) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const data = await api.traffic.deviceTraffic(deviceId)
      return data
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '获取设备流量失败'
      setError(errorMsg)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  // 获取流量趋势
  const getTrafficTrends = async (
    deviceId: number,
    interfaceName?: string,
    startTime?: string,
    endTime?: string,
    interval: string = '1h'
  ): Promise<TrafficTrend[]> => {
    setIsLoading(true)
    setError(null)
    
    try {
      const params: Record<string, string> = { interval }
      if (interfaceName) params.interface = interfaceName
      if (startTime) params.start_time = startTime
      if (endTime) params.end_time = endTime
      
      const data = await api.traffic.trend(deviceId, params)
      return data as TrafficTrend[]
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '获取流量趋势失败'
      setError(errorMsg)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  // 获取TOP流量设备
  const getTopTalkers = async (limit: number = 10, sortBy: string = 'total_bytes') => {
    setIsLoading(true)
    setError(null)
    
    try {
      const data = await api.traffic.topTalkers(limit, sortBy)
      return data
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '获取TOP流量失败'
      setError(errorMsg)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  // 获取带宽利用率
  const getBandwidthUtilization = async (
    deviceId?: number,
    threshold?: number,
    limit?: number
  ) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const params: Record<string, number> = {}
      if (deviceId) params.device_id = deviceId
      if (threshold) params.threshold = threshold
      if (limit) params.limit = limit
      
      const data = await api.traffic.bandwidthUtilization(params)
      return data
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '获取带宽利用率失败'
      setError(errorMsg)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  // 获取TOP带宽利用率
  const getTopBandwidth = async (limit: number = 10) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const data = await api.traffic.topBandwidth(limit)
      return data
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '获取TOP带宽失败'
      setError(errorMsg)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  return {
    isLoading,
    error,
    getTrafficSummary,
    getDeviceTraffic,
    getTrafficTrends,
    getTopTalkers,
    getBandwidthUtilization,
    getTopBandwidth,
  }
}

export const useTrafficRealtime = (deviceIds: number[], intervalMs: number = 30000) => {
  const [trafficData, setTrafficData] = useState<Record<number, unknown>>({})
  const [isActive, setIsActive] = useState(false)
  const { getDeviceTraffic } = useTrafficAnalysis()

  useEffect(() => {
    if (!isActive || deviceIds.length === 0) {
      return
    }

    const collectData = async () => {
      const newData: Record<number, unknown> = {}
      
      for (const deviceId of deviceIds) {
        try {
          const metrics = await getDeviceTraffic(deviceId)
          newData[deviceId] = metrics
        } catch (error) {
          console.error(`Failed to collect data for device ${deviceId}:`, error)
        }
      }
      
      setTrafficData(newData)
    }

    // 立即执行一次
    collectData()

    // 设置定时器
    const interval = setInterval(collectData, intervalMs)

    return () => clearInterval(interval)
  }, [deviceIds, intervalMs, isActive, getDeviceTraffic])

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
