import { useState, useEffect, useMemo, useCallback } from 'react'
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

export function useDevices() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 加载设备列表
  const loadDevices = useCallback(async (filters?: DeviceFilters) => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchDevices(filters)
      setDevices(data)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载设备失败'
      setError(errorMessage)
      // 清空设备列表，避免显示旧数据
      setDevices([])
      console.error('设备加载失败:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // 添加设备
  const addDevice = useCallback(async (deviceData: Omit<Device, 'id' | 'status' | 'last_seen' | 'uptime' | 'cpu_usage' | 'memory_usage' | 'network_traffic' | 'alert_count' | 'created_at' | 'updated_at'>): Promise<void> => {
    try {
      setLoading(true)
      const newDevice = await createDevice({
        ...deviceData,
        status: 'offline' as const,
        last_seen: '',
        uptime: ''
      })
      setDevices(prev => [newDevice, ...prev])
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '添加设备失败'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  // 删除设备
  const removeDevice = useCallback(async (deviceId: number) => {
    try {
      setLoading(true)
      await deleteDevice(deviceId)
      setDevices(prev => prev.filter(d => d.id !== deviceId))
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除设备失败')
    } finally {
      setLoading(false)
    }
  }, [])

  // 批量操作设备
  const performBulkAction = useCallback(async (action: BulkActionType, params?: BulkActionParams): Promise<BulkOperationResult> => {
    try {
      setLoading(true)
      setError(null)
      const result = await bulkDeviceAction(action, params)
      
      // 只有在操作成功时才重新加载数据
      if (result.success) {
        await loadDevices()
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
        await loadDevices()
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

  // 初始加载
  useEffect(() => {
    loadDevices()
  }, [loadDevices])

  return {
    devices,
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