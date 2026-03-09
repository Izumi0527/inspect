import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { 
  Device, 
  DeviceFilters, 
  DeviceSummary, 
  BulkActionType, 
  BulkActionParams,
  BulkOperationResult,
  DeviceImportData,
  ImportResult
} from '../types'
import {
  fetchDevices,
  createDevice,
  deleteDevice,
  bulkDeviceAction,
  bulkImportDevices
} from '../api/devices.api'
import type { FetchDevicesResult } from '../api/devices.api'
import type { CreateDevicePayload } from '../utils/deviceFormMapper'

export function useDevices(enablePolling = true, pollingInterval = 60000) {
  const [devices, setDevices] = useState<Device[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null)
  // 保存最近一次请求的筛选参数，用于轮询和操作后刷新
  const lastFiltersRef = useRef<DeviceFilters | undefined>(undefined)
  const latestRequestIdRef = useRef(0)
  const loadingRequestIdRef = useRef<number | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
      latestRequestIdRef.current += 1
      loadingRequestIdRef.current = null
    }
  }, [])

  // 加载设备列表
  const loadDevices = useCallback(async (filters?: DeviceFilters, silent = false) => {
    const requestId = ++latestRequestIdRef.current

    try {
      if (!silent) {
        loadingRequestIdRef.current = requestId
        setLoading(true)
      }
      setError(null)
      if (filters !== undefined) {
        lastFiltersRef.current = filters
      }
      const result: FetchDevicesResult = await fetchDevices(filters ?? lastFiltersRef.current)
      if (!isMountedRef.current || requestId !== latestRequestIdRef.current) {
        return
      }
      setDevices(result.devices)
      setTotal(result.total)
    } catch (err) {
      if (!isMountedRef.current || requestId !== latestRequestIdRef.current) {
        return
      }
      const errorMessage = err instanceof Error ? err.message : '加载设备失败'
      setError(errorMessage)
      setDevices([])
      setTotal(0)
      console.error('设备加载失败:', err)
    } finally {
      if (!silent && isMountedRef.current && loadingRequestIdRef.current === requestId) {
        loadingRequestIdRef.current = null
        setLoading(false)
      }
    }
  }, [])

  // 添加设备
  const addDevice = useCallback(async (deviceData: CreateDevicePayload): Promise<void> => {
    try {
      setLoading(true)
      await createDevice(deviceData)
      // 服务端分页模式：重新从后端获取当前页数据
      await loadDevices(lastFiltersRef.current)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '添加设备失败'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [loadDevices])

  // 删除设备
  const removeDevice = useCallback(async (deviceId: number) => {
    try {
      setLoading(true)
      await deleteDevice(deviceId)
      // 服务端分页模式：重新从后端获取当前页数据
      await loadDevices(lastFiltersRef.current)
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除设备失败')
    } finally {
      setLoading(false)
    }
  }, [loadDevices])

  // 批量操作设备
  const performBulkAction = useCallback(async (action: BulkActionType, params?: BulkActionParams): Promise<BulkOperationResult> => {
    try {
      setLoading(true)
      setError(null)
      const result = await bulkDeviceAction(action, params)
      
      // 只有在操作成功时才重新加载数据
      if (result.success) {
        await loadDevices(lastFiltersRef.current)
      }
      
      return result
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '批量操作失败'
      setError(errorMessage)
      console.error('批量操作失败:', err)
      return {
        success: false,
        processed_count: 0,
        failed_count: 0,
        errors: [{ error: errorMessage }],
        message: errorMessage
      }
    } finally {
      setLoading(false)
    }
  }, [loadDevices])

  // 批量导入设备
  const importDevices = useCallback(async (devices: DeviceImportData[]): Promise<ImportResult> => {
    try {
      setLoading(true)
      setError(null)
      const result = await bulkImportDevices(devices)
      
      // 只有在导入成功时才重新加载数据
      if (result.success && result.imported_count > 0) {
        await loadDevices(lastFiltersRef.current)
      }
      
      return result
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '设备导入失败'
      setError(errorMessage)
      console.error('设备导入失败:', err)
      return {
        success: false,
        imported_count: 0,
        skipped_count: 0,
        errors: [{ row: 0, data: devices[0], error: errorMessage }],
        message: errorMessage
      }
    } finally {
      setLoading(false)
    }
  }, [loadDevices])

  // 轮询机制：定期刷新设备数据
  useEffect(() => {
    if (!enablePolling || pollingInterval <= 0) {
      return
    }

    // 清除之前的定时器
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current)
    }

    // 设置新的定时器（静默刷新，不显示加载状态，使用上次的筛选参数）
    pollingTimerRef.current = setInterval(() => {
      loadDevices(lastFiltersRef.current, true)
    }, pollingInterval)

    // 清理函数
    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current)
        pollingTimerRef.current = null
      }
    }
  }, [enablePolling, pollingInterval, loadDevices])

  return {
    devices,
    total,
    loading,
    error,
    setError,
    loadDevices,
    addDevice,
    removeDevice,
    performBulkAction,
    importDevices
  }
}

export function useDeviceFilters() {
  const [filters, setFilters] = useState<DeviceFilters>({
    searchQuery: '',
    statusFilter: 'all',
    typeFilter: 'all'
  })

  const updateFilter = useCallback((key: keyof DeviceFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }, [])

  const resetFilters = useCallback(() => {
    setFilters({
      searchQuery: '',
      statusFilter: 'all',
      typeFilter: 'all'
    })
  }, [])

  return {
    filters,
    updateFilter,
    resetFilters
  }
}

export function useFilteredDevices(devices: Device[], filters: DeviceFilters) {
  return useMemo(() => {
    return devices.filter(device => {
      const matchesSearch = device.name.toLowerCase().includes(filters.searchQuery.toLowerCase()) ||
                           device.ip.includes(filters.searchQuery) ||
                           device.location.toLowerCase().includes(filters.searchQuery.toLowerCase())
      
      const matchesStatus = filters.statusFilter === 'all' || device.status === filters.statusFilter
      const matchesType = filters.typeFilter === 'all' || device.device_type === filters.typeFilter
      
      return matchesSearch && matchesStatus && matchesType
    })
  }, [devices, filters])
}

export function useDeviceSummary(devices: Device[]): DeviceSummary {
  return useMemo(() => {
    const total = devices.length
    const online = devices.filter(d => d.status === 'online').length
    const offline = devices.filter(d => d.status === 'offline').length
    const warning = devices.filter(d => d.status === 'warning').length
    const totalAlerts = devices.reduce((sum, d) => sum + (d.alert_count || 0), 0)

    return { total, online, offline, warning, totalAlerts }
  }, [devices])
}

export function useDeviceSelection() {
  const [selectedDevices, setSelectedDevices] = useState<number[]>([])

  const selectDevice = useCallback((deviceId: number) => {
    setSelectedDevices(prev => [...prev, deviceId])
  }, [])

  const deselectDevice = useCallback((deviceId: number) => {
    setSelectedDevices(prev => prev.filter(id => id !== deviceId))
  }, [])

  const toggleDevice = useCallback((deviceId: number) => {
    setSelectedDevices(prev => 
      prev.includes(deviceId) 
        ? prev.filter(id => id !== deviceId)
        : [...prev, deviceId]
    )
  }, [])

  const selectAll = useCallback((deviceIds: number[]) => {
    setSelectedDevices(deviceIds)
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedDevices([])
  }, [])

  return {
    selectedDevices,
    selectDevice,
    deselectDevice,
    toggleDevice,
    selectAll,
    clearSelection,
    setSelectedDevices
  }
}
