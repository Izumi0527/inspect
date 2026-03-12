import { useState, useEffect, useCallback, useRef } from 'react'
import { ApiClientError } from '@/lib/api-client'
import { 
  Device, 
  DeviceListQuery, 
  DeviceUIFilters, 
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
  const [error, setErrorMessage] = useState<string | null>(null)
  const [errorStatus, setErrorStatus] = useState<number | null>(null)
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null)
  // 保存最近一次请求的筛选参数，用于轮询和操作后刷新
  const lastFiltersRef = useRef<DeviceListQuery | undefined>(undefined)
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

  const setError = useCallback((message: string | null, status: number | null = null) => {
    setErrorMessage(message)
    setErrorStatus(message ? status : null)
  }, [])

  // 加载设备列表
  const loadDevices = useCallback(async (filters?: DeviceListQuery, silent = false) => {
    const requestId = ++latestRequestIdRef.current

    try {
      if (!silent) {
        loadingRequestIdRef.current = requestId
        setLoading(true)
      }
      if (!silent) {
        setError(null)
      }
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
      const statusCode = err instanceof ApiClientError ? err.status : null

      if (!silent) {
        setError(errorMessage, statusCode)
        setDevices([])
        setTotal(0)
      } else {
        // 静默刷新失败不应该打断用户正在查看的数据
        console.warn('设备静默刷新失败:', err)
      }
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
      setError(null)
      await deleteDevice(deviceId)
      // 服务端分页模式：重新从后端获取当前页数据
      await loadDevices(lastFiltersRef.current)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '删除设备失败'
      setError(errorMessage, err instanceof ApiClientError ? err.status : null)
      throw err
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
    errorStatus,
    setError,
    loadDevices,
    addDevice,
    removeDevice,
    performBulkAction,
    importDevices
  }
}

export function useDeviceFilters() {
  const [filters, setFilters] = useState<DeviceUIFilters>({
    searchQuery: '',
    statusFilter: 'all',
    typeFilter: 'all'
  })

  const updateFilter = useCallback((key: keyof DeviceUIFilters, value: string) => {
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
