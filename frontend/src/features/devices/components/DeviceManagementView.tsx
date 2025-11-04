import React, { useState } from 'react'
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
  Settings2
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

import { Device, DeviceStatus, DeviceType } from '../types'
import { DeviceIcon, StatusBadge, getDeviceTypeLabel } from './DeviceIcon'
import { BulkOperationModal } from './BulkOperationModal'
import { BulkDeviceImport } from './BulkDeviceImport'
import { AddDeviceModal } from './AddDeviceModal'
import { 
  useDevices, 
  useDeviceFilters, 
  useFilteredDevices, 
  useDeviceSummary,
  useDeviceSelection 
} from '../hooks/useDevices'

const DEVICE_STATUSES: DeviceStatus[] = ['online', 'offline', 'warning', 'maintenance']
const DEVICE_TYPES: DeviceType[] = ['switch', 'router', 'firewall', 'wireless_ap']

const isDeviceStatus = (value: unknown): value is DeviceStatus =>
  typeof value === 'string' && (DEVICE_STATUSES as string[]).includes(value)

const isDeviceType = (value: unknown): value is DeviceType =>
  typeof value === 'string' && (DEVICE_TYPES as string[]).includes(value)

const formatPercentage = (value: unknown): string => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value}%`
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (!Number.isNaN(parsed)) {
      return `${parsed}%`
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
  const { devices, loading, error, setError, addDevice, removeDevice, performBulkAction, importDevices, loadDevices } = useDevices()
  const { filters, updateFilter } = useDeviceFilters()
  const filteredDevices = useFilteredDevices(devices, filters)
  const summary = useDeviceSummary(devices)
  const { selectedDevices, setSelectedDevices, clearSelection } = useDeviceSelection()
  
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [deviceToDelete, setDeviceToDelete] = useState<Device | null>(null)

  // 设备操作处理函数
  const handleViewDevice = (device: Device) => {
    console.log('查看设备:', device)
    // TODO: 导航到设备详情页面
  }

  const handleEditDevice = (device: Device) => {
    console.log('编辑设备:', device)
    // TODO: 打开编辑设备对话框
  }

  const handleDeleteDevice = (device: Device) => {
    setDeviceToDelete(device)
    setDeleteModalOpen(true)
  }

  const confirmDelete = async () => {
    if (deviceToDelete) {
      await removeDevice(deviceToDelete.id)
      setDeviceToDelete(null)
    }
    setDeleteModalOpen(false)
  }

  const handleAddDevice = () => {
    setAddModalOpen(true)
  }

  const handleBulkImport = () => {
    setImportModalOpen(true)
  }

  const handleOpenBulkModal = () => {
    setBulkModalOpen(true)
  }

  // 表格列定义
  const columns: Column<Device>[] = [
    {
      key: 'name',
      title: '设备名称',
      width: '200px',
      render: (_, record) => (
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
            <DeviceIcon type={record.device_type} className="h-4 w-4 text-gray-600" />
          </div>
          <div>
            <div className="font-medium text-gray-900">{record.name}</div>
            <div className="text-sm text-gray-500">{record.ip}</div>
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
      width: '100px',
      render: (value) => (
        isDeviceStatus(value) ? (
          <StatusBadge status={value} />
        ) : (
          <span className="text-gray-500">-</span>
        )
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
      width: '120px',
      render: (_, record) => (
        <div className="flex items-center gap-1">
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
            <h3 className="text-lg font-semibold text-gray-900 mb-2">无法加载设备数据</h3>
            <p className="text-gray-600 mb-4">{error}</p>
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
          <div className="text-sm text-gray-500">
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
      <div className="space-y-6">
        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 rounded-lg bg-blue-100">
                <Server className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">总设备数</p>
                <p className="text-2xl font-bold text-gray-900">{summary.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 rounded-lg bg-green-100">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">在线设备</p>
                <p className="text-2xl font-bold text-green-600">{summary.online}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 rounded-lg bg-red-100">
                <Power className="h-6 w-6 text-red-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">离线设备</p>
                <p className="text-2xl font-bold text-red-600">{summary.offline}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 rounded-lg bg-yellow-100">
                <AlertTriangle className="h-6 w-6 text-yellow-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">告警设备</p>
                <p className="text-2xl font-bold text-yellow-600">{summary.warning}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 rounded-lg bg-purple-100">
                <AlertTriangle className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">总告警数</p>
                <p className="text-2xl font-bold text-purple-600">{summary.totalAlerts}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 筛选和搜索 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>设备列表</CardTitle>
            <div className="flex items-center gap-2">
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
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
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

          {/* 批量操作 */}
          {selectedDevices.length > 0 && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-purple-50 rounded-lg">
              <span className="text-sm text-purple-700">
                已选择 {selectedDevices.length} 个设备
              </span>
              <div className="flex gap-2 ml-auto">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleOpenBulkModal}
                  className="flex items-center gap-1"
                >
                  <Settings2 className="h-4 w-4" />
                  批量操作
                </Button>
              </div>
            </div>
          )}

          {/* 设备表格 */}
          {filteredDevices.length === 0 && !loading && !error && (
            <div className="text-center py-12">
              <Server className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">暂无设备数据</h3>
              <p className="text-gray-600 mb-4">
                {devices.length === 0 
                  ? "系统中还没有添加任何设备，点击上方「添加设备」按钮开始管理您的网络设备。"
                  : "当前筛选条件下没有找到匹配的设备，请尝试调整筛选条件。"
                }
              </p>
              <div className="space-x-3">
                <Button onClick={handleAddDevice} className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  添加设备
                </Button>
                <Button variant="outline" onClick={handleBulkImport}>
                  <Upload className="h-4 w-4 mr-2" />
                  批量导入
                </Button>
              </div>
            </div>
          )}

          {filteredDevices.length > 0 && (
            <Table
              columns={columns}
              data={filteredDevices}
              loading={loading}
              rowSelection={{
                selectedRowKeys: selectedDevices,
                onChange: (keys) => setSelectedDevices(keys as number[])
              }}
              pagination={{
                current: 1,
                pageSize: 10,
                total: filteredDevices.length,
                onChange: (page, pageSize) => {
                  console.log('分页:', page, pageSize)
                }
              }}
            />
          )}
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

      {/* 添加设备模态框 */}
      <AddDeviceModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSubmit={addDevice}
        loading={loading}
      />

      {/* 批量操作模态框 */}
      <BulkOperationModal
        isOpen={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        selectedDevices={selectedDevices}
        devices={devices}
        onBulkAction={performBulkAction}
        onClearSelection={clearSelection}
      />

      {/* 批量导入模态框 */}
      <BulkDeviceImport
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImport={importDevices}
      />
      </div>
    </AppLayout>
  )
}