import React, { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Server,
  Plus,
  Eye,
  Edit,
  Trash2,
  CheckCircle,
  Power,
  AlertTriangle,
  Upload,
  Download,
  Activity
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Badge,
  Table,
  Column,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ConfirmModal
} from '@/components/atoms'
import { AppLayout } from '@/components/layout'
import toast from 'react-hot-toast'

import { Device, DeviceStatus, DeviceType } from '../types'
import { DeviceIcon, StatusBadge, getDeviceTypeLabel } from './DeviceIcon'
import { DeviceProbeButton } from './DeviceProbeButton'
import { BulkDeviceImport } from './BulkDeviceImport'
import { AddDeviceModal } from './AddDeviceModal'
import { DeviceDetailsModal } from './DeviceDetailsModal'
import { EditDeviceModal } from './EditDeviceModal'
import { 
  useDevices, 
  useDeviceFilters, 
  useDeviceSelection
} from '../hooks/useDevices'
import { fetchDevice, fetchDeviceStats, updateDevice as updateDeviceApi, batchDeleteDevices, batchProbeDevices } from '../api/devices.api'
import type { DevicePayload } from '../utils/deviceFormMapper'

const DEVICE_STATUSES: DeviceStatus[] = ['online', 'offline', 'warning', 'maintenance']
const DEVICE_TYPES: DeviceType[] = ['switch', 'router', 'firewall', 'wireless_ap']

const isDeviceStatus = (value: unknown): value is DeviceStatus =>
  typeof value === 'string' && (DEVICE_STATUSES as string[]).includes(value)

const isDeviceType = (value: unknown): value is DeviceType =>
  typeof value === 'string' && (DEVICE_TYPES as string[]).includes(value)

const formatPercentage = (value: unknown): string => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // 如果值在 0-1 之间（小数格式），转换为百分比
    if (value >= 0 && value < 1) {
      return `${(value * 100).toFixed(1)}%`
    }
    // 如果值在 1-100 之间（已经是百分比），直接使用
    return `${value.toFixed(1)}%`
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (!Number.isNaN(parsed)) {
      // 如果值在 0-1 之间（小数格式），转换为百分比
      if (parsed >= 0 && parsed < 1) {
        return `${(parsed * 100).toFixed(1)}%`
      }
      // 如果值在 1-100 之间（已经是百分比），直接使用
      return `${parsed.toFixed(1)}%`
    }
  }
  return '-'
}

const toAlertCount = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (!Number.isNaN(parsed)) {
      return parsed
    }
  }
  return 0
}

export const DeviceManagementView: React.FC = () => {
  const searchParams = useSearchParams()
  const appliedUrlSearchRef = React.useRef(false)

  // 启用轮询：每60秒自动刷新设备数据（包括CPU和内存）
  const { devices, total, loading, error, setError, addDevice, removeDevice, importDevices, loadDevices } = useDevices(true, 60000)
  const { filters, updateFilter } = useDeviceFilters()
  const { selectedDevices, toggleDevice: _toggleDevice, selectAll: _selectAll, clearSelection, setSelectedDevices } = useDeviceSelection()

  // 统计数据（从独立API获取，不受分页影响）
  const [summary, setSummary] = React.useState({ total: 0, online: 0, offline: 0, warning: 0, totalAlerts: 0 })
  
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [deviceToDelete, setDeviceToDelete] = useState<Device | null>(null)
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [viewingDevice, setViewingDevice] = useState<Device | null>(null)
  const [editingDevice, setEditingDevice] = useState<Device | null>(null)
  const [viewModalLoading, setViewModalLoading] = useState(false)
  const [editModalLoading, setEditModalLoading] = useState(false)
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkProbing, setBulkProbing] = useState(false)
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(10)
  
  // 搜索防抖：避免每次按键都触发后端请求
  const [debouncedSearch, setDebouncedSearch] = React.useState(filters.searchQuery)
  const searchTimerRef = React.useRef<NodeJS.Timeout | null>(null)

  // 从 URL 查询参数初始化搜索词（Dashboard 顶栏搜索跳转会带上 ?search=xxx）
  React.useEffect(() => {
    if (appliedUrlSearchRef.current) return
    const initialSearch = searchParams.get('search')
    if (initialSearch) {
      updateFilter('searchQuery', initialSearch)
    }
    appliedUrlSearchRef.current = true
  }, [searchParams, updateFilter])

  React.useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(filters.searchQuery)
    }, 350)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [filters.searchQuery])

  // 当筛选条件变化时，重置到第一页
  React.useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, filters.statusFilter, filters.typeFilter])

  // 服务端分页/筛选：当筛选条件或分页变化时，请求后端
  React.useEffect(() => {
    const serverFilters: Record<string, string | number> = {
      page: currentPage,
      page_size: pageSize,
    }
    if (debouncedSearch) serverFilters.search = debouncedSearch
    if (filters.statusFilter && filters.statusFilter !== 'all') serverFilters.status = filters.statusFilter
    if (filters.typeFilter && filters.typeFilter !== 'all') serverFilters.device_type = filters.typeFilter

    loadDevices(serverFilters as unknown as import('../types').DeviceFilters)
  }, [debouncedSearch, filters.statusFilter, filters.typeFilter, currentPage, pageSize, loadDevices])

  // 获取统计数据（独立于分页）
  const loadStats = React.useCallback(async () => {
    try {
      const stats = await fetchDeviceStats()
      setSummary({
        total: Number(stats.total_devices ?? 0),
        online: Number(stats.online_devices ?? 0),
        offline: Number(stats.offline_devices ?? 0),
        warning: Number(stats.warning_devices ?? 0),
        totalAlerts: Number(stats.total_alerts ?? 0),
      })
    } catch {
      // 统计获取失败不影响主功能
    }
  }, [])

  React.useEffect(() => {
    loadStats()
  }, [loadStats])
  
  // 分页变化处理
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }
  
  // 批量删除处理
  const handleBulkDelete = () => {
    if (selectedDevices.length === 0) {
      toast.error('请先选择要删除的设备')
      return
    }
    setBulkDeleteModalOpen(true)
  }
  
  // 批量探测处理
  const handleBulkProbe = async () => {
    if (selectedDevices.length === 0) {
      toast.error('请先选择要探测的设备')
      return
    }
    
    setBulkProbing(true)
    try {
      const result = await batchProbeDevices(selectedDevices)
      const onlineCount = result.results.filter(r => r.icmp_reachable).length
      const snmpSuccessCount = result.results.filter(r => r.snmp_reachable).length
      
      toast.success(
        `批量探测完成\n探测设备: ${result.probed}台\nICMP在线: ${onlineCount}台\nSNMP成功: ${snmpSuccessCount}台`,
        { duration: 5000 }
      )
      
      // 刷新设备列表和统计以显示最新状态
      await loadDevices()
      loadStats()
      clearSelection()
    } catch (err) {
      const message = err instanceof Error ? err.message : '批量探测失败'
      toast.error(message)
    } finally {
      setBulkProbing(false)
    }
  }
  
  // 探测本页设备
  const handleProbeAll = async () => {
    if (devices.length === 0) {
      toast.error('没有可探测的设备')
      return
    }
    
    const deviceIds = devices.map(d => d.id)
    setBulkProbing(true)
    try {
      const result = await batchProbeDevices(deviceIds)
      const onlineCount = result.results.filter(r => r.icmp_reachable).length
      const snmpSuccessCount = result.results.filter(r => r.snmp_reachable).length
      
      toast.success(
        `全部探测完成\n探测设备: ${result.probed}台\nICMP在线: ${onlineCount}台\nSNMP成功: ${snmpSuccessCount}台`,
        { duration: 5000 }
      )
      
      // 刷新设备列表和统计以显示最新状态
      await loadDevices()
      loadStats()
    } catch (err) {
      const message = err instanceof Error ? err.message : '批量探测失败'
      toast.error(message)
    } finally {
      setBulkProbing(false)
    }
  }
  
  const confirmBulkDelete = async () => {
    if (selectedDevices.length === 0) return
    
    setBulkDeleting(true)
    try {
      const result = await batchDeleteDevices(selectedDevices)
      if (result.success) {
        toast.success(result.message)
        clearSelection()
        await loadDevices()
        loadStats()
      } else {
        toast.error(result.message)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '批量删除失败'
      toast.error(message)
    } finally {
      setBulkDeleting(false)
      setBulkDeleteModalOpen(false)
    }
  }

  // 设备操作处理函数
  const handleViewDevice = async (device: Device) => {
    setViewModalOpen(true)
    setViewModalLoading(true)
    try {
      const latest = await fetchDevice(device.id)
      setViewingDevice(latest ?? device)
    } catch (error) {
      console.error('查看设备详情失败:', error)
      setViewingDevice(device)
    } finally {
      setViewModalLoading(false)
    }
  }

  const handleEditDevice = async (device: Device) => {
    setEditModalOpen(true)
    setEditModalLoading(true)
    try {
      const latest = await fetchDevice(device.id)
      setEditingDevice(latest ?? device)
    } catch (error) {
      console.error('加载设备编辑数据失败:', error)
      setEditingDevice(device)
    } finally {
      setEditModalLoading(false)
    }
  }

  const handleUpdateDevice = async (deviceId: number, payload: DevicePayload) => {
    try {
      setEditModalLoading(true)
      await updateDeviceApi(deviceId, payload as Partial<Device>)
      await loadDevices()
      loadStats()
      toast.success('设备更新成功')
    } catch (error) {
      const message = error instanceof Error ? error.message : '更新设备失败'
      setError(message)
      console.error('更新设备失败:', error)
      toast.error(message)
      throw error
    } finally {
      setEditModalLoading(false)
    }
  }

  const handleDeleteDevice = (device: Device) => {
    setDeviceToDelete(device)
    setDeleteModalOpen(true)
  }

  const confirmDelete = async () => {
    if (deviceToDelete) {
      await removeDevice(deviceToDelete.id)
      setDeviceToDelete(null)
      loadStats()
    }
    setDeleteModalOpen(false)
  }

  const handleAddDevice = () => {
    setAddModalOpen(true)
  }

  const handleBulkImport = () => {
    setImportModalOpen(true)
  }

  const handleDownloadTemplate = () => {
    const BOM = '\uFEFF'  // UTF-8 BOM - 让 Excel 正确识别 UTF-8 编码
    const headerLine = '设备名称,IP地址,设备类型,厂商,位置,描述,SNMP团体字符串,SSH用户名,SSH密码'
    const sampleLines = [
      '核心交换机1,192.168.1.1,switch,cisco,数据中心A,核心网络设备,public,admin,',
      '路由器网关1,192.168.1.254,router,huawei,数据中心A,主网关路由器,public,admin,',
      '边界防火墙1,192.168.1.100,firewall,fortinet,数据中心B,边界防护设备,public,admin,'
    ]
    const csvContent = BOM + [headerLine, ...sampleLines].join('\r\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = '设备导入模板.csv'
    link.click()
  }

  // 表格列定义
  const columns: Column<Device>[] = [
    {
      key: 'name',
      title: '设备名称',
      width: '200px',
      render: (_, record) => (
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-muted/60 dark:bg-muted flex items-center justify-center">
            <DeviceIcon type={record.device_type} className="h-4 w-4 text-muted-foreground dark:text-foreground/90" />
          </div>
          <div>
            <div className="font-medium text-foreground">{record.name}</div>
            <div className="text-sm text-muted-foreground">{record.ip}</div>
          </div>
        </div>
      )
    },
    {
      key: 'device_type',
      title: '设备类型',
      width: '120px',
      render: (value) => (
        isDeviceType(value) ? getDeviceTypeLabel(value) : '-'
      )
    },
    {
      key: 'status',
      title: '状态',
      width: '140px',
      render: (_, record) => (
        <div className="flex flex-col gap-1">
          {/* 主状态 */}
          {isDeviceStatus(record.status) ? (
            <StatusBadge status={record.status} />
          ) : (
            <span className="text-muted-foreground">未知</span>
          )}
          {/* 探测状态指示器 */}
          {(record.icmp_status || record.snmp_status) && (
            <div className="flex items-center gap-1 text-xs">
              {/* ICMP状态 */}
              <span 
                className={`inline-flex items-center px-1.5 py-0.5 rounded ${
                  record.icmp_status === 'online' 
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                }`}
                title={`ICMP: ${record.icmp_status === 'online' ? '在线' : '离线'}${record.response_time ? ` (${record.response_time.toFixed(1)}ms)` : ''}`}
              >
                ICMP
              </span>
              {/* SNMP状态 */}
              <span 
                className={`inline-flex items-center px-1.5 py-0.5 rounded ${
                  record.snmp_status === 'success' 
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                    : record.snmp_status === 'not_configured'
                    ? 'bg-muted/60 text-muted-foreground dark:bg-muted dark:text-muted-foreground'
                    : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                }`}
                title={`SNMP: ${
                  record.snmp_status === 'success' ? '成功' 
                  : record.snmp_status === 'not_configured' ? '未配置'
                  : '失败'
                }`}
              >
                SNMP
              </span>
            </div>
          )}
        </div>
      )
    },
    {
      key: 'location',
      title: '位置',
      width: '150px'
    },
    {
      key: 'cpu_usage',
      title: 'CPU使用率',
      width: '120px',
      render: (value) => formatPercentage(value)
    },
    {
      key: 'memory_usage',
      title: '内存使用率',
      width: '120px',
      render: (value) => formatPercentage(value)
    },
    {
      key: 'alert_count',
      title: '告警数',
      width: '80px',
      render: (value) => {
        const count = toAlertCount(value)
        return (
          <Badge variant={count > 0 ? 'error' : 'secondary'}>
            {count}
          </Badge>
        )
      }
    },
    {
      key: 'actions',
      title: '操作',
      width: '200px',
      render: (_, record) => (
        <div className="flex items-center gap-1">
          <DeviceProbeButton
            deviceId={record.id}
            deviceName={record.name}
            size="sm"
            variant="ghost"
            onProbeComplete={() => {
              // 探测完成后刷新设备列表和统计以显示最新状态
              loadDevices()
              loadStats()
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleViewDevice(record)}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleEditDevice(record)}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleDeleteDevice(record)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )
    }
  ]

  if (error) {
    return (
      <AppLayout title="设备管理 - 错误">
        <div className="text-center py-12">
          <div className="mb-6">
            <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">无法加载设备数据</h3>
            <p className="text-muted-foreground mb-4">{error}</p>
            <div className="space-x-3">
              <Button 
                onClick={() => window.location.reload()} 
                variant="outline"
              >
                刷新页面
              </Button>
              <Button 
                onClick={() => {
                  setError(null)
                  loadDevices()
                }}
              >
                重试加载
              </Button>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            <p>可能的原因：</p>
            <ul className="mt-2 text-left inline-block">
              <li>• 后端服务未启动 (检查 http://localhost:8000)</li>
              <li>• 网络连接问题</li>
              <li>• 数据库连接失败</li>
            </ul>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout
      title="设备管理"
      alertCount={summary.totalAlerts}
    >
      <div className="flex flex-col gap-4 h-full">
        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <Server className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">总设备数</p>
                  <p className="text-2xl font-bold text-foreground">{summary.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                  <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">在线设备</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{summary.online}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                  <Power className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">离线设备</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{summary.offline}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
                  <AlertTriangle className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">告警设备</p>
                  <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{summary.warning}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                  <AlertTriangle className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">总告警数</p>
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{summary.totalAlerts}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 筛选和搜索 */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>设备列表</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleProbeAll}
                disabled={bulkProbing || devices.length === 0}
                className="flex items-center gap-2"
              >
                {bulkProbing ? (
                  <Activity className="h-4 w-4 animate-spin" />
                ) : (
                  <Activity className="h-4 w-4" />
                )}
                探测本页
              </Button>
              <Button
                variant="outline"
                onClick={handleDownloadTemplate}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                下载模板
              </Button>
              <Button
                variant="outline"
                onClick={handleBulkImport}
                className="flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                批量导入
              </Button>
              <Button onClick={handleAddDevice} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                添加设备
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col overflow-hidden">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="w-full sm:w-[300px]">
              <Input
                placeholder="搜索设备名称、IP或位置..."
                value={filters.searchQuery}
                onChange={(e) => updateFilter('searchQuery', e.target.value)}
                className="w-full"
              />
            </div>
            <Select value={filters.statusFilter} onValueChange={(value) => updateFilter('statusFilter', value)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="状态筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="online">在线</SelectItem>
                <SelectItem value="offline">离线</SelectItem>
                <SelectItem value="warning">告警</SelectItem>
                <SelectItem value="maintenance">维护</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.typeFilter} onValueChange={(value) => updateFilter('typeFilter', value)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="类型筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="switch">交换机</SelectItem>
                <SelectItem value="router">路由器</SelectItem>
                <SelectItem value="firewall">防火墙</SelectItem>
                <SelectItem value="wireless_ap">无线AP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 批量操作栏 */}
          {selectedDevices.length > 0 && (
            <div className="flex items-center gap-4 mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <span className="text-sm text-blue-700 dark:text-blue-300">
                已选择 {selectedDevices.length} 台设备
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={handleBulkProbe}
                disabled={bulkProbing}
                className="flex items-center gap-1"
              >
                {bulkProbing ? (
                  <Activity className="h-4 w-4 animate-spin" />
                ) : (
                  <Activity className="h-4 w-4" />
                )}
                批量探测
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleBulkDelete}
                className="flex items-center gap-1"
              >
                <Trash2 className="h-4 w-4" />
                批量删除
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={clearSelection}
              >
                取消选择
              </Button>
            </div>
          )}
          
          {/* 设备表格 */}
          <div className="overflow-y-auto">
            {devices.length === 0 && !loading && !error && (
              <div className="text-center py-12">
                <Server className="h-16 w-16 text-muted-foreground/80 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">暂无设备数据</h3>
                <p className="text-muted-foreground">
                  {(debouncedSearch || (filters.statusFilter !== 'all') || (filters.typeFilter !== 'all'))
                    ? "当前筛选条件下没有找到匹配的设备，请尝试调整筛选条件。"
                    : "系统中还没有添加任何设备,点击上方「添加设备」按钮开始管理您的网络设备。"
                  }
                </p>
              </div>
            )}

            {(devices.length > 0 || loading) && (
              <Table
                columns={columns}
                data={devices}
                loading={loading}
                rowKey="id"
                rowSelection={{
                  selectedRowKeys: selectedDevices,
                  onChange: (keys) => {
                    // 直接设置选中的设备ID，不需要清空再逐个添加
                    const deviceIds = keys.filter((key): key is number => typeof key === 'number')
                    setSelectedDevices(deviceIds)
                  }
                }}
                pagination={{
                  current: currentPage,
                  pageSize: pageSize,
                  total: total,
                  onChange: (page) => handlePageChange(page)
                }}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* 删除确认对话框 */}
      <ConfirmModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        title="删除设备"
        description={`确定要删除设备 "${deviceToDelete?.name}" 吗？此操作不可撤销。`}
        confirmText="删除"
        cancelText="取消"
        variant="destructive"
      />

      {/* 批量删除确认对话框 */}
      <ConfirmModal
        isOpen={bulkDeleteModalOpen}
        onClose={() => setBulkDeleteModalOpen(false)}
        onConfirm={confirmBulkDelete}
        title="批量删除设备"
        description={`确定要删除选中的 ${selectedDevices.length} 台设备吗？此操作不可撤销。`}
        confirmText={bulkDeleting ? "删除中..." : "确认删除"}
        cancelText="取消"
        variant="destructive"
      />

      <DeviceDetailsModal
        isOpen={viewModalOpen}
        onClose={() => {
          setViewModalOpen(false)
          setViewingDevice(null)
        }}
        device={viewingDevice}
        loading={viewModalLoading}
      />

      <EditDeviceModal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false)
          setEditingDevice(null)
        }}
        device={editingDevice}
        loading={editModalLoading}
        onSubmit={handleUpdateDevice}
      />

      {/* 添加设备模态框 */}
      <AddDeviceModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSubmit={async (data) => {
          await addDevice(data)
          loadStats()
        }}
        loading={loading}
      />

      {/* 批量导入模态框 */}
      <BulkDeviceImport
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImport={async (data) => {
          const result = await importDevices(data)
          if (result.success && result.imported_count > 0) {
            loadStats()
          }
          return result
        }}
      />
      </div>
    </AppLayout>
  )
}
